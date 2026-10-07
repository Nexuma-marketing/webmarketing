import { supabaseAdmin } from "@/lib/supabase/admin";
import { computeBalanceCents } from "@/lib/plan-percentage";
import { isPremierTierPlan } from "@/lib/balance-invoice";

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
