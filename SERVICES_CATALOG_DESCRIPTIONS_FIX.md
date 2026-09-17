# Eligibility Text Added (Essentials/Signature/Luxury, Premier Tier, Low Price)

Traced each plan's `services.description` to its most recent overriding migration (the source of the current live text — later migrations only ever `UPDATE ... WHERE name = ...`, never re-insert):

- **Essentials / Signature / Lujo**: latest text came from `migration_v48_investor_service_assignment_fixes.sql` — e.g. Essentials read *"For properties with monthly rent from $2,500 to $3,999 CAD."*, with no mention that this requires 4+ properties. All three now read *"For Investors with 4+ properties, applied to properties with monthly rent from [range]."*
- **Owner Preferred — Premier Tier**: latest text (`migration_v31_milestone4_final_decisions.sql`) said *"...for contracts longer than one year"* but never stated the 2–3 property eligibility explicitly (only implied by "Property 1... Properties 2 and 3"). Now opens with *"...for Preferred Owners with 2–3 properties, committing to contracts longer than one year."*
- **Low Price**: had no eligibility statement at all (*"Owner Basic — Low Price. Total service fee: 35%..."*). Now opens *"Owner Basic — Low Price, for Basic tier owners with exactly 1 property."*
- **Owner Preferred — Support Tier**: verified — already reads *"Owner Preferred — Support Tier for 2–3 properties..."* (set in `migration_v31`). Confirmed correct, left unchanged.

# Below Portfolio Minimum Removed From Browsable Catalog

Removing this by deactivating the `services` row (as done for item 6 below) was **not usable here** — traced its actual usage and found the row must stay `is_active = true`:
- This same page's own per-property Elite breakdown (`eliteServices`, [services/page.tsx:285-290](<src/app/(dashboard)/dashboard/services/page.tsx#L285-L290>)) resolves it via `servicesByDbName`, itself built from the same `is_active = true`-filtered `allServices` query.
- Dashboard home's own portfolio breakdown does the same lookup independently.
- The Stripe checkout route verifies `ELITE_SUB_TIERS[property.elite_tier].dbServiceName === service.name` against this same row before allowing the one-time charge.

Deactivating it would have silently broken all three — exactly the "Your Portfolio" display the task said not to touch. Instead, excluded it by name at the code level, only from the browsable list:

```ts
const otherServices = allServices?.filter((s) => {
  if (!s.target_roles || s.target_roles.length === 0) return false;
  if (s.name === ELITE_SUB_TIERS.below_minimum.dbServiceName) return false;
  return !s.target_roles.includes(profile.role);
});
```

This is the only place it was leaking into the catalog — its `target_roles = ['inversionista']` means it's excluded from an Investor's own view already (Investor never even reaches the `relevantServices`/`otherServices` grid; `isOwnerRole` skips straight to the dedicated portfolio UI), but for Property Owner and PYME (whose role isn't in that array), it fell into `otherServices` and rendered — under "Investor services" in Property Owner's accordion, and in PYME's opt-in "Own a property?" grid. Both are now filtered out; the row itself, its price, and its use in the real portfolio breakdown are untouched.

# Duplicate Owner Preferred Entry Resolved (root cause + fix)

**Root cause**: `migration_v11_steve_4_29_fixes.sql` seeded a generic `'Plan: Owner Preferred'` row (`description: "Owner plan tier for portfolios of 2–3 properties."`, `price: 0`) for the admin Reassign dropdown. One migration later, `migration_v12_steve_4_30_fixes.sql` introduced the real, detailed split — `'Plan: Owner Preferred — Support Tier'` and `'Plan: Owner Preferred — Premier Tier'` — but the original generic row was never deactivated or removed, so both kept existing side by side with identical `target_roles`.

This is also exactly the source of the broken placeholder price: `formatServicePrice()` in `services/page.tsx` special-cases `category === "plan" && price === 0` by checking the name for `"support"` or `"premier"` substrings; the bare `'Plan: Owner Preferred'` name matches neither and falls through to the generic `"% of first month's rent (one-time)"` string with no actual number.

**Fix**: confirmed via `grep -rn "'Plan: Owner Preferred'"` across `src/` that this exact name string is referenced nowhere in application code (unlike `'...— Support Tier'`/`'...— Premier Tier'`, which are matched by substring in `formatServicePrice`) — it is a pure orphan. Deactivated it (`is_active = false, status = 'paused'`) rather than deleting, consistent with the codebase's existing soft-hide pattern (the admin Services page's own active/paused toggle) and to avoid any risk to historical references (e.g. old `service_recommendations` rows). Only `'Plan: Owner Preferred — Support Tier'` and the separately-correct `'...— Premier Tier'` remain active.

# Lujo to Luxury Fixed In Catalog Description

`PAYBACK_CALC_AND_LUJO_TRANSLATION_FIX.md` was a **label-only** fix scoped to code-level display strings (`src/lib/constants.ts`'s `ELITE_SUB_TIERS.lujo.name = "Luxury"`, plus the pages that render it) — it explicitly left the internal `elite_tier = 'lujo'` value and the `services.name = 'Plan: Elite — Lujo'` row untouched for compatibility. What it never touched was this row's `description` column, which two later migrations (`migration_v31`, then `migration_v48`) both (re)set to text that still says *"...Asset Management, Lujo. For properties..."* — literal customer-facing copy, not an internal key. Since `OtherServiceCard` renders `service.description` directly from the DB with no translation layer, this was the one place "Lujo" kept leaking through. Fixed the description text to say "Luxury" instead. The row's `name` column (used as a lookup key by `ELITE_SUB_TIERS.lujo.dbServiceName` and the checkout security check) is intentionally left as `'Plan: Elite — Lujo'` — same rationale as the original fix.

# Per-Property Pricing Clarity Added

Confirmed the description text for Essentials/Signature/Luxury already said "per property" (from `migration_v48`, unchanged by this fix). The bold price line itself, however, is computed separately in code from raw `price`/`currency` and had no such clarification. Updated `formatServicePrice()` ([services/page.tsx](<src/app/(dashboard)/dashboard/services/page.tsx#L377>)):

- Essentials/Signature/Luxury (flat non-zero prices $900/$1,410/$1,650) now render `"$900 CAD / property"` etc. Scoped to only these three by name match, so unrelated flat-priced services (PYMES plans, Tenant Property Search, Professional Photography, ...) — which really are a single price, not per-property — are not mislabeled.
- Owner Preferred Support Tier / Premier Tier's custom price strings (which show `0` in the DB and are entirely code-generated text) now end with `"— per property"` as well, for the same clarity, since they also cover 2–3 properties at differing rates (30%/28%).

# Premium Tenant Concierge Hidden From Shared Catalog

Confirmed in the current code (`services/page.tsx`) that `'Premium Tenant Concierge'` (`target_roles = ['inquilino_premium']`, seeded in `migration_v2_mvp.sql`, never deactivated in any later migration) was still fully `is_active`, meaning it rendered in **both** places that source from the same `is_active = true` query: a Premium Tenant's own "Recommended for You" (`relevantServices`, since it matches `profile.role`) **and** the shared "Other Available Services" catalog for Property Owner/Investor/PYME (`otherServices`, since it doesn't match their role). Deactivated it (`is_active = false, status = 'paused'`) — the single shared flag this codebase already uses to hide a service everywhere at once, which is what "too difficult to reliably deliver" as a stated reason calls for: fully retired, not merely re-categorized out of one view. This also makes it consistently gone from a Premium Tenant's own dashboard, closing the gap the task's framing assumed was already closed.

# Confirmed Applied Across All Roles' Views

All six fixes live in the one shared data source (`services` table) and the one shared component (`services/page.tsx`'s `OtherServiceCard` / `formatServicePrice` / `otherServices` filter) that every role's "Other Available Services" panel renders from — there are no per-role copies. Verified:
- Property Owner: sees the accordion-grouped `ownerOtherServiceGroups`, built from the same (now-fixed) `otherServices` list.
- Investor: same accordion groups; also unaffected by the Below Portfolio Minimum change since investors never reach this grid for their own tier (confirmed above).
- PYME: sees the same `otherServices` list in the "Own a property?" opt-in accordion.

# Files Modified / Migration Created (if data-only changes needed)

- **New**: `supabase/migration_v59_services_catalog_descriptions.sql` — idempotent `UPDATE` statements for all description/eligibility text changes and the two deactivations (duplicate Owner Preferred, Premium Tenant Concierge). Not yet applied — per existing precedent (e.g. `migration_v57`'s own header comment), this needs to be run against Supabase (SQL Editor or migration runner) by someone with DB access; it was not executed from this sandbox and nothing was committed/pushed/deployed.
- [src/app/(dashboard)/dashboard/services/page.tsx](<src/app/(dashboard)/dashboard/services/page.tsx>) — `formatServicePrice()` now appends per-property clarity for Elite Essentials/Signature/Luxury and Owner Preferred Support/Premier Tier; `otherServices` filter now excludes the Below Portfolio Minimum row by name.

# Expected Result

Once `migration_v59` is applied: Essentials/Signature/Luxury, Premier Tier, and Low Price all state who actually qualifies before quoting a rent range or property count. The Luxury tier's catalog card no longer says "Lujo." Only one "Owner Preferred — Support Tier" entry remains (alongside the distinct Premier Tier), with its broken "% of first month's rent (one-time)" placeholder duplicate gone. "Premium Tenant Concierge" no longer appears anywhere the `services` table is queried with `is_active = true` — not in the shared catalog, not in a Premium Tenant's own dashboard. "Plan: Elite — Below Portfolio Minimum" no longer appears as a browsable catalog card for Property Owner or PYME, while continuing to work exactly as before inside an actual Investor's own portfolio breakdown for a qualifying property. Essentials/Signature/Luxury's price line reads e.g. "$900 CAD / property" instead of a bare "$900 CAD", and Owner Preferred's percentage-based price lines are similarly marked per property.
