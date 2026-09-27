# Root Cause: Missing Zone/Transit Fields In Property View Modal

The Admin Properties list API selected a hand-written subset of `properties`, and the modal rendered only that subset. The MVP Zone Profile fields were absent from both the API SELECT and the modal JSX. This was an omission, not a `target_zones`/`preferred_zones`-style alias mismatch and not a separate zone-table join.

The exact Zone Profile columns are on `public.properties` (added by `supabase/migration_v3_forms.sql`):

- `near_parks boolean`
- `near_churches boolean`
- `near_bus boolean`
- `near_skytrain boolean`
- `skytrain_lines text[]`
- `near_mall boolean`
- `social_life text`
- `nearby_supermarkets text[]`

The owner forms write those same names directly. The three supported SkyTrain lines come from the form options: Expo Line, Millennium Line, and Canada Line.

# Root Cause: Missing Photos In Property View Modal

The table and per-property photo queries use the correct relation and keys: `public.property_images.property_id`, `image_url`, `room_category`, `status`, and `uploaded_at`. They also use `supabaseAdmin`, not the authenticated browser client, so customer-facing RLS policies are not the read path.

The repository's grants history is the issue: migration v44 explicitly gave `service_role` SELECT access to `properties`, and v46 did the same for `profiles` and `tenant_preferences`, but no checked-in migration gave `service_role` SELECT on `property_images`. A service role bypasses RLS but still requires the base table privilege. In addition, the bulk count query discarded its Supabase error and converted a failed query to an empty array. The modal's photo request likewise ignored a non-OK response. Together those behaviors presented a permission failure as `Photos (0)` and “No photos uploaded.”

`supabase/migration_v47_service_role_property_images_select.sql` follows the existing minimal grants-only pattern. It queries `information_schema.role_table_grants` before the grant, conditionally grants only `SELECT` when missing, and verifies the result afterward. It does not alter schema or RLS. The migration was created but was not applied to a database, per the no-deploy/no-external-change instruction.

# Fix Applied To Property View Modal

- Extracted the property detail dialog into the reusable `PropertyDetailModal` component.
- Added a focused authenticated staff endpoint at `GET /api/admin/properties/[id]`.
- Selected and rendered all five Zone Profile columns in a dedicated Zone Profile section.
- Loaded `property_images` through the same detail request and used the returned array length for the displayed photo count.
- Preserved the existing photo approve/reject behavior and plan detail display.
- Made property and photo query failures visible instead of silently reporting zero photos.
- Added the zone columns to the Admin Properties list API as well, keeping its complete property payload accurate.

# Fix Applied To Tenant Matches (View button added, reusing existing modal)

Each property row under Matched Properties now has a View button. It sets the selected property ID and opens the exact same `PropertyDetailModal` used by Admin Properties. The modal retrieves the full property, owner, Zone Profile, amenities, plan, and photos without navigating away.

The Tenant Matches API and its matching filters were not changed.

# Files Modified

- `src/components/admin/property-detail-modal.tsx` (new shared modal)
- `src/app/api/admin/properties/[id]/route.ts` (new focused detail endpoint)
- `src/app/api/admin/properties/[id]/photos/route.ts` (clearer read-error response)
- `src/app/api/admin/properties/route.ts` (Zone Profile fields and non-silent photo-count error handling)
- `src/app/(dashboard)/admin/properties/page.tsx` (uses shared modal)
- `src/app/(dashboard)/admin/matches/page.tsx` (View action using shared modal)
- `supabase/migration_v47_service_role_property_images_select.sql` (minimal conditional SELECT grant)
- `PROPERTY_VIEW_MODAL_AND_TENANT_MATCHES_REUSE_FIX.md` (this report)

# What Was Intentionally Not Changed

- Tenant/property matching computation, filtering, ranking, or scoring
- Tenant preferences data or display
- Property owner onboarding or image upload code
- Database tables, columns, constraints, or RLS policies
- Any other admin page
- Existing availability, photo approval/rejection, or plan-detail behavior
- No migration was applied, and nothing was committed, pushed, or deployed

# Expected Result

Admin and sales users can open a property from either Admin Properties or a tenant's Matched Properties list and see the same complete detail dialog. It shows parks, churches, bus-stop proximity, SkyTrain proximity, the applicable Expo/Millennium/Canada line values, amenities, owner and plan information, and the property's uploaded images.

Once migration v47 is separately reviewed and applied, the service-role photo reads have the required base SELECT privilege. If a read fails for any other reason, the UI now reports the error instead of falsely displaying a zero-photo gallery.

Automated lint/build verification could not be run in this workspace because `npm` is not installed. The required `node_modules/next/dist/docs/` guide directory is also absent from the installed package tree, so no local Next.js guide was available to read.
