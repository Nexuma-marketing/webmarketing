# Migration Created (constraint widened to include below_minimum)

Created
[supabase/migration_v58_elite_tier_check_widen.sql](supabase/migration_v58_elite_tier_check_widen.sql)
(next sequential number after v57; **not applied**). It widens the
constraint using the exact same drop-and-recreate pattern already
established in this project for widening an enum-like `CHECK`
constraint (`profiles_role_check`, done in
`migration_v2_mvp.sql` and again in `migration_v9_admin_suite.sql`):

```sql
ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_elite_tier_check;

ALTER TABLE properties ADD CONSTRAINT properties_elite_tier_check
  CHECK (elite_tier IN ('essentials', 'signature', 'lujo', 'below_minimum'));
```

`properties_elite_tier_check` is Postgres's default auto-generated name
(`<table>_<column>_check`) for the original inline, unnamed constraint
from `migration_v2_mvp.sql` line 51
(`elite_tier TEXT CHECK (elite_tier IN ('essentials', 'signature', 'lujo'))`).
I grepped every migration file for `elite_tier` and for any
`DROP CONSTRAINT`/`ALTER` touching it — confirmed no migration ever
renamed or widened it, so this is still the live constraint name.
`DROP CONSTRAINT IF EXISTS` makes the migration idempotent and safe to
re-run.

# Silent Error Handling Fixed In profileOwner()

`src/lib/profiling.ts`'s per-property update
(inside `profileOwner()`, the loop at lines ~256-299) previously
discarded the Supabase call's result entirely:

```ts
await supabase
  .from("properties")
  .update({ service_tier: serviceTier, elite_tier: propEliteTier, cfp_monthly: cfp, payback_months: paybackMonths })
  .eq("id", prop.id);
```

Now destructures and checks `{ error }`, logging clearly (property id
and the exact values that were attempted, so a future Vercel log entry
is immediately actionable) without throwing — a failure on one
property's write still shouldn't abort profiling for the user's other
properties or the subsequent `profiles` update, matching this
function's existing "best effort per property" design:

```ts
const { error: propertyUpdateError } = await supabase
  .from("properties")
  .update({
    service_tier: serviceTier,
    elite_tier: propEliteTier,
    cfp_monthly: cfp,
    payback_months: paybackMonths,
  })
  .eq("id", prop.id);

if (propertyUpdateError) {
  console.error(
    `[profileOwner] Failed to update property ${prop.id} (elite_tier=${propEliteTier}, service_tier=${serviceTier}, cfp=${cfp}, payback=${paybackMonths}):`,
    propertyUpdateError,
  );
}
```

This is exactly the kind of failure `BELOW_MINIMUM_STILL_NOT_APPLIED_DIAGNOSTIC.md`
uncovered: the CHECK constraint rejection produced no exception and no
log anywhere, so `/api/profiling` returned `200 {success:true}` while
this specific write silently no-opped. With this change, the same class
of failure (e.g. a future new tier added to application code but not to
the database constraint) will show up immediately in server logs
instead of disappearing.

# Discovery Brief Path Confirmed Already Correct

Re-confirmed, no change needed. `src/app/forms/propietario/page.tsx`,
the Investor property-save path (inside `if (isInvestorSubmit) { ... }`,
lines 742-757):

```ts
const { data: propData, error: propError } = currentProperties[i]
  ? await supabase.from("properties").update(propertyPayload).eq("id", currentProperties[i].id).select().single()
  : await supabase.from("properties").insert({ owner_id: user.id, ...propertyPayload }).select().single();

if (propError) {
  throw new Error(`Failed to save property ${i + 1}: ${propError.message}`);
}
```

This **does** check and surface the error (`throw new Error(...)`), so a
brand-new Investor property submitted with rent under $2,500 would
already have produced a visible failure during Discovery Brief
submission — a louder, more visible symptom than the one this whole
investigation chain was about (which came from the *silent* path in
`profileOwner()`, not this one). No change made here; confirmed correct
as-is.

# Confirmed: elite_tier Isolation From Property Owner/Preferred Owner (exact guard cited)

Verified this remains impossible after the fix, at **both** write sites:

**`profileOwner()` (`src/lib/profiling.ts`)** — `serviceTier` is computed
exactly once per user, before the property loop, from role/property
count (lines 236-253):

```ts
if (isCurrentlyInvestor || propertyCount >= 4) {
  role = "inversionista";
  serviceTier = "elite";
} else if (isCurrentlyOwner) {
  if (propertyCount >= 2) {
    role = "propietario_preferido";
    serviceTier = "preferred_owners";
  } else {
    role = "propietario";
    serviceTier = "basic";
  }
} else {
  throw new Error("Owner profiling requires an existing owner profile role");
}
```

`serviceTier` can only be `"basic"` or `"preferred_owners"` for a
Property Owner/Preferred Owner user — never `"elite"`. The per-property
loop's **sole gate** on classification is:

```ts
if (serviceTier === "elite" && rent > 0) {
  propEliteTier = classifyEliteTier(rent);
  ...
}
```

For any Property Owner/Preferred Owner user, this condition is always
false for every one of their properties, so `propEliteTier` stays at its
initialized `null` (`let propEliteTier: EliteTier | null = null;`) and
`classifyEliteTier()` is never even called. The `.update()` call still
runs for every property regardless of tier, but it always writes
`elite_tier: null` for Basic/Preferred Owner rows — never a
classification value. This is unconditional on the user's role, not on
anything checkable per-property, so there is no way for a Property
Owner/Preferred Owner property to receive a non-null `elite_tier`.

**Discovery Brief submission (`src/app/forms/propietario/page.tsx`)** —
`elite_tier: portfolio?.key ?? null` (line 736) is written **only**
inside `if (isInvestorSubmit) { ... }` (`isInvestorSubmit =
data.user_type === "investor" && propertyCount >= 4`, line 601). The
`else` branch for Owner submissions (line 819 onward,
`propertyPayload` at lines 821-855) **does not include an `elite_tier`
key in its payload at all** — confirmed by reading the object literal in
full. Since Supabase only sets columns explicitly present in an
`update`/`insert` payload, this branch never touches `elite_tier` for a
Property Owner/Preferred Owner property; it stays `NULL` from creation.

Neither guard was touched by this fix — both were already correct and
remain exactly as they were.

# Files Modified

- [supabase/migration_v58_elite_tier_check_widen.sql](supabase/migration_v58_elite_tier_check_widen.sql)
  (new, not applied) — widens `properties_elite_tier_check` to allow
  `'below_minimum'`.
- [src/lib/profiling.ts](src/lib/profiling.ts) — `profileOwner()`'s
  per-property `.update()` now checks and `console.error`s any failure
  instead of discarding the result.

No other files were touched. `classifyEliteTier()`, fee/pricing logic
for Essentials/Signature/Luxury/below_minimum, and
`percentageForPlan()`/Support/Premier Tier logic
(`src/lib/owner-plan-display.ts`) were not modified.

# How To Apply (plain language, Supabase SQL Editor)

1. Open the Supabase dashboard for this project → **SQL Editor**.
2. Paste the contents of
   `supabase/migration_v58_elite_tier_check_widen.sql` and run it. It
   only touches the one `elite_tier` constraint on `properties` — it
   does not modify any data, any other column, or any other table.
3. Once applied, no further manual step is needed for existing
   properties: the next time a write goes through `profileOwner()` for
   an affected owner — e.g. that owner uses **"Update Preferences"** on
   any one of their properties (a no-op edit is enough, since
   `profileOwner()` re-profiles *all* of that owner's properties, not
   just the one being edited), or any other flow that calls
   `/api/profiling` with `type: "owner"` — the below-$2,500 property
   will be correctly reclassified to `elite_tier = 'below_minimum'` with
   its CFP/payback recalculated, and the write will actually persist
   this time instead of being silently rejected.
4. If a similar rejection ever happens again in the future (e.g. a new
   tier added to code without a matching constraint update), it will
   now appear in Vercel's server logs as
   `[profileOwner] Failed to update property <id> (...): <postgres error>`
   instead of vanishing.

# Expected Result

- The database will accept `elite_tier = 'below_minimum'` once the
  migration is applied.
- Re-saving (or any future edit of) a below-$2,500 Investor property will
  correctly persist `elite_tier`, `cfp_monthly`, and `payback_months` —
  the "Set this property's monthly rent to see its portfolio assignment"
  fallback will stop appearing for properties that actually have rent
  set, and the "Below Portfolio Minimum" badge/fee/CFP/Payback/Acquire
  button will render as designed in `BELOW_PORTFOLIO_MINIMUM_FALLBACK_FIX.md`
  / `BELOW_PORTFOLIO_MINIMUM_FULL_CHARGE_FIX.md`.
- Any future silent database rejection during profiling will now be
  visible in server logs immediately.
- Property Owner/Preferred Owner properties remain completely
  unaffected and can never receive a non-null `elite_tier` — confirmed
  by both guards above, neither of which was changed.
