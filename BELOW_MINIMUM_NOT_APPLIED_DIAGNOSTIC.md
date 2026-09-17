# Property's Current Database Values (elite_tier, monthly_rent)

**I could not query the live database from this environment** — this
sandbox has no `node`/`npx`/`psql`/Supabase CLI available and no
`.env`/database credentials in the repo (verified: no `.env*` files, no
`supabase/config.toml`, no `SUPABASE_*`/`DATABASE_URL` env vars, and the
app can't be started to hit an API route either, since there's no Node
runtime). I have not fabricated a value for `elite_tier`/`monthly_rent`
— what follows is the exact query to run, plus a diagnosis based on
tracing every code path that can write or read `properties.elite_tier`.

**Run this directly against the database** (Supabase SQL editor or
`psql`) to get the real values:

```sql
SELECT id, address, city, monthly_rent, elite_tier, service_tier,
       cfp_monthly, payback_months, updated_at
FROM properties
WHERE address ILIKE '%Southlawn%';
```

Based on the symptom (the UI shows the generic "no rent set" fallback,
not a "below_minimum" badge) and the code trace below, my strong
expectation is that this query will return **`elite_tier = NULL`** with
`monthly_rent = 2450`.

# Root Cause: Stale Data (never reclassified) vs Display Bug

**This is a stale-data issue, not a display bug** — the code path rules
out a display bug fairly conclusively:

In `src/components/dashboard/elite-portfolio-breakdown.tsx`:

```ts
const tier = prop.elite_tier ? ELITE_SUB_TIERS[prop.elite_tier] : null;
```
```tsx
{tier ? (
  /* full card: badge, fee, CFP, payback, Acquire button */
) : (
  <p>Set this property's monthly rent to see its portfolio assignment</p>
)}
```

The "Set this property's monthly rent..." message is reachable **only**
when `tier` is falsy, which happens **only** when `prop.elite_tier` is
falsy (null/undefined/empty string) — `ELITE_SUB_TIERS["below_minimum"]`
exists and is fully defined (added in `BELOW_PORTFOLIO_MINIMUM_FALLBACK_FIX.md`),
so if the database actually held `elite_tier = "below_minimum"`, `tier`
would be truthy and the full card (slate badge, $735 one-time fee, CFP,
Payback, Acquire button) would render — not this fallback message. There
is no code path in this component, or in `dashboard/page.tsx` /
`services/page.tsx` (which just pass `elite_tier` through unmodified),
that could turn a non-null `"below_minimum"` value into this specific
fallback text. For this exact symptom to appear, `prop.elite_tier` must
actually be null (or some other falsy value) in the data the page
received from the database.

**Why it would still be `NULL`:** `elite_tier` is a stored column, never
computed at render time. It's written in exactly two places, both of
which I already patched with the `below_minimum` classification:

1. `classifyEliteTier()` in `src/lib/profiling.ts`, called from
   `profileOwner()` — runs when `/api/profiling` (`type: "owner"`) is
   hit.
2. `getPortfolio()` in `src/app/forms/propietario/page.tsx` — runs only
   at Discovery Brief **submission** (creating/updating all of an
   Investor's properties in one form flow).

Neither of these functions runs automatically for existing rows just
because the code changed — classification is a write-time computation,
not a read-time one. If this property was created (or last
edited/reprofiled) **before** the fallback-tier fix shipped, its row was
written by the *old* `classifyEliteTier(2450)`, which returned `null`
for any rent under $2,500 — and that `NULL` has sat in the row ever
since, untouched, because nothing has triggered a re-write of that row
since the fix. This is expected, not a bug: the fix corrected the
*logic*, but logic changes don't retroactively rewrite rows that were
already computed and stored under the old logic — there is no
migration/backfill script that swept existing properties (confirmed: no
such migration exists in `supabase/`, and neither
`BELOW_PORTFOLIO_MINIMUM_FALLBACK_FIX.md` nor
`BELOW_PORTFOLIO_MINIMUM_FULL_CHARGE_FIX.md` created one).

# Would "Update Preferences" Reclassify It Correctly (if stale data)

**Yes — confirmed by tracing the exact code path, no new code needed.**

"Update Preferences" (Dashboard home's Quick Actions, for an Investor)
links to `/dashboard/preferences` → picks this property →
`/dashboard/preferences/[id]` → renders `PropertyEditForm`
(`src/components/property/property-edit-form.tsx`). Its `onSubmit`
handler:

```ts
// Updates ONLY this property's row ... service_tier / elite_tier /
// cfp_monthly / payback_months are intentionally left untouched here;
// they are recalculated by the existing profiling logic below.
const { error: updateError } = await supabase.from("properties").update({ ...monthly_rent, ... }).eq("id", property.id)...

// Re-run profiling so tier/CFP/payback reflect the updated rent, etc.
await fetch("/api/profiling", {
  method: "POST",
  body: JSON.stringify({ type: "owner" }),
});
```

`/api/profiling` with `type: "owner"` calls `profileOwner(user.id, ...)`
(`src/lib/profiling.ts`), which loops over **every property this owner
has** (not just the one being edited), re-runs `classifyEliteTier(rent)`
for each, and writes the result back:

```ts
propEliteTier = classifyEliteTier(rent);   // now returns "below_minimum" for $2,450
if (propEliteTier) {
  cfp = calculateCFP(rent);
  const fee = propEliteTier === "below_minimum"
    ? rent * BELOW_MINIMUM_FEE_PERCENT
    : PORTFOLIO_ONE_TIME_FEES[propEliteTier];
  paybackMonths = calculatePayback(fee, cfp);
}
await supabase.from("properties").update({ service_tier, elite_tier: propEliteTier, cfp_monthly: cfp, payback_months: paybackMonths }).eq("id", prop.id);
```

Since `classifyEliteTier()` now contains the `below_minimum` branch
(shipped in `BELOW_PORTFOLIO_MINIMUM_FALLBACK_FIX.md`), simply saving
"Update Preferences" for this property — **even with no actual field
changed** (the form always submits the full payload on "Save Changes",
including the unmodified `monthly_rent: 2450`) — will:

1. Overwrite the row's `monthly_rent` with the same `2450` (no-op).
2. Trigger `/api/profiling` (`type: "owner"`), which recomputes and
   writes `elite_tier: "below_minimum"`, `cfp_monthly: 245.00`, and
   `payback_months: 3.0` for **this property and every other property
   this same Investor owns**.

No code change is required for this — it's purely a matter of the
already-fixed logic never having been re-run against this specific
row.

# Recommended Fix (describe only, do not implement)

The real, durable fix is a **one-time backfill**, not relying on each
Investor to manually resave every existing property (which is fragile —
easy to miss, and multi-property Investors would need to know to do it
at all). Two complementary options, describable without implementing
either:

1. **A one-off backfill migration/script** that re-runs the same logic
   `profileOwner()` already uses (`classifyEliteTier`, `calculateCFP`,
   `calculatePayback` from `src/lib/profiling.ts`) against every
   existing property row where `service_tier = 'elite'` and
   `elite_tier IS NULL` and `monthly_rent > 0` — i.e., exactly the set of
   rows still carrying the old "no classification" result. This could be
   a plain SQL `UPDATE ... CASE` migration (mirroring the style of
   `migration_v49_payback_one_time_fee.sql`, which did a similar
   one-time backfill for a payback-formula correction), or a small
   Node script using `supabaseAdmin` that calls the existing
   `classifyEliteTier`/`calculateCFP`/`calculatePayback` functions
   directly so the backfilled values are guaranteed to match the
   application logic exactly (safer than re-deriving the formula in raw
   SQL, since the 30%/10% rates and thresholds already live in one place
   in `src/lib/profiling.ts`).
2. **Optionally**, going forward, this class of bug (a business-rule
   change that doesn't retroactively apply to existing rows) is generic
   to any future adjustment of `classifyEliteTier()` — worth a shared
   note/checklist item that changes to elite-tier classification should
   always ship with (or be immediately followed by) a backfill pass, the
   same way `migration_v49` already did once before for the payback
   formula.

No files were modified as part of this diagnostic task.
