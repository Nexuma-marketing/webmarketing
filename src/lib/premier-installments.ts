import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { computeBalanceCents } from "@/lib/plan-percentage";
import { isPremierTierPlan, ensureStripeCustomer, createAndSendStripeInvoice } from "@/lib/balance-invoice";
import { sendBalanceInvoiceAvailableEmail } from "@/lib/email";

// PROMPT2 item 5: Premier Tier's calendar-based installment schedule.
// Called from the Stripe webhook's checkout.session.completed handler,
// right after a Premier Tier $200 upfront payment is recorded for a
// property (schedulePremierInstallments), and from the admin
// "Reschedule installments" action when that first run failed
// (reschedulePremierInstallments) — both go through
// computePremierSchedule so they can never produce different numbers.
// Never gated by "Tenant signed lease" — Premier's clock starts at the
// upfront payment date, unlike Low Price/Founders/Support Tier's
// single-lump-balance flow (item 1).
//
// Property rank ("Property #1" vs "#2/#3") is the same index-into-the-
// owner's-properties-ordered-by-created_at convention already used by
// src/lib/owner-plan-display.ts's percentageForPlan/formatOwnerPlanPrice,
// so the number shown to the owner on Services/Dashboard matches the
// number actually billed here.

function addMonthsIso(date: Date, months: number): string {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

interface NewInstallmentRow {
  property_id: string;
  service_id: string;
  sequence: number;
  due_date: string;
  percentage: number;
  amount_cents: number;
  status: "scheduled";
}

export interface PremierInstallmentSummary {
  sequence: number;
  due_date: string;
  percentage: number;
  amount_cents: number;
  status: string;
}

export interface PremierScheduleResult {
  success: boolean;
  /** Set when nothing was inserted for a non-error reason. */
  skipped?: "already_scheduled" | "rank_out_of_range" | "no_balance";
  /** 0-based position among the owner's properties by created_at; null if unresolved. */
  rank: number | null;
  created: PremierInstallmentSummary[];
  error?: string;
}

interface ScheduleParams {
  propertyId: string;
  ownerId: string;
  serviceId: string;
  monthlyRentCad: number;
  upfrontPaidAt: Date;
}

/**
 * Resolves the property's rank and builds the installment rows for it.
 * Pure calculation apart from the owner-properties read — inserts
 * nothing.
 */
async function computePremierSchedule(
  params: ScheduleParams,
): Promise<{ rank: number; rows: NewInstallmentRow[]; skipped?: "rank_out_of_range" | "no_balance" }> {
  const { propertyId, ownerId, serviceId, monthlyRentCad, upfrontPaidAt } = params;

  const { data: ownerProperties } = await supabaseAdmin
    .from("properties")
    .select("id")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: true });
  const rank = (ownerProperties || []).findIndex((p) => p.id === propertyId);
  console.log("[premier-installments] Property rank resolved", { propertyId, ownerId, rank });
  if (rank === -1 || rank > 2) {
    // Matches owner-plan-display.ts's percentageForPlan: Premier Tier's
    // percentage schedule only covers an owner's first 3 properties.
    console.error("[premier-installments] Property rank out of Premier Tier's 3-property range — not scheduling", {
      propertyId,
      rank,
    });
    return { rank, rows: [], skipped: "rank_out_of_range" };
  }

  const percentage = rank === 0 ? 0.3 : 0.28;
  const balanceCents = computeBalanceCents({ monthlyRentCad, planPercentage: percentage });
  if (balanceCents <= 0) {
    console.log("[premier-installments] No balance owed after upfront — nothing to schedule", {
      propertyId,
      rank,
      monthlyRentCad,
      balanceCents,
    });
    return { rank, rows: [], skipped: "no_balance" };
  }

  const row = (sequence: number, months: number, pct: number, amountCents: number): NewInstallmentRow => ({
    property_id: propertyId,
    service_id: serviceId,
    sequence,
    due_date: addMonthsIso(upfrontPaidAt, months),
    percentage: pct,
    amount_cents: amountCents,
    status: "scheduled",
  });

  if (rank === 0) {
    // Property #1: single installment, 100% of the balance, +2 months.
    return { rank, rows: [row(1, 2, 100, balanceCents)] };
  }
  // Property #2/#3: 50% / 30% / 20% at +1 / +2 / +3 months. The third
  // installment takes the rounding remainder so the three always sum
  // exactly to balanceCents.
  const p1 = Math.round(balanceCents * 0.5);
  const p2 = Math.round(balanceCents * 0.3);
  const p3 = balanceCents - p1 - p2;
  return { rank, rows: [row(1, 1, 50, p1), row(2, 2, 30, p2), row(3, 3, 20, p3)] };
}

async function insertSchedule(
  propertyId: string,
  rank: number,
  rows: NewInstallmentRow[],
): Promise<{ created: PremierInstallmentSummary[]; error?: string }> {
  if (rows.length === 0) return { created: [] };
  const { error } = await supabaseAdmin.from("plan_installments").insert(rows);
  console.log("[premier-installments] Schedule inserted", {
    propertyId,
    rank,
    rowCount: rows.length,
    totalCents: rows.reduce((s, r) => s + r.amount_cents, 0),
    error,
  });
  if (error) {
    console.error("[premier-installments] CRITICAL: failed to insert installment schedule", {
      propertyId,
      error,
    });
    return { created: [], error: error.message };
  }
  return {
    created: rows.map(({ sequence, due_date, percentage, amount_cents, status }) => ({
      sequence,
      due_date,
      percentage,
      amount_cents,
      status,
    })),
  };
}

export async function schedulePremierInstallments(params: ScheduleParams): Promise<PremierScheduleResult> {
  const { propertyId, serviceId } = params;

  // Idempotency — a re-delivered webhook event must not double-schedule.
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("plan_installments")
    .select("id")
    .eq("property_id", propertyId)
    .eq("service_id", serviceId)
    .limit(1);
  if (existingError) {
    // Previously ignored: a failed read looked like "nothing scheduled"
    // and fell through to an insert that then failed the same way.
    console.error("[premier-installments] CRITICAL: failed to read existing schedule", {
      propertyId,
      error: existingError,
    });
    return { success: false, rank: null, created: [], error: existingError.message };
  }
  if (existing && existing.length > 0) {
    console.log("[premier-installments] Already scheduled for this property+service, skipping", {
      propertyId,
      serviceId,
    });
    return { success: true, skipped: "already_scheduled", rank: null, created: [] };
  }

  const { rank, rows, skipped } = await computePremierSchedule(params);
  if (skipped) return { success: skipped === "no_balance", skipped, rank, created: [] };

  const { created, error } = await insertSchedule(propertyId, rank, rows);
  return { success: !error, rank, created, error };
}

export interface PremierRescheduleResult extends PremierScheduleResult {
  /** HTTP-ish status for the admin route: 400 = not eligible, 404 = not found, 500 = DB failure. */
  httpStatus: number;
  upfrontPaidAt?: string;
  /** Not-yet-invoiced rows removed before re-inserting. */
  deletedCount: number;
  /** Rows left untouched because they already have an invoice or payment. */
  kept: PremierInstallmentSummary[];
}

/**
 * Admin "Reschedule installments": re-runs the webhook's schedule
 * calculation for a Premier Tier property whose first run failed (e.g.
 * the missing plan_installments grant — migration v66).
 *
 * - Refuses unless the property's active plan (most recent completed
 *   plan payment scoped to it — same rule as getPropertyPlanName) is
 *   Premier Tier.
 * - Base date is the Premier upfront payment's created_at, never "now",
 *   so due dates land where the webhook would have put them. Rank uses
 *   the same owner-properties order as the webhook.
 * - Deletes only rows still `scheduled` with no Stripe invoice. Rows
 *   that were invoiced / paid / failed (or carry a stripe_invoice_id)
 *   are never touched, and their sequence numbers are not re-created.
 */
export async function reschedulePremierInstallments(propertyId: string): Promise<PremierRescheduleResult> {
  const fail = (httpStatus: number, error: string): PremierRescheduleResult => {
    console.error("[premier-installments] Reschedule refused/failed", { propertyId, httpStatus, error });
    return { success: false, httpStatus, rank: null, created: [], deletedCount: 0, kept: [], error };
  };
  console.log("[premier-installments] Reschedule requested", { propertyId });

  const { data: property, error: propertyError } = await supabaseAdmin
    .from("properties")
    .select("id, owner_id, monthly_rent")
    .eq("id", propertyId)
    .maybeSingle();
  if (propertyError) return fail(500, `Property lookup failed: ${propertyError.message}`);
  if (!property) return fail(404, "Property not found");
  if (!property.owner_id || !property.monthly_rent) {
    return fail(400, "Property is missing owner or monthly_rent — cannot calculate installments");
  }

  // Newest first — the first plan-category payment is the active plan.
  const { data: payments, error: paymentsError } = await supabaseAdmin
    .from("payments")
    .select("service_id, payment_type, created_at")
    .eq("property_id", propertyId)
    .eq("status", "completed")
    .not("service_id", "is", null)
    .order("created_at", { ascending: false });
  if (paymentsError) return fail(500, `Payments lookup failed: ${paymentsError.message}`);

  const serviceIds = Array.from(new Set((payments ?? []).map((p) => p.service_id as string)));
  const servicesById = new Map<string, { id: string; name: string; category: string | null }>();
  if (serviceIds.length > 0) {
    const { data: services, error: servicesError } = await supabaseAdmin
      .from("services")
      .select("id, name, category")
      .in("id", serviceIds);
    if (servicesError) return fail(500, `Services lookup failed: ${servicesError.message}`);
    for (const svc of services ?? []) {
      servicesById.set(svc.id as string, {
        id: svc.id as string,
        name: svc.name as string,
        category: (svc.category as string | null) ?? null,
      });
    }
  }

  const planPayments = (payments ?? []).filter(
    (p) => servicesById.get(p.service_id as string)?.category === "plan",
  );
  const activePlan = planPayments[0] ? servicesById.get(planPayments[0].service_id as string) : undefined;
  const activePlanName = activePlan?.name ?? null;
  console.log("[premier-installments] Reschedule: active plan resolved", { propertyId, activePlanName });
  if (!activePlan || !isPremierTierPlan(activePlanName)) {
    return fail(
      400,
      activePlanName
        ? `This property is on "${activePlanName}", which is not billed in installments. Only Premier Tier properties can be rescheduled.`
        : "This property has no completed plan payment — there is no Premier Tier upfront to schedule installments from.",
    );
  }
  const serviceId = activePlan.id;

  // Oldest Premier upfront on this property = the date the webhook
  // would have used. Same payment_type filter as the webhook's trigger.
  const upfront = planPayments
    .filter((p) => p.service_id === serviceId && p.payment_type === "one_time")
    .at(-1);
  if (!upfront) return fail(400, "No completed Premier Tier $200 upfront payment found for this property.");
  const upfrontPaidAt = new Date(upfront.created_at as string);

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("plan_installments")
    .select("id, service_id, sequence, due_date, percentage, amount_cents, status, stripe_invoice_id")
    .eq("property_id", propertyId);
  if (existingError) return fail(500, `plan_installments lookup failed: ${existingError.message}`);

  const deletable = (existing ?? []).filter((r) => r.status === "scheduled" && !r.stripe_invoice_id);
  const keptRows = (existing ?? []).filter((r) => !(r.status === "scheduled" && !r.stripe_invoice_id));
  console.log("[premier-installments] Reschedule: existing rows", {
    propertyId,
    total: existing?.length ?? 0,
    deletable: deletable.length,
    kept: keptRows.map((r) => ({ sequence: r.sequence, status: r.status })),
  });

  if (deletable.length > 0) {
    // Re-states the "unbilled" condition in the DELETE itself so a row
    // the cron invoiced between the read above and now is not removed.
    const { error: deleteError } = await supabaseAdmin
      .from("plan_installments")
      .delete()
      .in("id", deletable.map((r) => r.id as string))
      .eq("status", "scheduled")
      .is("stripe_invoice_id", null);
    if (deleteError) return fail(500, `Could not remove unbilled installments: ${deleteError.message}`);
  }

  const kept: PremierInstallmentSummary[] = keptRows.map((r) => ({
    sequence: r.sequence as number,
    due_date: r.due_date as string,
    percentage: Number(r.percentage),
    amount_cents: r.amount_cents as number,
    status: r.status as string,
  }));

  const { rank, rows, skipped } = await computePremierSchedule({
    propertyId,
    ownerId: property.owner_id as string,
    serviceId,
    monthlyRentCad: Number(property.monthly_rent),
    upfrontPaidAt,
  });
  const base = { rank, deletedCount: deletable.length, kept, upfrontPaidAt: upfrontPaidAt.toISOString() };
  if (skipped === "rank_out_of_range") {
    return {
      ...base,
      success: false,
      httpStatus: 400,
      skipped,
      created: [],
      error: "Premier Tier only covers an owner's first 3 properties — this property is outside that range.",
    };
  }
  if (skipped) return { ...base, success: true, httpStatus: 200, skipped, created: [] };

  // UNIQUE (property_id, service_id, sequence): a sequence held by a
  // kept (billed) row must not be inserted again.
  const takenSequences = new Set(
    keptRows.filter((r) => r.service_id === serviceId).map((r) => r.sequence as number),
  );
  const toInsert = rows.filter((r) => !takenSequences.has(r.sequence));
  const { created, error } = await insertSchedule(propertyId, rank, toInsert);
  console.log("[premier-installments] Reschedule finished", {
    propertyId,
    rank,
    upfrontPaidAt: base.upfrontPaidAt,
    deletedCount: deletable.length,
    keptCount: kept.length,
    createdCount: created.length,
    error,
  });
  return { ...base, success: !error, httpStatus: error ? 500 : 200, created, error };
}

export interface ProcessInstallmentResult {
  installmentId: string;
  success: boolean;
  error?: string;
  sequence?: number;
  amountCents?: number;
  invoiceId?: string;
  hostedInvoiceUrl?: string | null;
  /** App (Resend) email to the owner + commercial BCC went out. Only set on success. */
  emailSent?: boolean;
  /** Row was already claimed by a concurrent run (cron vs admin button, or a double click). */
  skipped?: "already_claimed";
}

/**
 * Invoices every plan_installments row that is `scheduled` with a
 * due_date that has already arrived — moved verbatim from the daily
 * process-installments cron so the cron and the admin "Process due
 * installments" button run the exact same code. `propertyId` narrows
 * the run to one property (admin button); the cron passes nothing.
 * Never gated by "Tenant signed lease" (see header comment).
 *
 * Concurrency: before touching Stripe each row is claimed atomically
 * (UPDATE ... WHERE status='scheduled' AND stripe_invoice_id IS NULL)
 * by writing a temporary `claiming:<uuid>` marker into
 * stripe_invoice_id. Only the run whose UPDATE matched the row
 * invoices it; any concurrent run skips it. If Stripe throws, the
 * marker is cleared so the row stays a plain `scheduled` row the next
 * run can retry — it is never marked `invoiced` without a real invoice.
 */
export async function processDueInstallments(
  opts: { propertyId?: string } = {},
): Promise<{ error?: string; results: ProcessInstallmentResult[] }> {
  const { propertyId } = opts;
  const nowIso = new Date().toISOString();

  let dueQuery = supabaseAdmin
    .from("plan_installments")
    .select("id, property_id, service_id, sequence, due_date, amount_cents")
    .eq("status", "scheduled")
    .lte("due_date", nowIso);
  if (propertyId) dueQuery = dueQuery.eq("property_id", propertyId);
  const { data: dueInstallments, error: dueError } = await dueQuery;

  console.log("[balance-invoice-diag] Due installments query completed", {
    count: dueInstallments?.length ?? 0,
    error: dueError,
  });
  console.log("[premier-installments] Due installments selected", {
    propertyId: propertyId ?? "all",
    count: dueInstallments?.length ?? 0,
    error: dueError,
  });

  if (dueError) {
    return { error: dueError.message, results: [] };
  }

  const results: ProcessInstallmentResult[] = [];

  for (const installment of dueInstallments ?? []) {
    const installmentId = installment.id as string;
    const claimToken = `claiming:${randomUUID()}`;
    let invoiceCreated = false;
    try {
      const { data: claimed, error: claimError } = await supabaseAdmin
        .from("plan_installments")
        .update({ stripe_invoice_id: claimToken, updated_at: new Date().toISOString() })
        .eq("id", installmentId)
        .eq("status", "scheduled")
        .is("stripe_invoice_id", null)
        .select("id");
      if (claimError) throw new Error(`Could not claim installment: ${claimError.message}`);
      if (!claimed || claimed.length === 0) {
        console.log("[premier-installments] Installment already claimed by another run, skipping", {
          installmentId,
        });
        results.push({
          installmentId,
          success: false,
          skipped: "already_claimed",
          sequence: installment.sequence as number,
          error: "Already being invoiced by another run",
        });
        continue;
      }

      const { data: property } = await supabaseAdmin
        .from("properties")
        .select("id, owner_id, address, city, province, postal_code, country")
        .eq("id", installment.property_id as string)
        .single();
      if (!property?.owner_id) {
        throw new Error("Property or owner_id not found");
      }
      const { data: owner } = await supabaseAdmin
        .from("profiles")
        .select("id, email, full_name, stripe_customer_id")
        .eq("id", property.owner_id as string)
        .single();
      if (!owner?.email) {
        throw new Error("Owner has no email");
      }

      const stripeCustomerId = await ensureStripeCustomer({
        ownerId: owner.id as string,
        email: owner.email as string,
        name: owner.full_name as string | null,
        existingId: owner.stripe_customer_id as string | null,
        billingProperty: property,
      });

      const amountCents = installment.amount_cents as number;
      const created = await createAndSendStripeInvoice({
        stripeCustomerId,
        amountCents,
        itemDescription: `Premier Tier installment ${installment.sequence} — ${property.address}, ${property.city}`,
        invoiceDescription: `Premier Tier installment ${installment.sequence} for ${property.address}`,
        metadata: {
          kind: "plan_installment",
          installment_id: installmentId,
          property_id: property.id as string,
          owner_id: property.owner_id as string,
          sequence: String(installment.sequence),
        },
      });
      invoiceCreated = true;

      const { error: updateError } = await supabaseAdmin
        .from("plan_installments")
        .update({
          status: "invoiced",
          stripe_invoice_id: created.invoiceId,
          hosted_invoice_url: created.hostedInvoiceUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", installmentId);
      if (updateError) {
        // The invoice exists and was emailed — keep the claim marker so
        // no later run invoices this row a second time.
        console.error("[premier-installments] CRITICAL: invoice sent but row update failed — fix row manually", {
          installmentId,
          invoiceId: created.invoiceId,
          hostedInvoiceUrl: created.hostedInvoiceUrl,
          error: updateError.message,
        });
        throw new Error(`Invoice ${created.invoiceId} sent but row update failed: ${updateError.message}`);
      }

      console.log("[balance-invoice-diag] Installment invoiced", {
        installmentId,
        invoiceId: created.invoiceId,
        amountCents,
      });

      // Same app email as the lump-sum balance flow (owner + commercial
      // BCC), sent in addition to Stripe's own invoice email. Runs only
      // after the row is already `invoiced`, and never throws: a failed
      // email must not re-bill or un-bill the installment.
      let emailSent = false;
      try {
        let totalQuery = supabaseAdmin
          .from("plan_installments")
          .select("id", { count: "exact", head: true })
          .eq("property_id", property.id as string);
        totalQuery = installment.service_id
          ? totalQuery.eq("service_id", installment.service_id as string)
          : totalQuery.is("service_id", null);
        const { count: totalInstallments } = await totalQuery;
        const sent = await sendBalanceInvoiceAvailableEmail({
          to: owner.email as string,
          customerName: (owner.full_name as string) || "there",
          propertyLabel: `${property.address}, ${property.city}`,
          amountCents,
          dueDate: new Date(created.dueDateUnix * 1000).toISOString(),
          installment: {
            sequence: installment.sequence as number,
            total: totalInstallments || (installment.sequence as number),
          },
          payUrl: created.hostedInvoiceUrl,
        });
        emailSent = sent;
        if (sent) {
          console.log("[premier-installments] Installment email sent", { installmentId, to: owner.email });
        } else {
          console.error("[premier-installments] Installment email NOT sent (see payment email failed / RESEND_API_KEY)", {
            installmentId,
          });
        }
      } catch (emailErr) {
        console.error("[premier-installments] Installment email failed — invoice unaffected", {
          installmentId,
          error: emailErr instanceof Error ? emailErr.message : emailErr,
        });
      }
      results.push({
        installmentId,
        success: true,
        sequence: installment.sequence as number,
        amountCents,
        invoiceId: created.invoiceId,
        hostedInvoiceUrl: created.hostedInvoiceUrl,
        emailSent,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[balance-invoice-diag] CRITICAL: failed to invoice installment", {
        installmentId,
        error: message,
      });
      if (!invoiceCreated) {
        // No invoice was returned — release the claim so the row is a
        // plain `scheduled` row again. Matched on our own token so a
        // row we never claimed is not touched.
        const { error: releaseError } = await supabaseAdmin
          .from("plan_installments")
          .update({ stripe_invoice_id: null, updated_at: new Date().toISOString() })
          .eq("id", installmentId)
          .eq("stripe_invoice_id", claimToken);
        if (releaseError) {
          console.error("[premier-installments] CRITICAL: failed to release installment claim", {
            installmentId,
            claimToken,
            error: releaseError.message,
          });
        }
      }
      results.push({
        installmentId,
        success: false,
        error: message,
        sequence: installment.sequence as number,
        amountCents: installment.amount_cents as number,
      });
    }
  }

  return { results };
}
