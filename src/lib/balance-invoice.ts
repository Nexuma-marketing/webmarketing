import { supabaseAdmin } from "@/lib/supabase/admin";
import { getStripeServer } from "@/lib/stripe";
import { getPlanPercentage } from "@/lib/plan-percentage";
import { getCompletedUpfrontForProperty } from "@/lib/payment-lookup";

// Steve 6/11 (6-2.md #53): residential plan % balance invoice logic
// — extracted into a library so it can be called both from the
// standalone /api/admin/properties/[id]/balance-invoice endpoint AND
// from the new explicit "Tenant signed lease" action (PROMPT2 item 1;
// this used to be triggered implicitly by the Admin `is_available`
// toggle — that trigger has been removed, see
// /api/admin/properties/route.ts PATCH). The previous server-to-server
// fetch was returning null because the cookie / internal-routing
// didn't survive the fetch round-trip; calling the function in-process
// is simpler and avoids that whole class of failure.
//
// PROMPT2 item 0: added `[balance-invoice-diag]` logging around every
// Stripe/Supabase call (mirrors the existing `[webhook-diag]` pattern in
// src/app/api/stripe/webhook/route.ts) so a run can be confirmed from
// Vercel logs without guessing. PROMPT2 item 5 also extracted the
// Stripe Customer/InvoiceItem/Invoice/finalize/send steps below into
// `ensureStripeCustomer` / `createAndSendStripeInvoice` so the new
// Premier Tier installment cron (src/lib/premier-installments.ts,
// src/app/api/cron/process-installments/route.ts) reuses this exact
// logic instead of duplicating it.

export interface BalanceInvoiceResult {
  success: boolean;
  no_balance?: boolean;
  already_issued?: boolean;
  invoice_id?: string | null;
  hosted_invoice_url?: string | null;
  amount?: number;
  currency?: string;
  plan_name?: string;
  percentage?: number;
  due_date?: string;
  message?: string;
  error?: string;
}

// Invoices use collection_method "send_invoice" (owner pays manually
// from the hosted invoice link), so the due date is expressed ONLY via
// `days_until_due`. Stripe rejects passing both `days_until_due` and
// `due_date` ("You may only specify one of these parameters") — that
// was the root cause of "Tenant signed lease" never producing a balance
// invoice. `due_date` is intentionally not sent.
const INVOICE_DAYS_UNTIL_DUE = 7;

/** Lazily creates + persists a Stripe Customer for an owner. Shared by the balance-invoice flow and the Premier installment cron. */
export async function ensureStripeCustomer(
  ownerId: string,
  email: string,
  name?: string | null,
  existingId?: string | null,
): Promise<string> {
  if (existingId) return existingId;
  const stripe = getStripeServer();
  console.log("[balance-invoice-diag] Creating Stripe customer", { ownerId, email });
  const customer = await stripe.customers.create({
    email,
    name: name || undefined,
    metadata: { user_id: ownerId },
  });
  console.log("[balance-invoice-diag] Stripe customer created", {
    ownerId,
    stripeCustomerId: customer.id,
  });
  await supabaseAdmin.from("profiles").update({ stripe_customer_id: customer.id }).eq("id", ownerId);
  return customer.id;
}

export interface CreateAndSendInvoiceParams {
  stripeCustomerId: string;
  amountCents: number;
  itemDescription: string;
  invoiceDescription: string;
  /** Stamped on both the InvoiceItem and the Invoice. Must include `kind` — the webhook branches on it. */
  metadata: Record<string, string>;
}

export interface CreateAndSendInvoiceResult {
  invoiceId: string;
  hostedInvoiceUrl: string | null;
  dueDateUnix: number;
}

/**
 * Deletes pending (not-yet-invoiced) InvoiceItems left on the customer
 * for the SAME balance/installment as `metadata` — i.e. items orphaned
 * by the old $0-invoice bug (see createAndSendStripeInvoice). Without
 * this, they'd sit on the customer and get swept into the next invoice
 * that does include pending items (e.g. an Elite subscription renewal).
 * Matched strictly on kind + property_id (+ installment_id when
 * present) so unrelated pending items are never touched.
 */
async function deleteOrphanedPendingInvoiceItems(
  stripeCustomerId: string,
  metadata: Record<string, string>,
): Promise<void> {
  if (!metadata.kind || !metadata.property_id) return;
  const stripe = getStripeServer();
  try {
    const pending = await stripe.invoiceItems.list({ customer: stripeCustomerId, pending: true, limit: 100 });
    for (const item of pending.data) {
      const m = item.metadata || {};
      const matches =
        m.kind === metadata.kind &&
        m.property_id === metadata.property_id &&
        (!metadata.installment_id || m.installment_id === metadata.installment_id);
      if (!matches) continue;
      await stripe.invoiceItems.del(item.id);
      console.log("[balance-invoice-diag] Deleted orphaned pending InvoiceItem", {
        invoiceItemId: item.id,
        amount: item.amount,
        metadata: m,
      });
    }
  } catch (err) {
    // Non-fatal: the new invoice uses pending_invoice_items_behavior
    // "exclude", so a leftover item can't leak into it.
    console.error("[balance-invoice-diag] Failed to clean up orphaned pending InvoiceItems", {
      stripeCustomerId,
      error: err instanceof Error ? err.message : err,
    });
  }
}

/**
 * Shared Stripe Customer/InvoiceItem/Invoice/finalize/send sequence.
 * PROMPT2 item 5: reused by both the lump-sum balance flow below
 * (`kind: "plan_balance"`) and the Premier Tier installment cron
 * (`kind: "plan_installment"`) rather than duplicating this logic.
 */
export async function createAndSendStripeInvoice(
  params: CreateAndSendInvoiceParams,
): Promise<CreateAndSendInvoiceResult> {
  const stripe = getStripeServer();
  // Steve 6/11: STRIPE_GST_RATE_ID must match the Stripe key mode
  // (test_mode rate with test_mode key, live with live). If they
  // mismatch Stripe will reject the lookup at invoice creation —
  // that surfaces as a thrown error from invoiceItems.create/invoices.create
  // below, which the caller's try/catch turns into a failed result.
  const gstRateId = process.env.STRIPE_GST_RATE_ID || null;

  // ROOT CAUSE of the $0 balance invoices: this used to create a
  // *pending* InvoiceItem on the customer and then call
  // invoices.create() without `pending_invoice_items_behavior`. Since
  // Stripe API version 2022-08-01 (we're on 2026-03-25.dahlia, see
  // src/lib/stripe.ts) that parameter defaults to "exclude", so the new
  // Invoice never picked up the pending item: it was finalized with
  // zero lines / $0, Stripe auto-marked it "paid", and the webhook
  // recorded a ghost $0 "completed" plan_balance payment. The item
  // stayed orphaned (pending) on the customer.
  //
  // Fix: create the draft Invoice FIRST, then attach the InvoiceItem to
  // it explicitly via `invoice: invoice.id`. `exclude` is passed
  // explicitly so no stale pending item (e.g. one orphaned by the old
  // bug) can ever be swept into this invoice.
  await deleteOrphanedPendingInvoiceItems(params.stripeCustomerId, params.metadata);

  console.log("[balance-invoice-diag] About to create Invoice", { metadata: params.metadata });
  const invoice = await stripe.invoices.create({
    customer: params.stripeCustomerId,
    collection_method: "send_invoice",
    days_until_due: INVOICE_DAYS_UNTIL_DUE,
    pending_invoice_items_behavior: "exclude",
    description: params.invoiceDescription,
    ...(gstRateId
      ? { default_tax_rates: [gstRateId] }
      : { automatic_tax: { enabled: true } }),
    metadata: params.metadata,
  });
  if (!invoice.id) throw new Error("Stripe returned an invoice without an id");
  console.log("[balance-invoice-diag] Invoice created (draft)", {
    invoiceId: invoice.id,
    customer: params.stripeCustomerId,
    collectionMethod: "send_invoice",
    daysUntilDue: INVOICE_DAYS_UNTIL_DUE,
  });

  console.log("[balance-invoice-diag] About to create InvoiceItem", {
    invoiceId: invoice.id,
    customer: params.stripeCustomerId,
    amountCents: params.amountCents,
    metadata: params.metadata,
  });
  const invoiceItem = await stripe.invoiceItems.create({
    customer: params.stripeCustomerId,
    invoice: invoice.id,
    amount: params.amountCents,
    currency: "cad",
    description: params.itemDescription,
    ...(gstRateId ? { tax_rates: [gstRateId] } : {}),
    metadata: params.metadata,
  });
  console.log("[balance-invoice-diag] InvoiceItem created and attached", {
    invoiceItemId: invoiceItem.id,
    invoiceId: invoice.id,
  });

  // Safety net: never finalize an invoice that ended up at $0 — Stripe
  // auto-marks a finalized $0 invoice as paid, which is exactly the
  // ghost-payment bug. Delete the draft and fail loudly instead.
  const draft = await stripe.invoices.retrieve(invoice.id);
  console.log("[balance-invoice-diag] Draft invoice totals before finalize", {
    invoiceId: draft.id,
    subtotal: draft.subtotal,
    total: draft.total,
    amountDue: draft.amount_due,
  });
  if (!draft.total || draft.total <= 0) {
    console.error("[balance-invoice-diag] CRITICAL: draft invoice total is $0 — deleting draft instead of finalizing", {
      invoiceId: draft.id,
      expectedAmountCents: params.amountCents,
      metadata: params.metadata,
    });
    await stripe.invoices.del(invoice.id).catch((err) => {
      console.error("[balance-invoice-diag] Failed to delete $0 draft invoice", {
        invoiceId: invoice.id,
        error: err instanceof Error ? err.message : err,
      });
    });
    throw new Error(
      `Stripe draft invoice ${invoice.id} has a $0 total (expected ${params.amountCents} cents) — not finalized`,
    );
  }

  const finalized = await stripe.invoices.finalizeInvoice(invoice.id);
  console.log("[balance-invoice-diag] Invoice finalized", {
    invoiceId: finalized.id,
    total: finalized.total,
    hostedInvoiceUrl: finalized.hosted_invoice_url,
  });
  if (finalized.id) {
    await stripe.invoices.sendInvoice(finalized.id);
    console.log("[balance-invoice-diag] Invoice sent via Stripe (Stripe's own hosted-invoice email)", {
      invoiceId: finalized.id,
    });
  }

  // Stripe computes due_date from days_until_due at finalization; fall
  // back to the same arithmetic if it's somehow absent.
  const dueDateUnix =
    finalized.due_date ?? Math.floor(Date.now() / 1000) + INVOICE_DAYS_UNTIL_DUE * 86400;

  console.log("[balance-invoice-diag] Invoice created successfully", {
    invoiceId: finalized.id,
    hostedInvoiceUrl: finalized.hosted_invoice_url,
    dueDate: new Date(dueDateUnix * 1000).toISOString(),
    kind: params.metadata.kind,
  });

  return {
    invoiceId: finalized.id ?? "",
    hostedInvoiceUrl: finalized.hosted_invoice_url ?? null,
    dueDateUnix,
  };
}

/**
 * Which plan was actually purchased for THIS property (most recent
 * completed plan-category payment scoped to property_id). Shared by
 * the "Tenant signed lease" action and the admin "Regenerate balance
 * invoice" action.
 */
export async function getPropertyPlanName(propertyId: string): Promise<string | null> {
  const { data: propertyPayments } = await supabaseAdmin
    .from("payments")
    .select("service_id, created_at")
    .eq("property_id", propertyId)
    .eq("status", "completed")
    .not("service_id", "is", null)
    .order("created_at", { ascending: false });
  for (const p of propertyPayments ?? []) {
    const { data: svc } = await supabaseAdmin
      .from("services")
      .select("name, category")
      .eq("id", p.service_id as string)
      .single();
    if (svc?.category === "plan") return svc.name as string;
  }
  return null;
}

/** Premier Tier's balance is billed in scheduled installments (cron), never as one lump-sum balance invoice. */
export function isPremierTierPlan(planName: string | null): boolean {
  return !!planName && /preferred/i.test(planName) && /premier/i.test(planName);
}

export interface GenerateBalanceInvoiceOptions {
  /**
   * Admin "Regenerate balance invoice": bypasses the "already issued"
   * idempotency guard. An existing open/uncollectible invoice is voided
   * (a draft is deleted) before a new one is issued. Never re-bills an
   * invoice that was actually paid with real money (amount_paid > 0).
   */
  regenerate?: boolean;
}

export async function generateBalanceInvoice(
  propertyId: string,
  { regenerate = false }: GenerateBalanceInvoiceOptions = {},
): Promise<BalanceInvoiceResult> {
  console.log("[balance-invoice-diag] generateBalanceInvoice called", { propertyId, regenerate });

  // 1. Property + idempotency
  const { data: property, error: propErr } = await supabaseAdmin
    .from("properties")
    .select(
      "id, owner_id, address, city, monthly_rent, service_tier, balance_invoice_id, balance_invoice_status",
    )
    .eq("id", propertyId)
    .single();
  console.log("[balance-invoice-diag] Property lookup completed", {
    propertyId,
    found: !!property,
    error: propErr,
  });
  if (propErr || !property) {
    return { success: false, error: "Property not found" };
  }
  if (!property.owner_id || !property.monthly_rent) {
    return {
      success: false,
      error: "Property is missing owner or monthly_rent — cannot calculate balance",
    };
  }
  if (
    !regenerate &&
    property.balance_invoice_id &&
    property.balance_invoice_status &&
    property.balance_invoice_status !== "paid" &&
    property.balance_invoice_status !== "voided"
  ) {
    console.log("[balance-invoice-diag] Idempotency guard hit — invoice already issued and not paid/voided", {
      propertyId,
      balance_invoice_id: property.balance_invoice_id,
      balance_invoice_status: property.balance_invoice_status,
    });
    return {
      success: true,
      already_issued: true,
      invoice_id: property.balance_invoice_id as string,
    };
  }

  // 1b. Look at the previous Stripe invoice (if any) before issuing a
  // new one. A previous invoice that was really paid (amount_paid > 0)
  // blocks re-billing in both modes. A $0 "paid" invoice (the ghost
  // from the old pending-InvoiceItem bug) or a voided one is ignored.
  if (property.balance_invoice_id) {
    const previousId = property.balance_invoice_id as string;
    const stripe = getStripeServer();
    let previous: Awaited<ReturnType<typeof stripe.invoices.retrieve>> | null = null;
    try {
      previous = await stripe.invoices.retrieve(previousId);
    } catch (err) {
      console.error("[balance-invoice-diag] Could not retrieve previous balance invoice", {
        propertyId,
        previousId,
        error: err instanceof Error ? err.message : err,
      });
    }
    console.log("[balance-invoice-diag] Previous balance invoice", {
      propertyId,
      previousId,
      status: previous?.status,
      total: previous?.total,
      amountPaid: previous?.amount_paid,
    });
    if (previous?.status === "paid" && (previous.amount_paid ?? 0) > 0) {
      return {
        success: false,
        error: `Balance invoice ${previousId} was already paid ($${((previous.amount_paid ?? 0) / 100).toFixed(2)}) — refusing to bill this property again.`,
      };
    }
    if (regenerate && previous) {
      try {
        if (previous.status === "draft") {
          await stripe.invoices.del(previousId);
          console.log("[balance-invoice-diag] Regenerate: deleted previous draft invoice", { previousId });
        } else if (previous.status === "open" || previous.status === "uncollectible") {
          await stripe.invoices.voidInvoice(previousId);
          console.log("[balance-invoice-diag] Regenerate: voided previous invoice", { previousId });
        }
      } catch (err) {
        return {
          success: false,
          error: `Could not void previous invoice ${previousId}: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }
  }

  // 2. Owner
  const { data: owner } = await supabaseAdmin
    .from("profiles")
    .select("id, email, full_name, stripe_customer_id")
    .eq("id", property.owner_id as string)
    .single();
  console.log("[balance-invoice-diag] Owner lookup completed", {
    ownerId: property.owner_id,
    hasEmail: !!owner?.email,
  });
  if (!owner?.email) {
    return { success: false, error: "Owner has no email — cannot send invoice" };
  }

  // 3. Find the owner's most recent completed plan-category payment
  const { data: planPayments } = await supabaseAdmin
    .from("payments")
    .select("service_id, created_at")
    .eq("user_id", property.owner_id as string)
    .eq("status", "completed")
    .not("service_id", "is", null)
    .order("created_at", { ascending: false });
  let planName: string | null = null;
  for (const p of planPayments ?? []) {
    const { data: svc } = await supabaseAdmin
      .from("services")
      .select("name, category")
      .eq("id", p.service_id as string)
      .single();
    if (svc?.category === "plan") {
      planName = svc.name as string;
      break;
    }
  }
  console.log("[balance-invoice-diag] Plan detection completed", { ownerId: property.owner_id, planName });
  if (!planName) {
    return {
      success: false,
      error:
        "No completed plan purchase found for this owner. Owner must pay the upfront before a balance can be invoiced.",
    };
  }

  const percentage = getPlanPercentage(planName);
  if (percentage === null) {
    return {
      success: false,
      error: `Plan "${planName}" does not use a percentage-balance model.`,
    };
  }

  const monthlyRent = Number(property.monthly_rent);
  const totalFeeCents = Math.round(monthlyRent * percentage * 100);
  // PROMPT2 item 1/8 interaction fix: don't assume a flat $200 was the
  // only thing ever paid on this property — item 8's netting can leave
  // a different (or split-across-multiple-rows) amount already paid
  // (e.g. Founders netted to $250 after a prior $200 Low Price
  // payment). Using the property's real completed-payment total instead
  // of a hardcoded upfront constant prevents re-invoicing an amount the
  // owner already covered via a plan switch.
  const { totalAmount: alreadyPaidCad } = await getCompletedUpfrontForProperty(supabaseAdmin, propertyId);
  const alreadyPaidCents = Math.round(alreadyPaidCad * 100);
  const balanceCents = Math.max(0, totalFeeCents - alreadyPaidCents);
  console.log("[balance-invoice-diag] Balance calculated", {
    propertyId,
    planName,
    percentage,
    monthlyRent,
    totalFeeCents,
    alreadyPaidCents,
    balanceCents,
  });
  if (balanceCents <= 0) {
    return {
      success: true,
      no_balance: true,
      message: `Amount already paid ($${(alreadyPaidCents / 100).toFixed(2)}) already covers the ${(percentage * 100).toFixed(0)}% total fee on rent ${monthlyRent}.`,
    };
  }

  // 4. Stripe customer (lazy create)
  const stripeCustomerId = await ensureStripeCustomer(
    owner.id as string,
    owner.email as string,
    owner.full_name as string | null,
    owner.stripe_customer_id as string | null,
  );

  // 5. InvoiceItem + Invoice + finalize + send (shared helper)
  const balanceDescription = `Balance for ${planName} — ${(percentage * 100).toFixed(0)}% of first month's rent on ${property.address}, ${property.city} (minus $${(alreadyPaidCents / 100).toFixed(2)} already paid)`;

  let created: CreateAndSendInvoiceResult;
  try {
    created = await createAndSendStripeInvoice({
      stripeCustomerId,
      amountCents: balanceCents,
      itemDescription: balanceDescription,
      invoiceDescription: `Plan balance for ${property.address}`,
      metadata: {
        property_id: propertyId,
        owner_id: property.owner_id as string,
        kind: "plan_balance",
        plan_name: planName,
        percentage: String(percentage),
        monthly_rent: String(monthlyRent),
      },
    });
  } catch (err) {
    console.error("[balance-invoice-diag] CRITICAL: Stripe invoice creation failed", {
      propertyId,
      error: err instanceof Error ? err.message : err,
    });
    return {
      success: false,
      error: err instanceof Error ? err.message : "Stripe invoice creation failed",
    };
  }

  // 6. Persist on the property row — including hosted_invoice_url,
  // which the prior version of this function computed but never
  // stored (PROMPT2 item 1's fix). Consumed by the "Pay remaining
  // balance" button in /dashboard/payments (items 2/3).
  const { error: persistError } = await supabaseAdmin
    .from("properties")
    .update({
      balance_invoice_id: created.invoiceId,
      balance_invoice_status: "open",
      balance_invoice_amount: balanceCents / 100,
      balance_invoice_sent_at: new Date().toISOString(),
      balance_invoice_url: created.hostedInvoiceUrl,
      // Clear a stale paid_at left by a previous (e.g. ghost $0) invoice.
      balance_invoice_paid_at: null,
    })
    .eq("id", propertyId);
  console.log("[balance-invoice-diag] Property row persisted", {
    propertyId,
    invoiceId: created.invoiceId,
    hostedInvoiceUrl: created.hostedInvoiceUrl,
    error: persistError,
  });
  if (persistError) {
    console.error("[balance-invoice-diag] CRITICAL: failed to persist balance invoice onto property row", {
      propertyId,
      error: persistError,
    });
  }

  return {
    success: true,
    invoice_id: created.invoiceId,
    hosted_invoice_url: created.hostedInvoiceUrl,
    amount: balanceCents / 100,
    currency: "CAD",
    plan_name: planName,
    percentage,
    due_date: new Date(created.dueDateUnix * 1000).toISOString(),
  };
}
