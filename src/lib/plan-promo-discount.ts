import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendCommercialAlertEmail } from "@/lib/email";
import { getPlanPercentage, premierInstallmentShares } from "@/lib/plan-percentage";

// FIX_PROMOTIONS_BALANCE_REPORT.md: promo codes on plans paid as an
// upfront plus a later balance (Low Price, Founders, Support Tier,
// Premier Tier). The code discounts the plan's value to charge
// (rent × plan %), never the upfront. Checkout validates it; the
// webhook stores it per property in plan_promotion_discounts (migration
// v73) when the upfront is paid; the balance invoice
// (balance-invoice.ts) and the Premier schedule (premier-installments.ts)
// subtract it from what is billed later.

/** Plans whose balance (rent × % − upfront) is billed after the upfront. */
export function isBalancePlan(serviceName: string | null | undefined): boolean {
  return getPlanPercentage(serviceName) !== null;
}

function isPreferredPlan(serviceName: string): boolean {
  return /preferred/i.test(serviceName) && /(support|premier)/i.test(serviceName);
}

export function isPremierPlanName(serviceName: string): boolean {
  return /preferred/i.test(serviceName) && /premier/i.test(serviceName);
}

export interface PlanBalanceTerms {
  planPercentage: number;
  /** Value to charge: round(rent × plan % × 100), same as generateBalanceInvoice's totalFeeCents. */
  planTotalCents: number;
  /** How the balance is billed: [1] = one charge; Premier #2/#3 = [0.5, 0.3, 0.2]. */
  installmentShares: number[];
}

/**
 * The plan's value to charge for this property, with the same rules the
 * later charges use: Low Price 35%, Founders 30%; Support / Premier 30%
 * for the owner's 1st property and 28% for the 2nd/3rd (position by
 * created_at, as in balance-invoice.ts and premier-installments.ts).
 */
export async function resolvePlanBalanceTerms(args: {
  serviceName: string;
  propertyId: string;
  ownerId: string;
  monthlyRentCad: number;
}): Promise<{ ok: true; terms: PlanBalanceTerms } | { ok: false; error: string; status: number }> {
  const rent = Number(args.monthlyRentCad) || 0;
  if (rent <= 0) {
    return {
      ok: false,
      error: "This property has no monthly rent yet, so a promo code can't be applied to its plan.",
      status: 400,
    };
  }

  let percentage = getPlanPercentage(args.serviceName);
  let shares = [1];
  if (percentage === null) {
    return { ok: false, error: "This promo code does not apply to this purchase.", status: 400 };
  }
  if (isPreferredPlan(args.serviceName)) {
    const { data: ownerProperties, error } = await supabaseAdmin
      .from("properties")
      .select("id")
      .eq("owner_id", args.ownerId)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[plan-promo] property rank lookup failed", { propertyId: args.propertyId, error });
      return { ok: false, error: "We couldn't check this promo code. Please try again in a moment.", status: 503 };
    }
    const rank = (ownerProperties || []).findIndex((p) => p.id === args.propertyId);
    if (rank === -1 || rank > 2) {
      return {
        ok: false,
        error: "This plan only covers an owner's first 3 properties, so a promo code can't be applied here.",
        status: 400,
      };
    }
    percentage = rank === 0 ? 0.3 : 0.28;
    if (isPremierPlanName(args.serviceName)) shares = premierInstallmentShares(rank);
  }

  return {
    ok: true,
    terms: {
      planPercentage: percentage,
      planTotalCents: Math.round(rent * percentage * 100),
      installmentShares: shares,
    },
  };
}

export interface PlanPromoDiscount {
  id: string;
  propertyId: string;
  serviceId: string | null;
  promotionId: string | null;
  promotionCode: string;
  planTotalCents: number;
  discountCents: number;
  upfrontCents: number;
  stripeSessionId: string;
}

/**
 * The promo discount that applies to this property's balance: the
 * newest plan_promotion_discounts row whose upfront payment is still
 * `completed` (a fully refunded upfront no longer carries its discount).
 * `ok: false` when a lookup failed — callers must not bill in that case,
 * since they can't know whether the balance should be reduced.
 */
export async function getActivePlanPromoDiscount(
  propertyId: string,
): Promise<{ ok: true; discount: PlanPromoDiscount | null } | { ok: false; error: string }> {
  const { data: rows, error } = await supabaseAdmin
    .from("plan_promotion_discounts")
    .select("id, property_id, service_id, promotion_id, promotion_code, plan_total_cents, discount_cents, upfront_cents, stripe_session_id")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[plan-promo] CRITICAL: plan_promotion_discounts lookup failed", { propertyId, error });
    return { ok: false, error: `plan_promotion_discounts lookup failed: ${error.message}` };
  }
  for (const row of rows || []) {
    let paymentQuery = supabaseAdmin
      .from("payments")
      .select("id")
      .eq("stripe_session_id", row.stripe_session_id as string)
      .eq("status", "completed");
    if (row.service_id) paymentQuery = paymentQuery.eq("service_id", row.service_id as string);
    const { data: payment, error: paymentError } = await paymentQuery.limit(1);
    if (paymentError) {
      console.error("[plan-promo] CRITICAL: upfront payment lookup failed", { propertyId, error: paymentError });
      return { ok: false, error: `payments lookup failed: ${paymentError.message}` };
    }
    if ((payment?.length ?? 0) === 0) continue;
    return {
      ok: true,
      discount: {
        id: row.id as string,
        propertyId: row.property_id as string,
        serviceId: (row.service_id as string | null) ?? null,
        promotionId: (row.promotion_id as string | null) ?? null,
        promotionCode: row.promotion_code as string,
        planTotalCents: Number(row.plan_total_cents) || 0,
        discountCents: Number(row.discount_cents) || 0,
        upfrontCents: Number(row.upfront_cents) || 0,
        stripeSessionId: row.stripe_session_id as string,
      },
    };
  }
  return { ok: true, discount: null };
}

/**
 * Webhook, checkout.session.completed: stores the plan discount with
 * the property. Idempotent per checkout session (UNIQUE
 * stripe_session_id). Stored even when the code's use couldn't be
 * counted (limit reached, already used): the customer paid under that
 * discount, so the balance is billed with it. Never throws; returns
 * false when the row could not be written, after alerting commercial.
 */
export async function savePlanPromoDiscount(args: {
  propertyId: string;
  userId: string;
  serviceId: string | null;
  promotionId: string;
  promotionCode: string;
  discountType: string;
  discountValue: number;
  planPercentage: number | null;
  monthlyRentCad: number | null;
  planTotalCents: number;
  discountCents: number;
  upfrontCents: number;
  stripeSessionId: string;
}): Promise<boolean> {
  const row = {
    property_id: args.propertyId,
    user_id: args.userId,
    service_id: args.serviceId,
    promotion_id: args.promotionId,
    promotion_code: args.promotionCode,
    discount_type: args.discountType,
    discount_value: args.discountValue,
    plan_percentage: args.planPercentage,
    monthly_rent: args.monthlyRentCad,
    plan_total_cents: args.planTotalCents,
    discount_cents: args.discountCents,
    upfront_cents: args.upfrontCents,
    stripe_session_id: args.stripeSessionId,
  };
  let detail = "";
  try {
    const { error } = await supabaseAdmin
      .from("plan_promotion_discounts")
      .upsert(row, { onConflict: "stripe_session_id", ignoreDuplicates: true });
    if (!error) {
      console.log("[plan-promo] plan discount stored", row);
      return true;
    }
    detail = error.message;
  } catch (err) {
    detail = err instanceof Error ? err.message : String(err);
  }
  console.error("[plan-promo] CRITICAL: could not store the plan discount", { ...row, error: detail });
  try {
    await sendCommercialAlertEmail({
      subject: "Promo code: plan discount not saved — balance would be billed in full",
      intro:
        "A customer paid a plan upfront with a promo code, but the discount could not be saved with the property. Until it is saved, the plan's balance (or Premier installments) would be billed without the discount. Insert the row below in plan_promotion_discounts (see FIX_PROMOTIONS_BALANCE_REPORT.md); for Premier Tier, then use Reschedule installments.",
      items: [
        {
          Property: args.propertyId,
          Customer: args.userId,
          "Promo code": args.promotionCode,
          "Plan value to charge": `$${(args.planTotalCents / 100).toFixed(2)} CAD`,
          Discount: `$${(args.discountCents / 100).toFixed(2)} CAD`,
          Upfront: `$${(args.upfrontCents / 100).toFixed(2)} CAD`,
          "Checkout session": args.stripeSessionId,
          Error: detail || "unknown error",
        },
      ],
    });
  } catch (err) {
    console.error("[plan-promo] alert email to commercial failed", {
      sessionId: args.stripeSessionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return false;
}
