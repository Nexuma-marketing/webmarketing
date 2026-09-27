# Objectives Per-Property Diagnostic

Diagnostic only. No files modified.

# Current Schema and Usage Confirmed

- `discovery_briefs.objectives` (`TEXT[]`, default `'{}'`) was added in [migration_v3_forms.sql:68](supabase/migration_v3_forms.sql#L68). `discovery_briefs` is one row per user, not per submission and not per property:
  - [src/types/database.ts:76-97](src/types/database.ts#L76-L97) — `DiscoveryBrief.user_id` is a single FK, no `property_id`.
  - [src/app/forms/propietario/page.tsx:586-598](src/app/forms/propietario/page.tsx#L586-L598) — on submit, the form looks up the user's most recent brief and **updates it in place** rather than inserting a new one ("Update the current brief instead of creating a duplicate brief every time it is submitted"). So even a user with a 4-property investor portfolio has exactly one `discovery_briefs` row, one `objectives` array, shared across every property.
- `properties` table: checked every migration that touches `properties` (`migration.sql`, `migration_v2_mvp.sql`, `migration_v3_forms.sql`, `migration_v5_fixes.sql`, `migration_v6_cfp_payback.sql`, `migration_v37_property_balance_invoice.sql`) plus [src/types/database.ts:36-57](src/types/database.ts#L36-L57) (`Property` interface). **No `objectives` column exists or has ever existed on `properties`.** The concept has only ever lived on `discovery_briefs`, at the user level.
- Corroborating evidence the form itself treats `objectives` as account-wide, not per-property: in [src/types/forms.ts:7-14](src/types/forms.ts#L7-L14), `objectives` sits alongside `user_type` / `property_count` (collected once), while `cities` and `rents` are explicitly comment-labeled "Per-property... arrays matching property_count." The schema author already distinguished per-property fields from account-level ones and put `objectives` in the wrong bucket.

# Where Objectives Is Actually Read/Used Today

Confirmed still write-only. Full repo search (`grep -rn "objectives"` across `src/`) turns up exactly three files that touch it, and all three are on the write/display side of the same feature:

1. [src/app/forms/propietario/page.tsx](src/app/forms/propietario/page.tsx) — collects it in Step 1, writes it into `briefPayload.objectives` ([:574](src/app/forms/propietario/page.tsx#L574)).
2. [src/components/property/objectives-editor.tsx](src/components/property/objectives-editor.tsx) — the dashboard editor added yesterday; only does `.from("discovery_briefs").update({ objectives })` ([:50-53](src/components/property/objectives-editor.tsx#L50-L53)).
3. [src/app/(dashboard)/dashboard/preferences/page.tsx](src/app/(dashboard)/dashboard/preferences/page.tsx) — reads `discovery_briefs.objectives` only to pass it as `initialObjectives` into the editor ([:54-72](src/app/(dashboard)/dashboard/preferences/page.tsx#L54-L72)).

No other consumer reads it:
- No `objectives` reference anywhere under `src/app/(dashboard)/admin/**` (matching page, reports page, reassign page, etc. — checked directly, none mention it).
- `src/lib/profiling.ts` and `src/app/api/profiling/route.ts` (the tenant/property matching logic) do not reference `objectives` or `discovery_briefs` at all.
- `src/app/api/admin/tenant-matches/route.ts` does not reference it.
- The only other `discovery_briefs` column that shows up in `database.ts` with a similar name, `property_objective` (singular, a different field entirely — "rent"/fixed string set at submit time), is unrelated to this `objectives` array and is out of scope for this diagnostic.

**Conclusion: safe to restructure.** There is no matching/classification/admin logic today that depends on `discovery_briefs.objectives`'s current shape or table location — a schema change here has zero downstream consumers to update beyond the three files above.

# Recommended Data Model Change

Add `objectives TEXT[] DEFAULT '{}'` directly to `properties`, matching the type of the existing `discovery_briefs.objectives` column. This is the right approach, not just "a" approach, for three concrete reasons specific to this codebase:

1. **It matches the existing convention exactly.** `properties` already carries several per-property `TEXT[]` fields added the same way (`amenities`, `current_listings`→ actually that one's on `discovery_briefs`, but `amenities`, `common_areas`, `listing_platforms`, `skytrain_lines` are all `TEXT[] DEFAULT '{}'` columns added via `ALTER TABLE properties ADD COLUMN IF NOT EXISTS ...` in past migrations). Adding `objectives` the same way is a one-line, low-risk, additive migration consistent with `migration_v3_forms.sql:84-87` and `migration_v37`'s pattern.
2. **The UI already has the right home for it.** [src/components/property/property-edit-form.tsx](src/components/property/property-edit-form.tsx) and the per-property route `dashboard/preferences/[id]` (added in the immediately preceding commit `5ad122d`, "Replace Update Preferences with per-property select-and-edit flow to fix array-position property mismatch bug") already load/edit a single `properties` row by its real id, scoped to `owner_id`. This is precisely the flow objectives should be edited through — no new page pattern needs to be invented.
3. **No junction table or normalization is warranted.** Objectives is a small fixed checklist (8 options, see `OBJECTIVES` in `objectives-editor.tsx` and `propietario/page.tsx`), already modeled everywhere else in this schema as a flat `TEXT[]` (`amenities`, `common_areas`, `current_listings`, `listing_platforms`, etc.), never as a separate lookup/junction table. A `property_objectives` join table would be more "correct" relationally but is inconsistent with every other multi-select field in this codebase and adds needless complexity for ~8 static string values.

Concretely, the next migration (`migration_v52_...sql`, following the current `v51`) should contain:

```sql
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS objectives TEXT[] DEFAULT '{}';
```

# Migration Path For Existing Account-Level Data

Recommend: **copy the existing `discovery_briefs.objectives` value to every property currently owned by that user, as a one-time backfill, then leave `discovery_briefs.objectives` in place (do not drop it) as a legacy/unused field.**

Why this is the safest option, and why over the alternatives:

- **Copy-to-all-properties (recommended) vs. leaving it blank per property:** Leaving new `properties.objectives` empty for existing rows would silently erase every customer's already-stated objectives from the UI (the dashboard would render "no objectives selected" for portfolios that, until yesterday, showed real values from `discovery_briefs`). Since there is no way to know which objective belonged to which property under the old one-per-account model, copying the same account-level array to *every* existing property is the only backfill that doesn't lose or invent data — it reproduces exactly what the customer already told the company, applied to every property they have (which was also implicitly the behavior of the current, buggy, account-wide feature). The customer can then edit each property individually going forward, which is the entire point of the fix.
- **Keep `discovery_briefs.objectives` column (don't drop):** It's read nowhere else (confirmed above), so leaving it is zero-cost, but dropping it is an irreversible one-way migration for a column that: (a) is still written by the registration form on every resubmission (`propietario/page.tsx:574`) unless that form is also updated in the same change, and (b) has no urgency to remove. Given nothing reads it going forward, mark it legacy in a comment rather than deleting it — safer, reversible, and avoids a second coordinated change (form + column drop) in the same migration.
- Suggested backfill SQL (for the same or immediately following migration):

```sql
UPDATE properties p
SET objectives = db.objectives
FROM discovery_briefs db
WHERE p.owner_id = db.user_id
  AND (p.objectives IS NULL OR p.objectives = '{}');
```

# Impact On 6-Step Registration Form (report only)

Confirmed: **objectives is currently collected once per submission, not per property**, and this needs to change for the fix to be complete.

- In [src/types/forms.ts:7-14](src/types/forms.ts#L7-L14), `objectives` is declared in the same "collected once" group as `user_type` and `property_count`, explicitly separate from the comment-labeled "Per-property" fields `cities` and `rents` (which are arrays sized to `property_count`).
- In [src/app/forms/propietario/page.tsx:1102-1121](src/app/forms/propietario/page.tsx#L1102-L1121), the objectives checklist is rendered once on Step 1 ("Tell us about yourself and your property objectives"), validated once via `trigger(["user_type", "property_count", "objectives"])` ([:433](src/app/forms/propietario/page.tsx#L433)), and written once into `briefPayload.objectives` ([:574](src/app/forms/propietario/page.tsx#L574)).
- Per-property fields for investors (`property_type`, `address`, `amenities`, `occupancy_status`, etc.) are instead collected via the `investorProps[i]` array during the later per-property steps, and mapped one-for-one into each `propertyPayload` at insert/update time ([:662-698](src/app/forms/propietario/page.tsx#L662-L698)). `objectives` is conspicuously **not** included in `propertyPayload`, consistent with it never having been modeled per-property.
- Once `properties.objectives` exists, this form would need: (a) `objectives` to move into the per-property step/array (alongside `cities[i]`/`rents[i]`/`investorProps[i]`) instead of being asked once on Step 1, and (b) `propertyPayload` to include `objectives: ip.objectives` for each property on insert/update. This diagnostic does not implement that change.

# Recommended Fix (describe only, do not implement)

1. **Migration** — add `migration_v52_property_level_objectives.sql`:
   - `ALTER TABLE properties ADD COLUMN IF NOT EXISTS objectives TEXT[] DEFAULT '{}';`
   - Backfill: copy each user's current `discovery_briefs.objectives` into every property they currently own (see SQL above).
   - Leave `discovery_briefs.objectives` in place, commented as legacy/no-longer-authoritative.
2. **Dashboard editor** — move `ObjectivesEditor` from `/dashboard/preferences` (account-level) into the per-property edit flow at `/dashboard/preferences/[id]` (i.e., into `PropertyEditForm`, or as a sibling card on that page), writing to `properties.objectives` for that specific `property.id` instead of `discovery_briefs.objectives` for `briefId`. Update its copy from "These preferences apply to your account, not any single property" to something like "These objectives apply to this property only."
3. **Remove** the `ObjectivesEditor` card from the top-level `/dashboard/preferences/page.tsx` (it should no longer show an account-wide objectives block once every property has its own).
4. **Registration form** — in `src/app/forms/propietario/page.tsx` and `src/types/forms.ts`:
   - Move `objectives` validation out of the Step-1-only `trigger([...])` call and into the per-property step, sized to `propertyCount` the same way `cities`/`rents` already are (e.g. an `objectives: string[][]` or `investorProps[i].objectives`).
   - Add `objectives: ip.objectives` (or equivalent) to `propertyPayload` in both the investor branch and the owner (non-investor) branch.
   - Decide whether to keep writing a (now-legacy) combined/first-property value into `briefPayload.objectives` for backward compatibility, or stop writing it — since nothing reads `discovery_briefs.objectives` anymore, either is safe; simplest is to stop writing it once the column is confirmed legacy.
5. **Sequencing** — ship the migration + backfill first (so no data is lost even if the UI/form changes land later), then the dashboard editor move, then the registration form change, each independently verifiable.
