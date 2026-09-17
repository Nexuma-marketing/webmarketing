# Does PropertyEditForm Actually Call /api/profiling (verified, exact code)

**Yes, unconditionally, confirmed by re-reading the exact code.** This
part of the prior diagnosis was correct — the bug is downstream of this
call, not here. Exact code,
[src/components/property/property-edit-form.tsx:293-342](src/components/property/property-edit-form.tsx#L293-L342):

```ts
const { error: updateError } = await supabase
  .from("properties")
  .update({
    title: `${data.property_type} in ${data.zone_city}`,
    property_type: data.property_type,
    address: data.address,
    city: data.zone_city,
    province: data.province,
    postal_code: data.postal_code || null,
    monthly_rent: data.monthly_rent,
    bedrooms: parseInt(data.bedrooms),
    bathrooms: Math.floor(parseFloat(data.bathrooms.replace(" Bath", ""))),
    area_sqft: typeof data.area_sqft === "number" ? data.area_sqft : null,
    amenities: data.amenities,
    common_areas: data.common_areas,
    availability_date: data.availability_date || null,
    dishwasher: data.dishwasher,
    pet_friendly: data.pet_friendly,
    smart_home: data.smart_home,
    smart_home_features: data.smart_home_features,
    shared_unit: data.shared_unit,
    levels: data.levels || null,
    furnished: data.furnished,
    utilities_included: data.utilities_included,
    style: data.style || null,
    near_parks: data.near_parks,
    near_churches: data.near_churches,
    near_skytrain: data.near_skytrain,
    skytrain_lines: data.skytrain_lines,
    near_bus: data.near_bus,
    social_life: data.social_life || null,
    near_mall: data.near_mall,
    nearby_supermarkets: data.nearby_supermarkets,
    is_available: data.occupancy_status === "vacant",
    occupancy_status: data.occupancy_status,
    vacancy_date: data.vacancy_date || null,
    listing_platforms: data.listing_platforms,
  })
  .eq("id", property.id)
  .eq("owner_id", user.id);

if (updateError) throw updateError;

// Re-run profiling so tier/CFP/payback reflect the updated rent,
// etc. — reuses the existing endpoint, does not change its logic.
await fetch("/api/profiling", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ type: "owner" }),
}).catch(() => null);
```

Two important, verified facts:

1. **This first `.update()` never touches `elite_tier`, `service_tier`,
   `cfp_monthly`, or `payback_months`** — only property detail fields
   (`monthly_rent` included). This is exactly why the rent change to
   $2,300 persisted and displays correctly — it's a completely separate,
   unconstrained write. It also correctly throws (`if (updateError) throw
   updateError`) and would have shown the form's error banner if it had
   failed, which the user did not see (consistent with "saved
   successfully").
2. **The `/api/profiling` call is unconditional** — no role check, no
   guard, fires on every successful save regardless of property or user
   state. `.catch(() => null)` only intercepts a **network-level**
   failure (DNS/connection refused/etc.); it does **not** inspect the
   HTTP response status. A `200` with a silently-incomplete result and a
   `500` with a caught server-side exception look identical to this
   code — both just resolve, and the result is discarded either way. No
   `.then()`, no `response.ok` check, no logging. This is a real gap,
   but — see below — it turns out not to be why this specific case
   failed (the request itself returns 200 `{success:true}`, but does
   something silently wrong inside).

# Does /api/profiling Actually Process This Property (verified, exact code)

`/api/profiling`'s `"owner"` case ([src/app/api/profiling/route.ts](src/app/api/profiling/route.ts)) calls `profileOwner(user.id, ...)` with no
additional filtering — no per-property scoping, no role gate beyond what
`profileOwner()` itself does. Re-verified `profileOwner()`
([src/lib/profiling.ts:184-284](src/lib/profiling.ts#L184-L284)) end to
end:

- It fetches **every** property for `userId` (not just the one being
  edited) — `select("id, monthly_rent")`.
- Role branch: `isCurrentlyInvestor = currentRole === "inversionista"`.
  Since this property only appears in "Your Portfolio" at all when
  `isInvestor` is true on the dashboard pages, this user's
  `profiles.role` must already be `"inversionista"` — so
  `isCurrentlyInvestor || propertyCount >= 4` is true, `serviceTier =
  "elite"` is set for **all** of this user's properties, with no
  early return or role-based skip before the property loop.
- The loop (`src/lib/profiling.ts:256-284`) then runs for every
  property, computing `propEliteTier = classifyEliteTier(rent)` and
  attempting to persist it. **This is where it silently fails — not
  from a role check or a "wrong property" filter, but a swallowed
  database write error:**

```ts
await supabase
  .from("properties")
  .update({
    service_tier: serviceTier,
    elite_tier: propEliteTier,
    cfp_monthly: cfp,
    payback_months: paybackMonths,
  })
  .eq("id", prop.id);
```

**This is the exact line — the result of `.update(...)` is never
assigned or checked.** No `{ error }` destructuring, no `if (error)`,
nothing. If Postgres rejects this `UPDATE` for any reason, `profileOwner()`
has no way of knowing and continues on to the next property and to
updating `profiles` (role, property_count) normally, then returns
successfully. `/api/profiling` therefore returns **HTTP 200
`{success:true, role, serviceTier, propertyCount}`** even though the
per-property write for this exact row silently failed.

**Why would Postgres reject it?** Found the actual cause — a schema
constraint, not application logic:

```sql
-- supabase/migration_v2_mvp.sql, line 51
ADD COLUMN IF NOT EXISTS elite_tier TEXT CHECK (elite_tier IN ('essentials', 'signature', 'lujo')),
```

The `properties.elite_tier` column has a Postgres `CHECK` constraint
that only permits `'essentials'`, `'signature'`, `'lujo'`, or `NULL`.
**`'below_minimum' is not in that list.** I grepped every migration file
in `supabase/` for anything that later dropped or altered this
constraint (this codebase does have a precedent for that — e.g.
`profiles_role_check` was dropped and presumably recreated in
`migration_v2_mvp.sql`/`migration_v9_admin_suite.sql` when new roles
were added) and found **none** for `elite_tier`. The constraint added in
`migration_v2_mvp.sql` is still exactly `CHECK (elite_tier IN
('essentials', 'signature', 'lujo'))` today.

So every attempt to write `elite_tier = 'below_minimum'` — whether from
`profileOwner()`'s loop (this case) or from the Discovery Brief
submission path in `src/app/forms/propietario/page.tsx` — is **rejected
at the database layer** with a check-constraint violation (Postgres
error `23514`). The two write sites handle that failure very
differently:

- `profileOwner()` (this bug): the error is discarded entirely, as shown
  above — completely silent, no exception, no log.
- `propietario/page.tsx` submission path (`src/app/forms/propietario/page.tsx:755-757`)
  *does* check this: `if (propError) throw new Error(...)` — so a
  **brand-new** Investor property submitted with rent < $2,500 would
  actually surface a visible error during Discovery Brief submission,
  a different (louder) symptom than this one.

This is the root cause: **`BELOW_PORTFOLIO_MINIMUM_FALLBACK_FIX.md`
added `"below_minimum"` to the TypeScript `EliteTier` union and to
`ELITE_SUB_TIERS`, but never added a migration to widen the database's
`CHECK` constraint to allow it.** The application-level fix was
incomplete without the corresponding schema migration — that gap is
squarely on the prior fix, not a pre-existing bug.

# Does classifyEliteTier(2300) Actually Return "below_minimum" (re-verified)

Re-read the function body fresh, not from memory
([src/lib/profiling.ts:31-37](src/lib/profiling.ts#L31-L37)):

```ts
export function classifyEliteTier(avgMonthlyRent: number): EliteTier | null {
  if (avgMonthlyRent >= 7001) return "lujo";
  if (avgMonthlyRent >= 4000) return "signature";
  if (avgMonthlyRent >= 2500) return "essentials";
  if (avgMonthlyRent > 0) return "below_minimum";
  return null;
}
```

Tracing `classifyEliteTier(2300)` step by step: `2300 >= 7001` → false;
`2300 >= 4000` → false; `2300 >= 2500` → false; `2300 > 0` → **true** →
returns `"below_minimum"`. **Confirmed correct** — the TypeScript
classification logic is not the problem. The value that reaches the
`.update()` call is genuinely `"below_minimum"`; it's rejected one layer
further down, by the database.

# Stale Data vs. Never-Written Assessment

**Never-written, not a caching issue.** Distinguishing the two
precisely:

- Dashboard home and Recommended Services both declare `export const
  dynamic = "force-dynamic"; export const revalidate = 0;` — every page
  load queries Supabase fresh, with no Next.js data cache involved. So
  whatever the card displays is a direct, current read of the database
  row at request time — not a stale cached response.
- `PropertyEditForm.onSubmit` also calls `router.refresh()` right after
  the (fire-and-forgotten) `/api/profiling` call, which invalidates the
  Next.js router cache for the current route — again ruling out a
  client-side caching artifact.
- Given the confirmed `CHECK` constraint rejection, the `UPDATE
  properties SET elite_tier = 'below_minimum', ... WHERE id = ...`
  statement never actually commits for this row — Postgres rejects the
  whole statement (a single `UPDATE ... SET` with a violated `CHECK`
  fails atomically; `cfp_monthly` and `payback_months` in that same
  statement are rejected right along with `elite_tier`, so those two
  should also still read their **old/stale** — likely `NULL` —
  values for this property, not just `elite_tier`). So this isn't "the
  write happened but the UI hasn't caught up" — the write never
  happened at all for this row, on either the "below_minimum" fallback
  fix's initial pass or this most recent "Update Preferences" resave.
- This also explains why the *first* diagnostic
  (`BELOW_MINIMUM_NOT_APPLIED_DIAGNOSTIC.md`) reasoned itself into the
  wrong conclusion: it correctly proved the code *would* compute and
  *attempt* to write `"below_minimum"`, and reasonably (but wrongly)
  assumed a successful HTTP 200 from `/api/profiling` meant the write
  succeeded. It didn't check whether the underlying `.update()` call
  inside `profileOwner()` could itself fail silently against a schema
  constraint the fix never touched.

# What The User Should Check In Browser DevTools (Network tab) If Still Unclear

Given the above, a Network tab check would most likely show:

- A `POST /api/profiling` request **was** sent when "Save Changes" was
  clicked (confirms the unconditional call in `PropertyEditForm` does
  fire).
- Its response status is almost certainly **`200`**, body something like
  `{"success":true,"role":"inversionista","serviceTier":"elite","propertyCount":N}`
  — because `profileOwner()` itself doesn't throw; it just silently
  fails to persist this one field-set for this one row. A `200` here
  would **not** mean "it worked," only that `profileOwner()` didn't
  throw — it's fully consistent with the per-property `UPDATE` being
  rejected by the database underneath it.

If the user wants to confirm the exact database-level rejection (rather
than infer it, as this report does from the migration file), the
authoritative check is a direct query — I don't have database access
from this environment ( no `psql`/Supabase CLI/credentials available, as
noted in the prior diagnostic) — rather than the Network tab, since the
HTTP response here won't reveal a swallowed server-side error either.
Recommended check, if DB access is available:

```sql
SELECT id, monthly_rent, elite_tier, cfp_monthly, payback_months
FROM properties
WHERE address ILIKE '%Southlawn%';
```

Expect `monthly_rent = 2300`, `elite_tier = NULL`,
`cfp_monthly`/`payback_months` still at whatever stale values they held
before this save (not `230.00`/recomputed) — which would conclusively
confirm the `UPDATE` is failing exactly where and why this report
identifies, and rule out any remaining doubt about a role-check,
wrong-property-filter, or caching explanation.

No files were modified as part of this diagnostic task.
