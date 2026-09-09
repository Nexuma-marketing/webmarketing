# Objectives Per-Property Fix

Implements the approach confirmed in `OBJECTIVES_PER_PROPERTY_DIAGNOSTIC.md`. The migration was created but **not applied** — it must be run manually (see "How To Apply" below).

# Migration Created (schema change + backfill)

[supabase/migration_v52_property_level_objectives.sql](supabase/migration_v52_property_level_objectives.sql) (next number after `v51`):

1. `ALTER TABLE properties ADD COLUMN IF NOT EXISTS objectives TEXT[] DEFAULT '{}';`
2. Backfill: for every property whose `objectives` is still null/empty, copies in that property owner's current `discovery_briefs.objectives` (matched by `owner_id = discovery_briefs.user_id`). Written as an idempotent `UPDATE ... FROM ...` — safe to re-run, and it will never overwrite objectives a customer has already set per-property after this migration runs.
3. Adds a `COMMENT ON COLUMN discovery_briefs.objectives` marking it legacy/no-longer-authoritative. **The column and its data are untouched** — nothing is dropped or deleted.

Not applied by me, per instructions.

# Dashboard Editor Moved To Per-Property Edit Flow

[src/components/property/objectives-editor.tsx](src/components/property/objectives-editor.tsx):
- Prop renamed `briefId` → `propertyId`.
- Save action changed from `.from("discovery_briefs").update({ objectives }).eq("id", briefId)` to `.from("properties").update({ objectives }).eq("id", propertyId)`.
- Copy changed from *"These preferences apply to your account, not any single property."* to *"These objectives apply to this property only."*

[src/app/(dashboard)/dashboard/preferences/[id]/page.tsx](src/app/(dashboard)/dashboard/preferences/%5Bid%5D/page.tsx):
- Now imports and renders `ObjectivesEditor`, passing `property.id` (the real, single-property id this page already loads by `.eq("id", id).eq("owner_id", user.id)`) and `property.objectives || []`.
- Rendered above `PropertyEditForm` in its own centered `max-w-2xl` wrapper so it doesn't collide with `PropertyEditForm`'s own full-height wizard layout.

`src/types/database.ts`'s `Property` interface gained `objectives: string[]` to reflect the real schema.

# Removed From Account-Level Preferences Page

[src/app/(dashboard)/dashboard/preferences/page.tsx](src/app/(dashboard)/dashboard/preferences/page.tsx):
- Removed the `ObjectivesEditor` import and its rendered card.
- Removed the now-unused `discovery_briefs` query that fetched `brief.objectives` for that card.
- Updated the page's intro copy from *"...or update your investment objectives below."* to *"Select a property to edit its details and investment objectives."* — objectives editing now only happens inside each property's own edit page.

# Registration Form Updated (per-property collection)

`src/types/forms.ts`:
- `ownerFormSchema.objectives` changed from `z.array(z.string()).min(1, ...)` (one flat list, collected once) to `z.array(z.array(z.string())).default([])` — an array indexed the same way as `cities`/`rents`, one objectives list per property.
- `propertyOnlySchema` (used by both "Add Property" and, via `propertyEditSchema = propertyOnlySchema.omit(...)`, the per-property edit form) gained `objectives: z.array(z.string()).default([])`.

`src/app/forms/propietario/page.tsx`:
- Step 1 no longer collects objectives. `trigger([...])` for Step 1 dropped `"objectives"`; the old single Step-1 checklist block was deleted; Step 1's description changed to `"Tell us about yourself."`.
- Step 2 (the existing "enter city & rent for each property" loop, which already runs identically for both the owner and investor paths) now also renders an objectives checklist inside each property's card, backed by `objectives[i]` / a new `toggleObjective(index, value)` helper. Step 2's title/description and the loop's intro paragraph now mention objectives.
- `syncPropertyArrays(count)`, which keeps `cities`/`rents` (and `investorProps`) sized to `property_count`, now also grows/shrinks `objectives` the same way.
- `objectives` was removed from `defaultValues`'s flat form and re-added as `[[]]` (one empty array, matching `cities: [""]` / `rents: [0]`).
- `briefPayload` no longer includes `objectives` — the comment explains it's now stored per-property and `discovery_briefs.objectives` is legacy.
- Both places that build a `propertyPayload` for a `properties` insert/update now include it:
  - Investor loop (creates/updates one row per `i < propertyCount`): `objectives: data.objectives[i] || []`.
  - Owner (non-investor) branch, which — pre-existing, unrelated behavior — only ever creates/updates the *first* property from this form: `objectives: data.objectives[0] || []`.

# Add Property Flow — Objectives Handling (confirmed included or explicitly excluded, with reasoning)

**Included.** `src/app/forms/propietario/add-property/page.tsx` creates exactly one new `properties` row per submission and already collects every other per-property preference field on that same row in its Step 1 (`amenities`, `common_areas`, `listing_platforms`, `occupancy_status`, etc.) using the identical `fieldOptions(fieldMeta, key, LIST).map(...)` + `toggleArray` checklist pattern objectives itself uses elsewhere. There is no separate "account-level" step in this flow to conflict with — it is, structurally, the single natural place to ask for this new property's objectives. Added:
- A local `OBJECTIVES` constant (same 8 options as the main form).
- `objectives: []` default value, a `watch("objectives")`, and a checklist block placed right after "Monthly Rent" in Step 1.
- `objectives: data.objectives` added to the `properties.insert(...)` payload.

The per-property **edit** form (`property-edit-form.tsx`, used at `/dashboard/preferences/[id]`) was deliberately left alone — task item 2 places the standalone `ObjectivesEditor` card on that same page instead (see above), so objectives there is saved independently of `PropertyEditForm`'s own multi-step `onSubmit`, which never touches the `objectives` key and therefore can't accidentally clobber it.

# Files Modified

- `supabase/migration_v52_property_level_objectives.sql` (new)
- `src/components/property/objectives-editor.tsx`
- `src/app/(dashboard)/dashboard/preferences/[id]/page.tsx`
- `src/app/(dashboard)/dashboard/preferences/page.tsx`
- `src/types/forms.ts`
- `src/types/database.ts`
- `src/app/forms/propietario/page.tsx`
- `src/app/forms/propietario/add-property/page.tsx`

# What Was Intentionally Not Changed

- **`discovery_briefs.objectives` column**: left in place with existing data, only commented as legacy — not dropped, not cleared.
- **`property-edit-form.tsx` / `propertyEditSchema`'s own submit payload**: does not read or write `objectives` — that field stays owned by the separate `ObjectivesEditor` card on the same page, as instructed.
- **CFP/Payback, portfolio classification (`getPortfolio`, `PORTFOLIO_FEES`), matching logic, Stripe checkout**: untouched — confirmed in the diagnostic that nothing there reads `objectives`, and no calculation code was touched here either.
- **Tenant or PYMES flows**: untouched — objectives has never existed there.
- **The owner (non-investor) branch's pre-existing limitation** that it only ever creates/updates the *first* property from the 6-step form regardless of `property_count` 2–3 (additional properties for that tier are added later via "Add Property"): this is a pre-existing quirk unrelated to objectives, not introduced or fixed here — `objectives[0]` simply follows the same indexing every other first-property-only field (`data.amenities`, `data.style`, etc.) already uses in that branch.
- Did not apply the migration, commit, push, or deploy.

# How To Apply (plain language, Supabase SQL Editor)

1. Open the Supabase Dashboard for this project → **SQL Editor** → **New query**.
2. Open [supabase/migration_v52_property_level_objectives.sql](supabase/migration_v52_property_level_objectives.sql) in this repo, copy its full contents, and paste them into the SQL Editor.
3. Click **Run**. This will:
   - Add the new `objectives` column to `properties` (safe no-op if it somehow already exists).
   - Copy each customer's existing account-level objectives onto every property they currently own, wherever that property doesn't already have its own objectives.
   - Leave `discovery_briefs.objectives` exactly as it is today, just labeled legacy.
4. No further manual step is needed — the app code in this change already reads/writes `properties.objectives` going forward.

# Expected Result

- Every existing property a customer owns will show, immediately after the migration runs, the same objectives that used to show once for their whole account — nothing appears empty or lost.
- On `/dashboard/preferences`, the account-level "Investment Objectives" card is gone; the page copy now just points the customer at each property's own **Edit**.
- On `/dashboard/preferences/[id]` for any one property, an "Investment Objectives" card appears above that property's edit wizard, correctly labeled *"These objectives apply to this property only,"* and saving it only changes that one property's row.
- A customer can now give two properties different objectives (e.g. "Cover mortgage payments" on one, "Get return on property investment" on another), which was impossible before this change.
- On the 6-step registration form, Step 2 ("Property Portfolio") now asks for objectives once per property being registered, for both the owner and investor paths, instead of once for the whole submission on Step 1.
- On "Add Property," the new property's own objectives can be set at creation time, defaulting to an empty list if skipped.
- `discovery_briefs.objectives` keeps whatever data it already had; the app no longer reads or writes it.

**Not yet verified in a live browser**: this environment has no Node/npm toolchain available (no `node_modules`, no `node`/`npm`/`pnpm`/`yarn` on PATH), so `next dev`, `tsc --noEmit`, and an actual signed-in click-through of `/dashboard/preferences`, `/dashboard/preferences/[id]`, the 6-step form, and "Add Property" could not be run. All edits were instead checked by hand against the existing patterns they reuse (`cities`/`rents` indexing, `fieldOptions`/`toggleArray` conventions, the untyped Supabase client) and by grepping the whole `src/` tree afterward to confirm no stale `briefId` or Step-1-objectives references remain. Recommend running the migration on a dev/staging Supabase project and clicking through those four surfaces before shipping to production.
