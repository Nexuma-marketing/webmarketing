import type { SupabaseClient } from "@supabase/supabase-js";
import { PYMES_PLANS, type PymesPlanBase } from "@/lib/constants";

// FIX_PYME_PRICES_SINGLE_SOURCE_REPORT.md: the `pymes_plans` table is the
// only source of PYME prices. Checkout charges these columns, and every
// screen and email builds its price text from them through this file,
// so what the customer sees is what they are charged.

export const PYME_PLAN_TYPES = ["rescue", "growth", "scale"] as const;

export interface PymesPlanPricing {
  id: string;
  planType: string;
  name: string;
  upfront: number;
  installmentAmount: number;
  installmentMonths: number;
  /** upfront + installmentMonths × installmentAmount */
  total: number;
}

export interface PymesPlanPriceText {
  /** "$1,500 CAD" */
  price: string | null;
  /** "$750 CAD upfront (50%)" */
  upfront: string | null;
  /** "$375 CAD × 2 monthly payments" */
  installment: string | null;
}

/** Plan texts (PYMES_PLANS) + price texts from `pymes_plans`. Prices are
 *  null when the plan has no valid active row. */
export type PymesPlanDetails = PymesPlanBase & PymesPlanPriceText;

const round2 = (n: number) => Math.round(n * 100) / 100;

export function pymesPlanTotal(upfront: number, installmentAmount: number, installmentMonths: number): number {
  return round2(upfront + installmentMonths * installmentAmount);
}

type PlanRow = {
  id: string;
  plan_type: string;
  name: string | null;
  upfront_amount: number | string | null;
  installment_amount: number | string | null;
  installment_months: number | string | null;
};

function rowToPricing(row: PlanRow): PymesPlanPricing | null {
  const upfront = Number(row.upfront_amount);
  const installmentAmount = Number(row.installment_amount);
  const installmentMonths = Number(row.installment_months);
  if (!(upfront > 0) || !(installmentAmount > 0) || !Number.isInteger(installmentMonths) || installmentMonths < 1) {
    return null;
  }
  return {
    id: row.id,
    planType: row.plan_type,
    name: row.name || "",
    upfront,
    installmentAmount,
    installmentMonths,
    total: pymesPlanTotal(upfront, installmentAmount, installmentMonths),
  };
}

/** Active plan rows keyed by plan_type. When a plan_type has more than
 *  one active row, the newest wins (same order the results page used). */
export async function loadPymesPlanPricing(
  supabase: SupabaseClient,
): Promise<Record<string, PymesPlanPricing>> {
  const { data, error } = await supabase
    .from("pymes_plans")
    .select("id, plan_type, name, upfront_amount, installment_amount, installment_months, created_at")
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[pymes-plan-pricing] could not load pymes_plans", error);
    return {};
  }
  const out: Record<string, PymesPlanPricing> = {};
  for (const row of (data || []) as PlanRow[]) {
    if (out[row.plan_type]) continue;
    const pricing = rowToPricing(row);
    if (pricing) out[row.plan_type] = pricing;
  }
  return out;
}

// Same text shape the hand-written strings had ("$1,500 CAD").
function cad(n: number): string {
  const decimals = Number.isInteger(n) ? 0 : 2;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} CAD`;
}

export function pymesPriceText(pricing: PymesPlanPricing | null | undefined): PymesPlanPriceText {
  if (!pricing) return { price: null, upfront: null, installment: null };
  const pct = pricing.total > 0 ? Math.round((pricing.upfront / pricing.total) * 100) : 0;
  const payments = pricing.installmentMonths === 1 ? "monthly payment" : "monthly payments";
  return {
    price: cad(pricing.total),
    upfront: `${cad(pricing.upfront)} upfront (${pct}%)`,
    installment: `${cad(pricing.installmentAmount)} × ${pricing.installmentMonths} ${payments}`,
  };
}

/** PYMES_PLANS texts for `planType` + prices from `pymes_plans`. */
export function getPymesPlanDetails(
  planType: string | null | undefined,
  pricing: Record<string, PymesPlanPricing>,
): PymesPlanDetails | null {
  if (!planType) return null;
  const base = PYMES_PLANS[planType];
  if (!base) return null;
  return { ...base, ...pymesPriceText(pricing[planType]) };
}

/** Browser helper for client components (works before login too):
 *  GET /api/pymes-plans returns the active plans' pricing. */
export async function fetchPymesPlanPricing(): Promise<Record<string, PymesPlanPricing>> {
  try {
    const res = await fetch("/api/pymes-plans", { cache: "no-store" });
    if (!res.ok) return {};
    const body = (await res.json()) as { plans?: Record<string, PymesPlanPricing> };
    return body.plans || {};
  } catch (err) {
    console.error("[pymes-plan-pricing] could not fetch /api/pymes-plans", err);
    return {};
  }
}
