# Fix 1 — Additional Requirements Display (implemented, exact column used)

The tenant form saves the optional text as `tenant_preferences.additional_requirements`. The admin Tenant Matches API selects that exact column and returns it inside each tenant's `preferences` object. The “Tenant Preferences (from form)” section now renders the value as **Additional requirements** only when the trimmed text is non-empty, while preserving line breaks.

# Fix 2 — Employment/Student Status

This section was superseded by the checkbox-based redesign documented in `EMPLOYMENT_STUDENT_STATUS_REDESIGN.md`.

Step 1 uses human-readable labels and permits every applicable current-situation value to be selected independently. Selections are stored as a JSON array in the existing `employment_type` text column. Legacy scalar rows remain supported. No schema migration is required.

# Fix 3 — Photo Grid Layout (implemented, list of all components fixed)

Customer-facing galleries now consistently use one column on small mobile screens, two columns from the small breakpoint, and three columns on large screens:

- `src/components/tenant/matched-property-card.tsx` — tenant matched-property gallery.
- `src/app/(dashboard)/dashboard/properties/[id]/page.tsx` — owner/investor property detail gallery.
- `src/app/(dashboard)/dashboard/images/page.tsx` — owner/investor property image gallery/management view.

The image uploader preview was already a responsive grid and was left unchanged because it is an upload control rather than a matched/listed-property display.

# Files Modified

- `src/types/forms.ts`
- `src/lib/profiling.ts`
- `src/app/forms/inquilino/page.tsx`
- `src/app/(dashboard)/admin/matches/page.tsx`
- `src/components/tenant/matched-property-card.tsx`
- `src/app/(dashboard)/dashboard/properties/[id]/page.tsx`
- `src/app/(dashboard)/dashboard/images/page.tsx`
- `TENANT_MATCHES_UX_FIXES.md`

# What Was Intentionally Not Changed

- Property matching computation and property eligibility/ranking.
- The property detail modal, including its Zone Profile and city display.
- Database schema or migrations.
- Photo upload, approval, rejection, ordering, or storage behavior.
- Stripe, payments, email, roles, permissions, or unrelated flows.
- Existing unrelated working-tree changes.

# Expected Result

Admin/sales staff can read a tenant's non-empty additional requirements in Tenant Matches. Tenants can select all applicable current situations with readable labels, and Premium classification sees employment and qualifying student signals independently while retaining legacy-row compatibility. Tenant, owner, and investor property galleries display photos in a compact responsive grid instead of a vertically stacked full-width list.
