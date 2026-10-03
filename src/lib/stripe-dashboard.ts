// Deep links into the Stripe Dashboard for internal (admin/commercial)
// use — refund request emails and /admin/payments.
//
// ⚠️ GOING LIVE: change STRIPE_DASHBOARD_BASE_URL below to
// "https://dashboard.stripe.com" (drop the "/test" segment). This is the
// ONLY place the test/live prefix lives.
export const STRIPE_DASHBOARD_BASE_URL = "https://dashboard.stripe.com/test";

/**
 * Best direct link to a payment row's Stripe object:
 * - PaymentIntent → /payments/{pi_…} (where Refund lives)
 * - Invoice (plan_balance / plan_installment rows store the invoice id
 *   in stripe_session_id and have no PaymentIntent) → /invoices/{in_…}
 * - Anything else (e.g. a Checkout Session id) → Dashboard search
 */
export function stripeDashboardPaymentUrl(row: {
  stripe_payment_intent_id?: string | null;
  stripe_session_id?: string | null;
}): string | null {
  if (row.stripe_payment_intent_id) {
    return `${STRIPE_DASHBOARD_BASE_URL}/payments/${encodeURIComponent(row.stripe_payment_intent_id)}`;
  }
  const sessionId = row.stripe_session_id;
  if (!sessionId) return null;
  if (sessionId.startsWith("in_")) {
    return `${STRIPE_DASHBOARD_BASE_URL}/invoices/${encodeURIComponent(sessionId)}`;
  }
  return `${STRIPE_DASHBOARD_BASE_URL}/search?query=${encodeURIComponent(sessionId)}`;
}
