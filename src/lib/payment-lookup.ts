import type { SupabaseClient } from "@supabase/supabase-js";

// Steve — payment-flow overhaul (PROMPT2) item 4: shared lookups so
// "has this already been paid" is answered the same way everywhere a
// CheckoutButton renders, instead of each card re-implementing its own
// (missing) check. Reads go through the caller's own client — RLS
// already scopes `payments` to `user_id = auth.uid()` for non-admin
// roles, so no service-role client is needed here.

export interface CompletedPaymentRow {
  id: string;
  service_id: string | null;
  property_id: string | null;
  amount: number;
  created_at: string;
}

/**
 * Exact property + service match — the simple "already bought this plan
 * for this property" check (item 4).
 *
 * Backward-compatibility fallback: pre-existing Low Price / Founders /
 * Support Tier / Premier Tier payment rows have `property_id = null`
 * (checkout never passed it before this change). If the property-scoped
 * lookup finds nothing and the property's owner has exactly ONE
 * property total, also check that owner's null-property_id payments for
 * this exact service — unambiguous for a single-property owner. Without
 * this, a property that already paid under the old code path would show
 * as "not paid" and the Pay button would stay clickable, risking a real
 * double charge. Multi-property owners with a pre-restructure
 * Support/Premier payment are a known gap — see
 * getCompletedUpfrontForProperty's docstring.
 */
export async function getCompletedPaymentForPropertyService(
  supabase: SupabaseClient,
  propertyId: string,
  serviceId: string,
): Promise<CompletedPaymentRow | null> {
  const { data } = await supabase
    .from("payments")
    .select("id, service_id, property_id, amount, created_at")
    .eq("property_id", propertyId)
    .eq("service_id", serviceId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data) return data as CompletedPaymentRow;

  const { data: property } = await supabase
    .from("properties")
    .select("owner_id")
    .eq("id", propertyId)
    .maybeSingle();
  const ownerId = property?.owner_id as string | undefined;
  if (!ownerId) return null;
  const { count: ownerPropertyCount } = await supabase
    .from("properties")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId);
  if (ownerPropertyCount !== 1) return null;

  const { data: legacy } = await supabase
    .from("payments")
    .select("id, service_id, property_id, amount, created_at")
    .eq("user_id", ownerId)
    .is("property_id", null)
    .eq("service_id", serviceId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (legacy as CompletedPaymentRow | null) ?? null;
}

/**
 * Total of all completed upfront-type payments for a property, under
 * ANY plan/service — used by item 8's netting logic and item 1's
 * balance calculation. Deliberately a SUM, not just the most recent
 * row: after a plan switch nets down to $0 (payment_type
 * "plan_switch_noop", amount 0), that noop row would become the "most
 * recent" payment, and picking only the latest row would make a THIRD
 * switch see alreadyPaid=$0 and charge a fresh $200 — silently losing
 * the real amount paid in an earlier row. Summing always reflects the
 * true cumulative amount already invested in this property, regardless
 * of how many switches happened in between. Excludes recurring/
 * installment payment_types (elite_maintenance, installment,
 * plan_balance, plan_installment) so it only ever reflects one-time
 * upfront deposits.
 *
 * Backward-compatibility fallback: before this change, Low Price /
 * Founders / Support Tier / Premier Tier checkouts never passed
 * propertyId, so pre-existing payment rows for those plans have
 * `property_id = null`. If the property-scoped sum is $0, and the
 * property's owner has exactly ONE property total, we also sum that
 * owner's null-property_id upfront payments — unambiguous for a
 * single-property owner (which covers Low Price/Founders, and any
 * pre-restructure Support/Premier purchase made while that owner still
 * had only one property). For owners with 2-3 properties who already
 * purchased Support/Premier BEFORE this change (item 6's per-property
 * restructuring), the historical payment can't be safely attributed to
 * one specific property automatically — this is a known gap; see the
 * payment-flow report for the recommended manual backfill.
 */
export async function getCompletedUpfrontForProperty(
  supabase: SupabaseClient,
  propertyId: string,
): Promise<{ totalAmount: number; mostRecent: CompletedPaymentRow | null }> {
  const { data } = await supabase
    .from("payments")
    .select("id, service_id, property_id, amount, created_at")
    .eq("property_id", propertyId)
    .eq("status", "completed")
    .in("payment_type", ["one_time", "plan_switch_noop"])
    .order("created_at", { ascending: false });
  const rows = (data as CompletedPaymentRow[] | null) ?? [];
  let totalAmount = rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);

  if (totalAmount === 0) {
    const { data: property } = await supabase
      .from("properties")
      .select("owner_id")
      .eq("id", propertyId)
      .maybeSingle();
    const ownerId = property?.owner_id as string | undefined;
    if (ownerId) {
      const { count: ownerPropertyCount } = await supabase
        .from("properties")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", ownerId);
      if (ownerPropertyCount === 1) {
        const { data: legacyRows } = await supabase
          .from("payments")
          .select("id, service_id, property_id, amount, created_at")
          .eq("user_id", ownerId)
          .is("property_id", null)
          .eq("status", "completed")
          .in("payment_type", ["one_time", "plan_switch_noop"]);
        totalAmount = (legacyRows || []).reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
      }
    }
  }

  return { totalAmount, mostRecent: rows[0] ?? null };
}

/** PYME equivalent — PYME plans have no property_id, so they're keyed by user+plan instead. */
export async function getCompletedPaymentForUserPymesPlan(
  supabase: SupabaseClient,
  userId: string,
  pymesPlanId: string,
): Promise<CompletedPaymentRow | null> {
  const { data } = await supabase
    .from("payments")
    .select("id, service_id, property_id, amount, created_at")
    .eq("user_id", userId)
    .eq("pymes_plan_id", pymesPlanId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as CompletedPaymentRow | null) ?? null;
}

/**
 * Bulk variant for pages rendering many property+service cards at once
 * (e.g. the per-property plan breakdowns) — one query instead of N.
 * Returns a Set of "propertyId:serviceId" keys that have a completed
 * payment.
 *
 * Backward-compatibility fallback (see
 * getCompletedPaymentForPropertyService's docstring for why this
 * exists): callers here always pass one owner's full property list
 * (every page in this codebase resolves `ownerProperties` once and
 * reuses it), so "this owner has exactly one property" can be checked
 * directly against `propertyIds.length` without an extra query. When
 * true, that single property also picks up the owner's legacy
 * null-property_id completed payments.
 */
export async function getCompletedPaymentKeysForProperties(
  supabase: SupabaseClient,
  propertyIds: string[],
): Promise<Set<string>> {
  if (propertyIds.length === 0) return new Set();
  const { data } = await supabase
    .from("payments")
    .select("property_id, service_id")
    .in("property_id", propertyIds)
    .eq("status", "completed")
    .not("service_id", "is", null);
  const keys = new Set<string>();
  for (const row of data || []) {
    if (row.property_id && row.service_id) {
      keys.add(`${row.property_id}:${row.service_id}`);
    }
  }

  if (propertyIds.length === 1) {
    const { data: property } = await supabase
      .from("properties")
      .select("owner_id")
      .eq("id", propertyIds[0])
      .maybeSingle();
    const ownerId = property?.owner_id as string | undefined;
    if (ownerId) {
      const { data: legacyRows } = await supabase
        .from("payments")
        .select("service_id")
        .eq("user_id", ownerId)
        .is("property_id", null)
        .eq("status", "completed")
        .not("service_id", "is", null);
      for (const row of legacyRows || []) {
        if (row.service_id) keys.add(`${propertyIds[0]}:${row.service_id}`);
      }
    }
  }

  return keys;
}
