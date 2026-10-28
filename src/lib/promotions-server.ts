import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendCommercialAlertEmail } from "@/lib/email";
import {
  computePlanBalancePromo,
  computePromoDiscount,
  normalizePromoCode,
  promoAppliesToPurchase,
  promoDateStatus,
  promoLabel,
  promoNotApplicableMessage,
  type PromoDiscountType,
  type PromoPurchaseKind,
} from "@/lib/promotions";

// FIX_PROMOTIONS_REPORT.md: server-only promo lookups. Checkout
// validates and calculates here; the webhook records the redemption
// here once the payment is completed. Service-role client: promotions
// and promotion_redemptions are not readable by customers.

/** Session metadata marker: sessions created with this flow are counted in the webhook. */
export const PROMO_FLOW_VERSION = "2";

export type CheckoutPromo = {
  promotionId: string;
  code: string;
  label: string;
  discountedCents: number[];
  discountByChargeCents: number[];
  totalDiscountCents: number;
  discountType: PromoDiscountType;
  discountValue: number;
  /**
   * FIX_PROMOTIONS_BALANCE_REPORT.md: set for plans paid as an upfront
   * plus a later balance. The code then discounts the plan's total fee
   * (not today's payment) and the balance is billed already reduced.
   */
  planBalance?: {
    planTotalCents: number;
    upfrontCents: number;
    discountedTotalCents: number;
    balanceCents: number;
    installmentsCents: number[];
  };
};

/**
 * Validates a code typed at checkout for this customer and purchase and
 * returns the discount for every charge of the purchase (see
 * computePromoDiscount). Order of checks: exists, active, dates
 * (America/Vancouver, inclusive), usage limit, already used by this
 * customer, client type, what is being bought, amount.
 */
export async function validatePromoForCheckout(args: {
  code: string;
  userId: string;
  userRole: string | null;
  purchaseKind: PromoPurchaseKind;
  chargesCents: number[];
  /**
   * Upfront + balance plans: the discount is taken off planTotalCents
   * (see computePlanBalancePromo) and today's charge stays as it is.
   */
  planBalance?: { planTotalCents: number; upfrontCents: number; installmentShares: number[] };
}): Promise<{ ok: true; promo: CheckoutPromo } | { ok: false; error: string; status: number }> {
  const code = normalizePromoCode(args.code);
  if (!code) return { ok: false, error: "Enter a promo code.", status: 400 };

  const { data: promo, error } = await supabaseAdmin
    .from("promotions")
    .select("id, code, discount_type, discount_value, valid_from, valid_until, is_active, max_uses, used_count, target_roles, applies_to")
    .eq("code", code)
    .maybeSingle();
  if (error) {
    console.error("[promotions] promo lookup failed", { code, error });
    return { ok: false, error: "We couldn't check this promo code. Please try again in a moment.", status: 503 };
  }
  if (!promo) return { ok: false, error: "Promo code not found.", status: 400 };
  if (!promo.is_active) return { ok: false, error: "This promo code is not active.", status: 400 };

  const dates = promoDateStatus(promo as { valid_from: string | null; valid_until: string | null });
  if (dates === "not_started") return { ok: false, error: "This promo code is not active yet.", status: 400 };
  if (dates === "expired") return { ok: false, error: "This promo code has expired.", status: 400 };

  if (promo.max_uses !== null && (promo.used_count ?? 0) >= promo.max_uses) {
    return { ok: false, error: "This promo code has reached its usage limit.", status: 400 };
  }

  const { data: redeemed, error: redeemedError } = await supabaseAdmin
    .from("promotion_redemptions")
    .select("id")
    .eq("promotion_id", promo.id)
    .eq("user_id", args.userId)
    .limit(1);
  if (redeemedError) {
    console.error("[promotions] redemption lookup failed", { code, userId: args.userId, error: redeemedError });
    return { ok: false, error: "We couldn't check this promo code. Please try again in a moment.", status: 503 };
  }
  if ((redeemed?.length ?? 0) > 0) {
    return { ok: false, error: "You have already used this promo code.", status: 400 };
  }

  const roles = (promo.target_roles as string[] | null) || [];
  if (roles.length > 0 && (!args.userRole || !roles.includes(args.userRole))) {
    return { ok: false, error: "This promo code is not eligible for your account.", status: 400 };
  }

  if (!promoAppliesToPurchase(promo.applies_to as string | null, args.purchaseKind)) {
    return { ok: false, error: promoNotApplicableMessage(promo.applies_to as string | null), status: 400 };
  }

  const discountType = promo.discount_type as PromoDiscountType;
  const discountValue = Number(promo.discount_value);
  if (args.planBalance) {
    const plan = computePlanBalancePromo({ discountType, discountValue, ...args.planBalance });
    if (!plan.ok) return { ok: false, error: plan.error, status: 400 };
    return {
      ok: true,
      promo: {
        promotionId: promo.id as string,
        code,
        label: promoLabel(discountType, discountValue, code),
        // Today's charge is not discounted.
        discountedCents: [...args.chargesCents],
        discountByChargeCents: args.chargesCents.map(() => 0),
        totalDiscountCents: plan.discountCents,
        discountType,
        discountValue,
        planBalance: {
          planTotalCents: Math.round(args.planBalance.planTotalCents),
          upfrontCents: Math.round(args.planBalance.upfrontCents),
          discountedTotalCents: plan.discountedTotalCents,
          balanceCents: plan.balanceCents,
          installmentsCents: plan.installmentsCents,
        },
      },
    };
  }
  const result = computePromoDiscount({ discountType, discountValue, chargesCents: args.chargesCents });
  if (!result.ok) return { ok: false, error: result.error, status: 400 };

  return {
    ok: true,
    promo: {
      promotionId: promo.id as string,
      code,
      label: promoLabel(discountType, discountValue, code),
      discountedCents: result.discountedCents,
      discountByChargeCents: result.discountByChargeCents,
      totalDiscountCents: result.totalDiscountCents,
      discountType,
      discountValue,
    },
  };
}

type RedeemOutcome =
  | "counted"
  | "already_recorded"
  | "limit_reached"
  | "already_redeemed_by_user"
  | "promotion_missing"
  | "error";

/**
 * Webhook, checkout.session.completed: counts the use and stores the
 * redemption in one database call (public.redeem_promotion, migration
 * v72), so it is atomic and a repeated event never counts twice. The
 * payment is never undone here: when the last use was taken by someone
 * else, or this customer had already used the code, the payment stands
 * and commercial gets an email with the details. Never throws.
 */
export async function recordPromotionRedemption(args: {
  promotionId: string;
  userId: string;
  sessionId: string;
  paymentIntentId: string | null;
  discountCents: number;
  promoLabel: string | null;
  amountPaidCents: number;
}): Promise<RedeemOutcome> {
  let outcome: RedeemOutcome = "error";
  let detail = "";
  try {
    const { data, error } = await supabaseAdmin.rpc("redeem_promotion", {
      p_promotion_id: args.promotionId,
      p_user_id: args.userId,
      p_session_id: args.sessionId,
      p_payment_intent_id: args.paymentIntentId,
      p_discount_amount: Math.max(0, args.discountCents) / 100,
    });
    if (error) {
      detail = error.message;
      console.error("[promotions] CRITICAL: redeem_promotion failed", { ...args, error });
    } else {
      outcome = (String(data) as RedeemOutcome) || "error";
    }
  } catch (err) {
    detail = err instanceof Error ? err.message : String(err);
    console.error("[promotions] CRITICAL: redeem_promotion threw", { ...args, error: detail });
  }

  if (outcome === "counted" || outcome === "already_recorded") {
    console.log("[promotions] redemption", { outcome, promotionId: args.promotionId, sessionId: args.sessionId });
    return outcome;
  }

  const reasons: Record<Exclude<RedeemOutcome, "counted" | "already_recorded">, string> = {
    limit_reached:
      "The code had no uses left when this payment completed (another customer used the last one at the same time). The payment was kept and the redemption was recorded as over the limit; used_count was not raised.",
    already_redeemed_by_user:
      "This customer had already used this code on an earlier payment. The payment was kept; this second use was not recorded in promotion_redemptions.",
    promotion_missing:
      "The promotion no longer exists (it was deleted after the checkout started). The payment was kept; nothing was recorded.",
    error: `The redemption could not be recorded (${detail || "unknown error"}). The payment was kept; record it by hand if needed.`,
  };
  console.warn("[promotions] redemption needs attention", { outcome, ...args });
  try {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email")
      .eq("id", args.userId)
      .maybeSingle();
    await sendCommercialAlertEmail({
      subject: "Promo code: payment completed but the use could not be counted",
      intro: "A customer paid with a promo code that could not be counted normally. No payment was canceled. Review whether any follow-up is needed.",
      items: [
        {
          Customer: `${(profile?.full_name as string) || "—"} <${(profile?.email as string) || "no email"}>`,
          "Promo code": args.promoLabel || args.promotionId,
          "Discount given": `$${(args.discountCents / 100).toFixed(2)} CAD`,
          "Paid today": `$${(args.amountPaidCents / 100).toFixed(2)} CAD`,
          "Checkout session": args.sessionId,
          "Payment intent": args.paymentIntentId || "—",
          Reason: reasons[outcome],
        },
      ],
    });
  } catch (err) {
    console.error("[promotions] alert email to commercial failed", {
      sessionId: args.sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return outcome;
}
