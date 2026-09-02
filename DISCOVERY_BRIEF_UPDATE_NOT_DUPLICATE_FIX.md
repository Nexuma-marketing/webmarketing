# Root Cause (why properties were duplicated instead of updated)

`src/app/forms/propietario/page.tsx` was used by the owner/investor dashboard action but treated every submission as a new registration. It always inserted a new `discovery_briefs` row and always called `.insert()` for property rows. It did not load or match any existing properties for the signed-in owner, so re-submitting a four-property investor portfolio created four additional rows.

# Fix Implemented (update/replace logic)

- The form now finds the signed-in user's latest discovery brief and updates it; a new brief is inserted only when none exists.
- Before saving properties, the form fetches the user's existing property IDs in creation order.
- Investor submissions update existing properties by that stable order, add rows only when the submitted portfolio grows, and delete surplus rows when it shrinks. This makes the submitted investor portfolio replace the previous one without duplicating it.
- Standard Property Owner submissions update the existing primary property rather than creating a duplicate. A first-time owner still receives a new property row.

# Button Renamed To "Update Preferences" (Owner/Investor only, confirmed PYME unchanged)

The dashboard Quick Actions link to `/forms/propietario` now says `Update Preferences` for Property Owner and Investor roles. The PYME Quick Action and its `/forms/pymes` flow were not changed.

# Files Modified

- `src/app/forms/propietario/page.tsx`
- `src/app/(dashboard)/dashboard/page.tsx`
- `DISCOVERY_BRIEF_UPDATE_NOT_DUPLICATE_FIX.md`

# What Was Intentionally Not Changed

- The Add Property four-step form was not modified; it remains the dedicated flow for intentionally adding a property.
- Tenant preference updates were not modified.
- The PYME Discovery Brief terminology and flow were not modified.
- Portfolio classification logic was not modified.

# Expected Result

An Investor with four properties who submits four properties again from `Update Preferences` retains four property rows with updated details instead of ending with eight. If the submitted portfolio has fewer properties, its surplus rows are removed; if it has more, only the additional rows are created. A Property Owner re-submission updates their existing primary property instead of duplicating it.
