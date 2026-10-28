// FIX_PROMOTIONS_REPORT.md: the one place where promo codes are
// validated and their discount is calculated. Used by the checkout
// route, the admin promotions API/page, the promo banners and the
// Admin → Payments "Promo Redemptions" panel. No Stripe or database
// imports here, so client components can use it too; the server-only
// lookups live in src/lib/promotions-server.ts.

import { splitBalanceCents } from "@/lib/plan-percentage";

export const PROMO_MAX_PERCENT = 90;
/** Stripe's minimum charge in CAD, in cents. */
export const STRIPE_MIN_CHARGE_CENTS = 50;
export const PROMO_TIME_ZONE = "America/Vancouver";
const PROMO_INVALID_MESSAGE = "This promo code is not valid.";

export const PROMO_APPLIES_TO = ["all", "pymes", "properties"] as const;
export type PromoAppliesTo = (typeof PROMO_APPLIES_TO)[number];

export const PROMO_APPLIES_TO_LABELS: Record<PromoAppliesTo, string> = {
  all: "Everything",
  pymes: "PYME plans only",
  properties: "Property purchases only",
};

/** What the customer is buying, for applies_to. */
export type PromoPurchaseKind = "pymes" | "property" | "other";

export type PromoDiscountType = "percentage" | "fixed";

/** Today's date (YYYY-MM-DD) in America/Vancouver. */
export function vancouverToday(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PROMO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Validity check, inclusive of both dates, against today's date in
 * America/Vancouver. valid_from / valid_until are DATE columns
 * (YYYY-MM-DD), so a plain string comparison is a date comparison.
 */
export function promoDateStatus(
  promo: { valid_from: string | null; valid_until: string | null },
  today: string = vancouverToday(),
): "not_started" | "expired" | "valid" {
  const from = promo.valid_from ? promo.valid_from.slice(0, 10) : null;
  const until = promo.valid_until ? promo.valid_until.slice(0, 10) : null;
  if (from && from > today) return "not_started";
  if (until && until < today) return "expired";
  return "valid";
}

export function promoAppliesToPurchase(appliesTo: string | null | undefined, kind: PromoPurchaseKind): boolean {
  const scope = (appliesTo || "all") as PromoAppliesTo;
  if (scope === "all") return true;
  if (scope === "pymes") return kind === "pymes";
  if (scope === "properties") return kind === "property";
  return false;
}

export function promoNotApplicableMessage(appliesTo: string | null | undefined): string {
  if (appliesTo === "pymes") return "This promo code only applies to PYME plans.";
  if (appliesTo === "properties") return "This promo code only applies to property plans and services.";
  return "This promo code does not apply to this purchase.";
}

export function promoLabel(discountType: PromoDiscountType, discountValue: number, code: string): string {
  return discountType === "percentage"
    ? `${discountValue}% off (${code})`
    : `$${Number.isInteger(discountValue) ? discountValue : discountValue.toFixed(2)} CAD off (${code})`;
}

export type PromoDiscountResult =
  | {
      ok: true;
      /** Each charge after the discount, same order as the input. */
      discountedCents: number[];
      /** Discount taken from each charge. */
      discountByChargeCents: number[];
      totalDiscountCents: number;
    }
  | { ok: false; error: string };

/**
 * The single discount calculation. `chargesCents` lists every charge of
 * the purchase, before tax: [today's payment, ...later charges]. For a
 * PYME plan that is [upfront, installment, installment, ...]; for a
 * one-time purchase it is [amount].
 *
 * - Percentage: the same % is taken off every charge, rounded to cents.
 * - Fixed: the amount is split by each charge's share of the total,
 *   rounded to cents; the rounding difference stays on the first charge.
 *
 * Refuses when the discount would take the total to $0 or leave any
 * charge below Stripe's minimum (CAD 0.50).
 */
export function computePromoDiscount(args: {
  discountType: PromoDiscountType;
  discountValue: number;
  chargesCents: number[];
}): PromoDiscountResult {
  const charges = args.chargesCents.map((c) => Math.max(0, Math.round(c)));
  const value = Number(args.discountValue);
  if (charges.length === 0 || charges[0] <= 0) {
    return { ok: false, error: "This purchase has nothing to discount." };
  }
  const totalCents = charges.reduce((a, b) => a + b, 0);

  let discounts: number[];
  if (args.discountType === "percentage") {
    if (!Number.isInteger(value) || value < 1 || value > PROMO_MAX_PERCENT) {
      return { ok: false, error: PROMO_INVALID_MESSAGE };
    }
    discounts = charges.map((c) => Math.round((c * value) / 100));
  } else {
    const discountCents = Math.round(value * 100);
    if (!(discountCents > 0)) return { ok: false, error: PROMO_INVALID_MESSAGE };
    if (discountCents >= totalCents) {
      return { ok: false, error: "This promo code's discount is larger than this purchase." };
    }
    discounts = charges.map((c, i) => (i === 0 ? 0 : Math.round((discountCents * c) / totalCents)));
    discounts[0] = discountCents - discounts.slice(1).reduce((a, b) => a + b, 0);
    if (discounts[0] < 0 || discounts[0] > charges[0]) {
      return { ok: false, error: "This promo code's discount can't be applied to this purchase." };
    }
  }

  const discounted = charges.map((c, i) => c - discounts[i]);
  if (discounted.some((c, i) => charges[i] > 0 && c < STRIPE_MIN_CHARGE_CENTS)) {
    return {
      ok: false,
      error: "This promo code's discount is too large for this purchase (each payment must be at least $0.50 CAD).",
    };
  }
  return {
    ok: true,
    discountedCents: discounted,
    discountByChargeCents: discounts,
    totalDiscountCents: discounts.reduce((a, b) => a + b, 0),
  };
}

export const PROMO_LARGER_THAN_BALANCE_MESSAGE =
  "This promo code's discount is larger than the remaining balance of this plan.";

export type PlanBalancePromoResult =
  | {
      ok: true;
      /** Discount taken off the plan's total fee (the value to charge). */
      discountCents: number;
      discountedTotalCents: number;
      /** discountedTotalCents − upfront: what is left to bill after today's payment. */
      balanceCents: number;
      /** The balance split into the plan's usual charges. */
      installmentsCents: number[];
    }
  | { ok: false; error: string };

/**
 * FIX_PROMOTIONS_BALANCE_REPORT.md — plans paid as an upfront plus a
 * later balance (Low Price, Founders, Support Tier, Premier Tier):
 *   1. planTotalCents is the plan's value to charge (rent × plan %), as
 *      the system already calculates it.
 *   2. The code's discount comes off that value (same rules as
 *      computePromoDiscount on one charge).
 *   3. The upfront is not discounted; it is subtracted from the
 *      discounted value, leaving the balance.
 *   4. The balance is split with the plan's usual shares (see
 *      splitBalanceCents); the last charge takes the rounding cents.
 * Refuses when the balance would be $0 or less, or any charge of it
 * would be below CAD 0.50.
 */
export function computePlanBalancePromo(args: {
  discountType: PromoDiscountType;
  discountValue: number;
  planTotalCents: number;
  upfrontCents: number;
  installmentShares: number[];
}): PlanBalancePromoResult {
  const totalCents = Math.round(args.planTotalCents);
  const upfrontCents = Math.max(0, Math.round(args.upfrontCents));
  if (!(totalCents > 0)) return { ok: false, error: "This plan has no amount to discount yet." };

  const discount = computePromoDiscount({
    discountType: args.discountType,
    discountValue: args.discountValue,
    chargesCents: [totalCents],
  });
  if (!discount.ok) {
    return {
      ok: false,
      error: discount.error === PROMO_INVALID_MESSAGE ? discount.error : PROMO_LARGER_THAN_BALANCE_MESSAGE,
    };
  }
  const discountCents = discount.totalDiscountCents;
  const discountedTotalCents = totalCents - discountCents;
  const balanceCents = discountedTotalCents - upfrontCents;
  if (balanceCents <= 0) return { ok: false, error: PROMO_LARGER_THAN_BALANCE_MESSAGE };

  const installmentsCents = splitBalanceCents(balanceCents, args.installmentShares);
  if (installmentsCents.length === 0 || installmentsCents.some((c) => c < STRIPE_MIN_CHARGE_CENTS)) {
    return {
      ok: false,
      error: `${PROMO_LARGER_THAN_BALANCE_MESSAGE} (each payment must be at least $0.50 CAD)`,
    };
  }
  return { ok: true, discountCents, discountedTotalCents, balanceCents, installmentsCents };
}

// ─── Admin create/edit validation (API and form) ───

export interface PromotionInput {
  code: string;
  description: string | null;
  discount_type: PromoDiscountType;
  discount_value: number;
  valid_from: string;
  valid_until: string | null;
  is_active: boolean;
  max_uses: number | null;
  target_roles: string[];
  applies_to: PromoAppliesTo;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Codes are stored upper-case, without spaces at the ends. */
export function normalizePromoCode(code: unknown): string {
  return String(code ?? "").trim().toUpperCase();
}

/**
 * Checks a full promotion (after merging an edit onto the stored row).
 * Returns the cleaned values to write, or the list of problems. Zones
 * are no longer part of promotions and are never written.
 */
export function validatePromotionInput(
  raw: Record<string, unknown>,
): { ok: true; value: PromotionInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  const code = normalizePromoCode(raw.code);
  if (!code) errors.push("Code is required.");
  else if (code.length > 50) errors.push("Code must be 50 characters or fewer.");

  const discountType = raw.discount_type;
  if (discountType !== "percentage" && discountType !== "fixed") {
    errors.push("Discount type must be percentage or fixed.");
  }

  const discountValue = Number(raw.discount_value);
  if (raw.discount_value === null || raw.discount_value === "" || !Number.isFinite(discountValue)) {
    errors.push("Discount value is required.");
  } else if (discountType === "percentage") {
    if (!Number.isInteger(discountValue) || discountValue < 1 || discountValue > PROMO_MAX_PERCENT) {
      errors.push(`Percentage must be a whole number between 1 and ${PROMO_MAX_PERCENT}.`);
    }
  } else if (discountType === "fixed") {
    if (!(discountValue > 0)) errors.push("Fixed amount must be greater than $0.");
    else if (Math.abs(discountValue * 100 - Math.round(discountValue * 100)) > 1e-6) {
      errors.push("Fixed amount can have at most 2 decimals.");
    }
  }

  const validFrom = String(raw.valid_from ?? "").slice(0, 10);
  if (!isValidDate(validFrom)) errors.push("Valid From must be a date.");
  const validUntilRaw = raw.valid_until;
  const validUntil =
    validUntilRaw === null || validUntilRaw === undefined || validUntilRaw === ""
      ? null
      : String(validUntilRaw).slice(0, 10);
  if (validUntil !== null && !isValidDate(validUntil)) errors.push("Valid Until must be a date.");
  if (validUntil && isValidDate(validFrom) && isValidDate(validUntil) && validUntil < validFrom) {
    errors.push("Valid Until can't be before Valid From.");
  }

  const maxUsesRaw = raw.max_uses;
  let maxUses: number | null = null;
  if (maxUsesRaw !== null && maxUsesRaw !== undefined && maxUsesRaw !== "") {
    maxUses = Number(maxUsesRaw);
    if (!Number.isInteger(maxUses) || maxUses <= 0) {
      errors.push("Max uses must be a whole number greater than 0, or blank for unlimited.");
    }
  }

  const appliesTo = (raw.applies_to ?? "all") as PromoAppliesTo;
  if (!PROMO_APPLIES_TO.includes(appliesTo)) errors.push("Applies to must be all, pymes or properties.");

  const roles = Array.isArray(raw.target_roles)
    ? (raw.target_roles as unknown[]).map((r) => String(r)).filter(Boolean)
    : [];

  const description =
    raw.description === null || raw.description === undefined ? null : String(raw.description).trim() || null;

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      code,
      description,
      discount_type: discountType as PromoDiscountType,
      discount_value: discountType === "fixed" ? Math.round(discountValue * 100) / 100 : discountValue,
      valid_from: validFrom,
      valid_until: validUntil,
      is_active: raw.is_active === undefined ? true : raw.is_active === true,
      max_uses: maxUses,
      target_roles: roles,
      applies_to: appliesTo,
    },
  };
}
