import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlanPercentage, PLAN_UPFRONT_AMOUNT_CAD } from "@/lib/plan-percentage";
import { getCompletedUpfrontForProperty } from "@/lib/payment-lookup";

// Steve — payment-flow overhaul (PROMPT2) item 8: generic "net an
// existing upfront payment against a newly-selected plan's total fee"
// engine. Written property-generic (not hardcoded to Founders) so any
// future plan-to-plan switch on the same property can reuse it — the
// prompt explicitly asked for this to not be Founders-only logic.

export interface NetAmountDueResult {
  totalFeeCents: number;
  alreadyPaidCents: number;
  netDueCents: number;
  planPercentage: number | null;
}

/**
 * Resolves what an owner still owes to switch a property onto
 * `newServiceId`, netting out whatever they already paid upfront for
 * that property under any prior plan.
 *
 * - totalFeeCents: the new plan's full fee (percentage-of-rent plans use
 *   `getPlanPercentage(service.name) * monthly_rent`; flat-fee plans use
 *   `service.price` as-is).
 * - alreadyPaidCents: the SUM of all completed one-time upfront payments
 *   already recorded for this property, any plan (0 if none) — see
 *   getCompletedUpfrontForProperty for why this must be a sum and not
 *   just the latest row.
 * - netDueCents: what a new Stripe Checkout line item should actually
 *   charge. Two cases, matching every other plan's own checkout
 *   pattern (never the FULL total fee as a first charge):
 *     - Nothing paid yet on this property → the normal flat
 *       $200 CAD upfront (same as every other plan's first charge; the
 *       remaining balance is handled later by item 1/5's flow, not
 *       charged now).
 *     - Something already paid on this property → max(0, totalFeeCents
 *       - alreadyPaidCents), i.e. only the difference.
 *
 * Returns null if the property or service can't be resolved.
 */
export async function computeNetAmountDueCents(
  supabase: SupabaseClient,
  { propertyId, newServiceId }: { propertyId: string; newServiceId: string },
): Promise<NetAmountDueResult | null> {
  const [{ data: property }, { data: service }] = await Promise.all([
    supabase.from("properties").select("monthly_rent").eq("id", propertyId).single(),
    supabase.from("services").select("name, price").eq("id", newServiceId).single(),
  ]);
  if (!property || !service) return null;

  const planPercentage = getPlanPercentage(service.name as string);
  const rent = Number(property.monthly_rent) || 0;
  const totalFeeCents =
    planPercentage !== null
      ? Math.round(rent * planPercentage * 100)
      : Math.round(Number(service.price) * 100);

  const { totalAmount } = await getCompletedUpfrontForProperty(supabase, propertyId);
  const alreadyPaidCents = Math.round(totalAmount * 100);
  const netDueCents =
    alreadyPaidCents === 0
      ? Math.min(totalFeeCents, PLAN_UPFRONT_AMOUNT_CAD * 100)
      : Math.max(0, totalFeeCents - alreadyPaidCents);

  return { totalFeeCents, alreadyPaidCents, netDueCents, planPercentage };
}
