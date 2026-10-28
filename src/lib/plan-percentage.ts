// Steve 6/11 (6-2.md #53): plan -> balance percentage lookup. Alex
// confirmed the matrix in her 2026-06-11 message — residential plans
// charge $200 upfront + (rent * percentage) once the tenant signs.
// Hardcoded by name pattern, same approach as priceLabel() in
// admin/reassign and admin/services. If the upstream plan list grows,
// move this to app_config rather than rebuilding the lookup.

export function getPlanPercentage(serviceName: string | null | undefined): number | null {
  if (!serviceName) return null;
  const name = serviceName.toLowerCase();
  if (name.includes("low price")) return 0.35;
  if (name.includes("founder")) return 0.30;
  if (name.includes("preferred") && name.includes("premier")) return 0.28;
  if (name.includes("preferred") && name.includes("support")) return 0.30;
  // Elite plans are flat-fee, no percentage balance.
  if (name.includes("elite")) return null;
  return null;
}

// Steve 6/11: the $200 upfront fee already paid at plan signup.
// Subtracted from the calculated percentage so the owner only pays
// the actual balance (not double-counted with the upfront).
export const PLAN_UPFRONT_AMOUNT_CAD = 200;

export function computeBalanceCents(args: {
  monthlyRentCad: number;
  planPercentage: number;
}): number {
  const grossBalance = args.monthlyRentCad * args.planPercentage;
  const net = Math.max(0, grossBalance - PLAN_UPFRONT_AMOUNT_CAD);
  return Math.round(net * 100);
}

// FIX_PROMOTIONS_BALANCE_REPORT.md: how a plan's balance (rent × % −
// upfront) is split into charges. Lump-sum plans (Low Price, Founders,
// Support Tier) bill it once: [1]. Premier Tier: property #1 in one
// installment, #2/#3 in 50% / 30% / 20%. Shared by the Premier schedule
// and the promo-code check at checkout so both always agree.
export function premierInstallmentShares(propertyRank: number): number[] {
  return propertyRank === 0 ? [1] : [0.5, 0.3, 0.2];
}

/**
 * Splits a balance by the given shares (fractions that add up to 1).
 * Each charge is rounded to the cent; the last one takes the rounding
 * difference, so the charges always add up exactly to `balanceCents`.
 */
export function splitBalanceCents(balanceCents: number, shares: number[]): number[] {
  if (shares.length === 0) return [];
  const head = shares.slice(0, -1).map((share) => Math.round(balanceCents * share));
  return [...head, balanceCents - head.reduce((a, b) => a + b, 0)];
}
