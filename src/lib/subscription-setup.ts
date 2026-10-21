import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ELITE_SUB_TIERS } from "@/lib/constants";
import { sendCommercialAlertEmail } from "@/lib/email";

// BUGFIX_ELITE_PYME_SUBSCRIPTIONS.md: shared by the Stripe webhook
// (checkout.session.completed) and the daily reconcile
// (src/lib/subscription-reconcile.ts). Starts the Elite monthly
// platform-fee / PYME installment subscription with the card saved at
// checkout (payment_intent_data.setup_future_usage) and the first
// charge exactly one month after the initial payment (trial_end).
// customer.invoice_settings.default_payment_method is never touched —
// the card is the default of this subscription only, so other flows
// on the same Stripe customer (Premier, plan_balance) are unaffected.

/** payments.payment_type of the marker row written when a subscription could not be created. */
export const SUBSCRIPTION_SETUP_FAILED = "subscription_setup_failed";

export type RecurringPlan =
  | { kind: "elite"; userId: string; propertyId: string; eliteTier: string }
  | {
      kind: "pymes";
      userId: string;
      pymesPlanId: string;
      planType: string;
      installmentAmount: number;
      installmentMonths: number;
    };

export function logTag(plan: RecurringPlan): string {
  return plan.kind === "elite" ? "[elite-sub]" : "[pymes-sub]";
}

/**
 * Same day-of-month one month later (UTC), clamped to the last day of
 * a shorter month (Jan 31 → Feb 28/29). Unix seconds in and out.
 */
export function oneMonthAfter(unixSeconds: number): number {
  const d = new Date(unixSeconds * 1000);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return Math.floor(d.getTime() / 1000);
}

/** Elite tier key whose one-time fee service is `serviceName`, or null if it isn't an Elite plan. */
export function eliteTierForServiceName(serviceName: string | null | undefined): string | null {
  if (!serviceName) return null;
  const match = Object.entries(ELITE_SUB_TIERS).find(([, tier]) => tier.dbServiceName === serviceName);
  return match ? match[0] : null;
}

export function customerIdOf(session: Stripe.Checkout.Session): string | null {
  if (!session.customer) return null;
  return typeof session.customer === "string" ? session.customer : session.customer.id;
}

/**
 * The card used to pay this checkout, but only if Checkout saved it on
 * `customerId` (setup_future_usage). A card used without being saved
 * can never be attached later, so it's useless for the subscription.
 * Null when there's no PaymentIntent (e.g. a 100% promo code).
 */
export async function getSavedPaymentMethodFromSession(
  session: Stripe.Checkout.Session,
  customerId: string,
): Promise<string | null> {
  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (!paymentIntentId) return null;
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["payment_method"] });
  const pm = paymentIntent.payment_method;
  if (!pm || typeof pm === "string") return null;
  const pmCustomer = typeof pm.customer === "string" ? pm.customer : pm.customer?.id;
  return pmCustomer === customerId ? pm.id : null;
}

/**
 * Creates the Stripe Price + Subscription. `keyScope` picks the
 * idempotency keys: "v2" for the webhook (elite_sub_v2_<session> /
 * pymes_sub_v2_<session>), "reconcile" for the daily reconcile, whose
 * trial_end/payment method can differ from the webhook's attempt (Stripe
 * rejects a reused key with different parameters).
 */
export async function createRecurringSubscription(
  plan: RecurringPlan,
  args: {
    customerId: string;
    paymentMethodId: string;
    trialEnd: number;
    checkoutSessionId: string;
    keyScope: "v2" | "reconcile";
  },
): Promise<Stripe.Subscription> {
  const prefix = plan.kind === "elite" ? "elite" : "pymes";
  const unitAmount =
    plan.kind === "elite"
      ? Math.round(ELITE_SUB_TIERS[plan.eliteTier].monthlyFee * 100)
      : Math.round(plan.installmentAmount * 100);
  const productName =
    plan.kind === "elite"
      ? `Elite ${ELITE_SUB_TIERS[plan.eliteTier].name} — Monthly Platform Fee`
      : `${plan.planType} Plan — Monthly Installment`;

  const price = await stripe.prices.create(
    {
      currency: "cad",
      unit_amount: unitAmount,
      recurring: { interval: "month", interval_count: 1 },
      // Tax-exclusive so GST is added on top of each monthly charge.
      tax_behavior: "exclusive",
      product_data: { name: productName },
    },
    // Same key on the immediate retry → same Price, so the
    // subscription retry below sends identical parameters.
    { idempotencyKey: `${prefix}_price_${args.keyScope}_${args.checkoutSessionId}` },
  );

  const metadata: Record<string, string> =
    plan.kind === "elite"
      ? {
          kind: "elite_maintenance",
          user_id: plan.userId,
          property_id: plan.propertyId,
          elite_tier: plan.eliteTier,
          checkout_session_id: args.checkoutSessionId,
        }
      : {
          user_id: plan.userId,
          pymes_plan_id: plan.pymesPlanId,
          total_installments: String(plan.installmentMonths),
          checkout_session_id: args.checkoutSessionId,
        };

  // Steve 6/10 (6-2.md #51): manual GST rate when STRIPE_GST_RATE_ID is
  // set, otherwise automatic_tax — same as the checkout sessions.
  const gstRateId = process.env.STRIPE_GST_RATE_ID || null;
  return stripe.subscriptions.create(
    {
      customer: args.customerId,
      default_payment_method: args.paymentMethodId,
      // First charge one month after the initial payment, not now.
      trial_end: args.trialEnd,
      items: [{ price: price.id, ...(gstRateId ? { tax_rates: [gstRateId] } : {}) }],
      ...(gstRateId ? {} : { automatic_tax: { enabled: true } }),
      metadata,
    },
    {
      idempotencyKey:
        args.keyScope === "v2"
          ? `${prefix}_sub_v2_${args.checkoutSessionId}`
          : `${prefix}_sub_reconcile_${args.checkoutSessionId}`,
    },
  );
}

class NoSavedCardError extends Error {}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Webhook entry point. Never throws: on failure (after one immediate
 * retry) it logs CRITICAL, writes the marker payments row and alerts
 * commercial, so the rest of checkout.session.completed (lead update,
 * receipt email) always runs.
 */
export async function startSubscriptionAfterCheckout(
  plan: RecurringPlan,
  session: Stripe.Checkout.Session,
  paidAtUnix: number,
): Promise<{ ok: true; subscriptionId: string; firstChargeAt: number | null } | { ok: false; error: string }> {
  const tag = logTag(plan);
  const customerId = customerIdOf(session);
  let lastError: unknown = null;

  // Idempotency keys expire after 24h; an event re-sent from the Stripe
  // Dashboard later than that must not start a second subscription.
  if (customerId) {
    try {
      for await (const sub of stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 })) {
        if (sub.metadata?.checkout_session_id === session.id) {
          console.log(`${tag} Subscription already exists for this checkout — skipped`, {
            sessionId: session.id,
            subscriptionId: sub.id,
          });
          return { ok: true, subscriptionId: sub.id, firstChargeAt: sub.trial_end ?? null };
        }
      }
    } catch (err) {
      console.warn(`${tag} Existing-subscription check failed, continuing`, { sessionId: session.id, error: errorMessage(err) });
    }
  }

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      if (!customerId) throw new NoSavedCardError("Checkout session has no Stripe customer");
      const paymentMethodId = await getSavedPaymentMethodFromSession(session, customerId);
      if (!paymentMethodId) {
        throw new NoSavedCardError("No saved card on the checkout (no PaymentIntent, or card not saved to the customer)");
      }
      const subscription = await createRecurringSubscription(plan, {
        customerId,
        paymentMethodId,
        trialEnd: oneMonthAfter(paidAtUnix),
        checkoutSessionId: session.id,
        keyScope: "v2",
      });
      console.log(`${tag} Subscription created`, {
        sessionId: session.id,
        subscriptionId: subscription.id,
        status: subscription.status,
        firstChargeAt: new Date(oneMonthAfter(paidAtUnix) * 1000).toISOString(),
      });
      // Real first-charge date from Stripe, shown on the checkout receipt.
      return { ok: true, subscriptionId: subscription.id, firstChargeAt: subscription.trial_end ?? null };
    } catch (err) {
      lastError = err;
      // Retrying can't produce a card that isn't there.
      if (err instanceof NoSavedCardError) break;
      console.warn(`${tag} Subscription attempt ${attempt} failed`, { sessionId: session.id, error: errorMessage(err) });
    }
  }

  const message = errorMessage(lastError);
  console.error(`${tag} CRITICAL: subscription NOT created — action needed`, {
    sessionId: session.id,
    customerId,
    userId: plan.userId,
    ...(plan.kind === "elite"
      ? { propertyId: plan.propertyId, eliteTier: plan.eliteTier }
      : { pymesPlanId: plan.pymesPlanId }),
    error: message,
  });
  await flagSubscriptionSetupFailure(plan, session.id, customerId, message);
  return { ok: false, error: message };
}

/**
 * Marker row (shown in /admin/payments, hidden from the customer) +
 * alert email to commercial. A re-delivered event finds the existing
 * unresolved marker and neither duplicates it nor re-sends the alert.
 */
async function flagSubscriptionSetupFailure(
  plan: RecurringPlan,
  sessionId: string,
  customerId: string | null,
  message: string,
): Promise<void> {
  const tag = logTag(plan);
  try {
    const { data: existing } = await supabaseAdmin
      .from("payments")
      .select("id")
      .eq("stripe_session_id", sessionId)
      .eq("payment_type", SUBSCRIPTION_SETUP_FAILED)
      .limit(1)
      .maybeSingle();
    if (existing) {
      console.log(`${tag} Marker row already exists — alert not re-sent`, { sessionId });
      return;
    }
    const { error: markerError } = await supabaseAdmin.from("payments").insert({
      user_id: plan.userId,
      property_id: plan.kind === "elite" ? plan.propertyId : null,
      pymes_plan_id: plan.kind === "pymes" ? plan.pymesPlanId : null,
      stripe_session_id: sessionId,
      amount: 0,
      currency: "CAD",
      payment_type: SUBSCRIPTION_SETUP_FAILED,
      status: "failed",
    });
    if (markerError) {
      console.error(`${tag} CRITICAL: marker row insert failed`, { sessionId, error: markerError });
    }
  } catch (err) {
    console.error(`${tag} CRITICAL: marker row lookup/insert threw`, { sessionId, error: errorMessage(err) });
  }

  try {
    await sendCommercialAlertEmail({
      subject: `Action needed: ${plan.kind === "elite" ? "Elite monthly platform fee" : "PYME installment"} subscription was not created`,
      intro:
        "The initial payment was received and recorded, but the monthly subscription could not be created. The daily reconcile will retry if a saved card exists; otherwise the customer must add a card.",
      items: [await describeCase(plan, sessionId, customerId, message)],
    });
  } catch (err) {
    console.error(`${tag} CRITICAL: alert email to commercial failed`, { sessionId, error: errorMessage(err) });
  }
}

/** Human-readable fields for commercial alert emails. */
export async function describeCase(
  plan: RecurringPlan,
  sessionId: string,
  customerId: string | null,
  reason: string,
): Promise<Record<string, string>> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("full_name, email")
    .eq("id", plan.userId)
    .maybeSingle();
  const fields: Record<string, string> = {
    Customer: `${(profile?.full_name as string) || "—"} <${(profile?.email as string) || "no email"}>`,
  };
  if (plan.kind === "elite") {
    const { data: property } = await supabaseAdmin
      .from("properties")
      .select("address, city")
      .eq("id", plan.propertyId)
      .maybeSingle();
    fields.Plan = `Elite ${ELITE_SUB_TIERS[plan.eliteTier]?.name ?? plan.eliteTier} — $${ELITE_SUB_TIERS[plan.eliteTier]?.monthlyFee ?? "?"} CAD/month`;
    fields.Property = property ? `${property.address}, ${property.city}` : plan.propertyId;
    fields["Property ID"] = plan.propertyId;
  } else {
    fields.Plan = `PYME ${plan.planType} — $${plan.installmentAmount} CAD × ${plan.installmentMonths}`;
  }
  fields["Checkout session"] = sessionId;
  fields["Stripe customer"] = customerId || "—";
  fields.Reason = reason;
  return fields;
}
