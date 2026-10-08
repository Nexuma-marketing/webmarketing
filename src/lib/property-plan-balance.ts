import { computeBalanceCents } from "@/lib/plan-percentage";

// Single source for the per-property "pending balance" figure shown on
// the client's Payment History → Plan Balances cards
// (PropertyBalanceSummary) AND on the internal Sales Report's
// per-property payment summary. Extracted verbatim from
// src/app/(dashboard)/dashboard/payments/page.tsx so the two surfaces
// can never drift apart — change the rule here and both follow.
//
// `propertyIndex` is the property's position among its owner's
// properties ordered by created_at ascending (Support/Premier: 30% for
// property #1, 28% after) — same convention as
// src/lib/owner-plan-display.ts's percentageForPlan.

export interface PropertyPlanBalance {
  percentage: number;
  /** rent × percentage, minus the $200 upfront — never negative. */
  pendingBalanceCents: number;
  /** Premier Tier bills its balance as scheduled installments, never one lump invoice. */
  isPremier: boolean;
  /**
   * The plan whose rules price this balance. Equals `planName` except
   * for the plan-change case described on resolvePropertyPlanBalance.
   */
  effectivePlanName: string;
}

function isPreferredPlan(lowerName: string): boolean {
  return lowerName.includes("preferred") && (lowerName.includes("support") || lowerName.includes("premier"));
}

/**
 * Returns null for plans with no percentage balance (Elite / flat-fee).
 *
 * Plan-change rule — mirrors generateBalanceInvoice
 * (src/lib/balance-invoice.ts), which is the source of truth for what
 * is actually billed: it prices a property's balance with the OWNER's
 * most recent completed plan payment, not the plan the property's own
 * upfront was paid under. So when a property's upfront was Low Price /
 * Founders, its balance is still unpaid, and the owner's latest plan
 * payment is now Support/Premier (bought for another property), the
 * balance follows the Preferred position rate (30% for #1, 28% for
 * #2/#3) instead of 35% / 30%. Pass `ownerLatestPlanName` and
 * `balancePaid` to apply it; every other combination is unchanged.
 */
export function resolvePropertyPlanBalance(args: {
  planName: string;
  propertyIndex: number;
  monthlyRentCad: number;
  /** Service name of the owner's most recent completed plan payment, any property. */
  ownerLatestPlanName?: string | null;
  /** True once this property's balance invoice is paid — its plan is then final. */
  balancePaid?: boolean;
}): PropertyPlanBalance | null {
  const ownLowerName = args.planName.toLowerCase();
  const isBasicPlan = ownLowerName.includes("low price") || ownLowerName.includes("founder");
  const ownerLatestLower = (args.ownerLatestPlanName || "").toLowerCase();
  const switchedToPreferred =
    isBasicPlan &&
    !args.balancePaid &&
    isPreferredPlan(ownerLatestLower) &&
    // Preferred rates only cover the owner's first 3 properties; the
    // invoice refuses beyond that, so leave those as they were.
    args.propertyIndex >= 0 &&
    args.propertyIndex <= 2;
  const effectivePlanName = switchedToPreferred ? (args.ownerLatestPlanName as string) : args.planName;
  const lowerName = effectivePlanName.toLowerCase();
  // Installments vs lump invoice is decided by the property's OWN plan
  // (tenant-signed-lease route's getPropertyPlanName), so a Low Price
  // property re-rated by a Premier purchase elsewhere still gets one
  // lump-sum balance invoice.
  const isPremier = ownLowerName.includes("preferred") && ownLowerName.includes("premier");
  const isSupportOrPremier = isPreferredPlan(lowerName);
  const percentage = lowerName.includes("low price")
    ? 0.35
    : lowerName.includes("founder")
      ? 0.3
      : isSupportOrPremier
        ? (args.propertyIndex === 0 ? 0.3 : 0.28)
        : null;
  if (percentage === null) return null;
  return {
    percentage,
    pendingBalanceCents: computeBalanceCents({ monthlyRentCad: args.monthlyRentCad, planPercentage: percentage }),
    isPremier,
    effectivePlanName,
  };
}
