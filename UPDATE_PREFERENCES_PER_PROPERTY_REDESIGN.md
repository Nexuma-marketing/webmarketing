# Update Preferences — Per-Property Select-and-Edit Redesign

Implements the approved design: "Update Preferences" no longer reopens
the 6-step registration form. It now opens a property list → select →
edit-by-id flow, so a resubmission can never overwrite or delete the
wrong property (the array-position bug documented in
`REMAINING_DUPLICATE_PHOTOS_DIAGNOSTIC.md`) — by construction, this new
flow always operates on exactly one property, loaded and saved by its
real database `id`.

# Old Flow Removed (button/link no longer points to 6-step form)

- `src/app/(dashboard)/dashboard/page.tsx` — the "Update Preferences"
  Quick Action for `isOwnerRole` (Property Owner and Investor roles)
  now links to `/dashboard/preferences` instead of `/forms/propietario`.
- `src/app/forms/propietario/page.tsx` itself was **not modified** — it
  still exists, unchanged, and is still reachable (registration links,
  the "no service tier yet" CTAs) for genuine first-time registration,
  where its position-based matching is safe because there are no
  existing properties to confuse.
- The Tenant "Update Preferences" button (`/forms/inquilino`) was left
  untouched, per scope.

# New Flow Implemented (property list → select → edit single property by id)

1. **`/dashboard/preferences`** (`src/app/(dashboard)/dashboard/preferences/page.tsx`,
   server component) — lists the signed-in owner/investor's properties:
   thumbnail (if any), property type, address/city, and current rent,
   each with an "Edit" button. Works identically for a 1-property Owner
   and a multi-property Investor — the Owner just sees a list of one.
   Empty state (no properties yet) points to `/forms/propietario` for
   genuine first-time registration, matching the existing pattern on
   `/dashboard/properties`.
2. **`/dashboard/preferences/[id]`** — split into:
   - `src/app/(dashboard)/dashboard/preferences/[id]/page.tsx` (server
     component): loads the property with
     `.eq("id", id).eq("owner_id", user.id).single()` — the real
     database id, scoped to the signed-in owner, `notFound()` otherwise.
     This is the fix in one line: there is exactly one candidate row,
     identified by its own id, never by position in an array.
   - `src/components/property/property-edit-form.tsx` (client
     component): a 3-step form (Property Details → Zone & Location →
     Photos) pre-loaded with that exact property's current data, built
     from the same field set as "Add Property". Saving does
     `supabase.from("properties").update({...}).eq("id", property.id).eq("owner_id", user.id)`
     — an update of that one row only, never an array walked by index,
     and never a surplus-deletion pass over other rows.
3. Photos: the edit form shows the property's existing photos (read-only
   grid) and links to `/dashboard/images?property=<id>`
   (`src/app/(dashboard)/dashboard/images/page.tsx`) for adding/removing
   photos. That page was **not modified** — it already loads and saves
   by the property's real id and already has its own dedup guard
   (fingerprint = room + original filename + file size, checked against
   the DB for that exact `property_id` before upload, lines 237-249).
   Routing new uploads through it, rather than re-implementing upload
   logic inside the edit form, guarantees the correct dedup guard is
   used and avoids duplicating that logic a third time.

# Components/Fields Reused From Existing Forms

- `propertyOnlySchema` (`src/types/forms.ts`) — a new
  `propertyEditSchema` derives from it via `.omit()` of the four legal
  consent fields (see next section for why), so all property/zone field
  validation is identical to "Add Property," not reimplemented.
- `DynamicField` + `useFormFieldMeta("owner_property")` + `fieldOptions`
  (`src/lib/form-meta.ts`, `src/components/forms/dynamic-field.tsx`) —
  reused as-is, so admin edits to labels/helper text/options made in
  `/admin/forms` for the `owner_property` slug apply to this edit form
  too, exactly as they already do for "Add Property."
- All option lists (property types, occupancy statuses, amenities,
  common areas, smart home features, bedrooms/bathrooms, styles,
  SkyTrain lines, supermarkets, BC cities, listing platforms) were
  copied from `src/app/forms/propietario/add-property/page.tsx` rather
  than invented — same convention that file already uses relative to
  `page.tsx` (this codebase duplicates these constants per-file rather
  than sharing a module; the new file follows that existing precedent
  instead of introducing a new shared-constants refactor).
- The list page's thumbnail-lookup pattern (first `property_images` row
  per property, ordered by `sort_order`) was copied from
  `src/app/(dashboard)/dashboard/properties/page.tsx` ("My Properties"),
  per the instruction to reuse existing list UI patterns rather than
  build one from scratch.

# Non-Property Preference Fields — Where They Remain Editable

Investigated what the original 6-step form's "preferences" concept
covered besides property data. Two fields exist only there:

- **`user_type`** ("owner" vs "investor"): traced every use in
  `src/app/forms/propietario/page.tsx` — it is only used in-memory to
  decide the tier/investor-path branch at submit time and to fill an
  email notification payload (`/api/owner-submit-email`). It is **never
  written to any table** (not `profiles`, not `discovery_briefs`).
  There is nothing to preserve editing for — it was never a stored,
  re-editable field. The actual persisted equivalent is
  `profiles.role`, already shown read-only on **My Profile**
  ("Account type" badge) — changing owner↔investor after the fact has
  downstream classification effects and was already not editable
  in-place anywhere.
- **`objectives`** (investment objectives checklist): this **is**
  persisted, on `discovery_briefs.objectives` (one row per user, added
  in `migration_v3_forms.sql`). It is not covered by My Profile. Unlike
  property fields, this table is keyed one-per-user, not matched by
  array position against multiple rows — so it has none of the
  mismatch risk this task exists to fix, and is safe to expose for
  direct editing. Added a small **"Investment Objectives"** section at
  the top of `/dashboard/preferences`
  (`src/components/property/objectives-editor.tsx`), backed by
  `supabase.from("discovery_briefs").update({ objectives }).eq("id", briefId)`.
  Note for whoever owns this data: grepping the rest of the app, this
  field is currently write-only — no admin page or matching logic reads
  it today — so this section restores the ability to change it, but it
  was not visibly *consumed* anywhere before this task either.
- `discovery_briefs.cities` / `.rents` were intentionally **left alone**
  — they are a snapshot duplicate of `properties.city` /
  `properties.monthly_rent` taken at the last brief submission, not a
  separate preference, and not displayed anywhere. They will go stale
  relative to the per-property edits made through the new flow; that is
  a pre-existing characteristic of `discovery_briefs` as a point-in-time
  snapshot, not something this task's scope covers.

# Files Modified

- `src/app/(dashboard)/dashboard/page.tsx` — Update Preferences link
  target changed for `isOwnerRole` (Property Owner + Investor).
- `src/types/forms.ts` — added `propertyEditSchema` /
  `PropertyEditFormData`.

# Files Added

- `src/app/(dashboard)/dashboard/preferences/page.tsx` — property list
  + Investment Objectives section.
- `src/app/(dashboard)/dashboard/preferences/[id]/page.tsx` — server
  component, id + ownership-scoped property load.
- `src/components/property/property-edit-form.tsx` — the single-property
  edit form (client component).
- `src/components/property/objectives-editor.tsx` — small client
  component for the `discovery_briefs.objectives` section.

# What Was Intentionally Not Changed

- `src/app/forms/propietario/page.tsx` (6-step registration form) —
  logic untouched, including its position-based matching, which is only
  unsafe when reused for *updates* against existing rows (the case this
  task removes access to, not the first-time-registration case it still
  correctly serves).
- `src/app/forms/propietario/add-property/page.tsx` — untouched, per
  scope; its field UI was read and copied from, not modified.
- `src/app/(dashboard)/dashboard/images/page.tsx` — untouched; reused
  by linking to it, specifically to avoid re-implementing its dedup
  guard.
- Tenant (`/forms/inquilino`) and PYMES preference flows — untouched.
- CFP/Payback calculation and portfolio tier classification logic — not
  modified. The edit form's update payload deliberately excludes
  `service_tier`, `elite_tier`, `cfp_monthly`, and `payback_months`; it
  calls the existing `/api/profiling` endpoint afterward (the same call
  "Add Property" and "Delete Property" already make) so those numbers
  stay in sync with an edited rent/bedroom count, without this task
  touching how they're computed.
- No data repair — any properties/photos already mismatched by the old
  flow are untouched, per instructions (separate manual step).
- No commit, push, or deploy was made.

# Expected Result

- Clicking "Update Preferences" (Owner or Investor) now shows that
  customer's real properties, one card each, instead of a blank
  multi-step form asking them to re-enter everything from scratch in
  some order.
- Editing and saving one property updates only that property's row,
  addressed by its real `id` — an Investor with 4+ properties can no
  longer have one property's data or photos silently overwritten by
  another's, and resubmitting can no longer delete a property via the
  old surplus-deletion step (that code path is gone from this flow
  entirely — there is no multi-row loop to have a surplus in).
- New photo uploads for a property still go through the one dedup guard
  that already correctly checks the database for that exact property's
  id, unchanged and un-duplicated.
- Investment objectives remain editable in a small dedicated section,
  now safely decoupled from the per-property submission that used to
  bundle them together with the buggy matching logic.
