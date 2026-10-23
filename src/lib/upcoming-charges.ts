import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";

// BUGFIX_CLIENT_UPCOMING_CHARGES.md: remaining PYME installments for the
// client Payment History page, read from Stripe (read-only). Server-only.
// Each upfront payment is matched to its subscription exactly, through
// subscription.metadata.checkout_session_id === payments.stripe_session_id
// (set by createRecurringSubscription in src/lib/subscription-setup.ts).
// Never throws: on any Stripe error or timeout it logs and returns [].

export interface UpcomingCharge {
  subscriptionId: string;
  planName: string;
  remainingInstallments: number;
  installmentAmount: number; // CAD, per charge (Stripe price, before tax)
  nextChargeUnix: number;
}

/** Minimal shape of the payments rows the page already loaded for this user. */
interface PaymentLike {
  payment_type?: string | null;
  status?: string | null;
  stripe_session_id?: string | null;
  stripe_subscription_id?: string | null;
  pymes_plan_id?: string | null;
  pymes_plans?: { name?: string | null } | null;
}

const STRIPE_TIMEOUT_MS = 5000;

// ─── Shared helpers (also used by src/lib/pyme-installment-report.ts) ───

/** Rejects if `work` takes longer than `ms`. */
export async function withStripeTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Stripe timeout after ${ms}ms`)), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Cancellation scheduled (customer/admin cancel set cancel_at_period_end;
 * Stripe also exposes it as cancel_at): the next charge won't happen.
 */
export function isCancellationScheduled(sub: Stripe.Subscription): boolean {
  return !!(sub.cancel_at_period_end || sub.cancel_at);
}

/** Per-charge amount in CAD from the subscription price, or null. */
export function subscriptionInstallmentAmount(sub: Stripe.Subscription): number | null {
  const unitAmount = sub.items?.data?.[0]?.price?.unit_amount;
  return unitAmount ? unitAmount / 100 : null;
}

/** metadata.total_installments, or 0 when missing/invalid. */
export function subscriptionTotalInstallments(sub: Stripe.Subscription): number {
  return parseInt(sub.metadata?.total_installments || "0", 10) || 0;
}

/**
 * Same condition as the webhook's countCompletedInstallments:
 * payment_type 'installment', status 'completed', same subscription.
 */
export function countChargedInstallments(
  payments: Pick<PaymentLike, "payment_type" | "status" | "stripe_subscription_id">[],
  subscriptionId: string,
): number {
  return payments.filter(
    (p) =>
      p.payment_type === "installment" &&
      p.status === "completed" &&
      p.stripe_subscription_id === subscriptionId,
  ).length;
}

/** trial_end if trialing; current period end if active (API 2026-03-25.dahlia: on the item). */
export function subscriptionNextChargeUnix(sub: Stripe.Subscription): number | null {
  if (sub.status === "trialing") return sub.trial_end ?? null;
  if (sub.status === "active") return sub.items?.data?.[0]?.current_period_end ?? null;
  return null;
}

export async function getUpcomingPymeCharges(
  userId: string,
  payments: PaymentLike[],
): Promise<UpcomingCharge[]> {
  // Only completed PYME upfront payments; canceled/other statuses are ignored.
  const upfronts = payments.filter(
    (p) =>
      p.payment_type === "upfront" &&
      p.status === "completed" &&
      !!p.pymes_plan_id &&
      !!p.stripe_session_id,
  );
  if (upfronts.length === 0) return [];

  try {
    // Customer id only from the signed-in user's own profile.
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) {
      console.error("[upcoming-charges] profile lookup failed", { userId, error: profileError });
      return [];
    }
    const customerId = (profile?.stripe_customer_id as string | null) ?? null;
    if (!customerId) return [];

    const sessionIds = new Set(upfronts.map((p) => p.stripe_session_id as string));
    const listSubscriptions = async () => {
      const bySession = new Map<string, Stripe.Subscription>();
      for await (const sub of stripe.subscriptions.list(
        { customer: customerId, status: "all", limit: 100 },
        { timeout: STRIPE_TIMEOUT_MS, maxNetworkRetries: 0 },
      )) {
        const cs = sub.metadata?.checkout_session_id;
        if (cs && sessionIds.has(cs)) bySession.set(cs, sub);
      }
      return bySession;
    };
    const bySession = await withStripeTimeout(listSubscriptions(), STRIPE_TIMEOUT_MS);

    const result: UpcomingCharge[] = [];
    for (const upfront of upfronts) {
      const sub = bySession.get(upfront.stripe_session_id as string);
      if (!sub) continue;
      if (sub.status !== "trialing" && sub.status !== "active") continue;
      // Cancellation scheduled: the next charge won't happen, so nothing is upcoming.
      if (isCancellationScheduled(sub)) continue;

      const installmentAmount = subscriptionInstallmentAmount(sub);
      const totalInstallments = subscriptionTotalInstallments(sub);
      if (!installmentAmount || !totalInstallments) continue;

      const charged = countChargedInstallments(payments, sub.id);
      const remaining = totalInstallments - charged;
      if (remaining <= 0) continue;

      const nextChargeUnix = subscriptionNextChargeUnix(sub);
      if (!nextChargeUnix) continue;

      result.push({
        subscriptionId: sub.id,
        planName: upfront.pymes_plans?.name || "Installment plan",
        remainingInstallments: remaining,
        installmentAmount,
        nextChargeUnix,
      });
    }
    return result;
  } catch (err) {
    console.error("[upcoming-charges] Stripe lookup failed, block hidden", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
