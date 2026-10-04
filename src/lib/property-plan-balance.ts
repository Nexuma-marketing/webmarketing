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
}

/** Returns null for plans with no percentage balance (Elite / flat-fee). */
export function resolvePropertyPlanBalance(args: {
  planName: string;
  propertyIndex: number;
  monthlyRentCad: number;
}): PropertyPlanBalance | null {
  const lowerName = args.planName.toLowerCase();
  const isPremier = lowerName.includes("preferred") && lowerName.includes("premier");
  const isSupportOrPremier =
    lowerName.includes("preferred") && (lowerName.includes("support") || lowerName.includes("premier"));
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
  };
}
