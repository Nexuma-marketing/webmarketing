# What Was Reverted (exact prior changes undone)

- Removed the separate single-select `student_status` form field.
- Removed all storage logic that combined employment and student values into a delimiter-based string.
- Removed the parser that split stored values using a delimiter.
- Removed the obsolete delimiter design from `TENANT_MATCHES_UX_FIXES.md`.

# What Was Preserved From Prior Task (Fix 1, Fix 3, and the label-text fix)

- Fix 1 remains intact: non-empty `tenant_preferences.additional_requirements` text is displayed in Admin Tenant Matches.
- Fix 3 remains intact: tenant, owner, and investor property-photo displays retain their responsive grids.
- All current-situation choices retain human-readable labels such as “Employed full-time,” “Local student,” and “International student.”

# New Multi-Select Design (UI and storage approach chosen, with reasoning)

“What is your current situation?” is now a checkbox group containing full-time, part-time, contract, self-employed, local student, international student, retired, and unemployed. At least one choice is required, and any combination can be selected.

The selected values are serialized with `JSON.stringify` and saved as a JSON array in the existing `tenant_preferences.employment_type` text column. This is the least disruptive approach because it provides structured multi-value data without changing the deployed database schema, grants, RLS policies, API shape, or existing rows. No migration is required.

# International Student Follow-Up Logic (confirmed preserved exactly)

The follow-up is visible only while “International student” is checked. It contains the existing six institution choices: University, College, Language school, Co-Op program, Exchange program, and Other. The university-name input appears only when University is selected. Unchecking International student clears both follow-up values; changing away from University clears the university name.

# Updated Classification Parser Logic

`normalizeTenantSituations` converts either a JSON-array string, an already-materialized string array, or a legacy scalar into a normalized array. Premium classification then independently checks whether the array contains a stable-employment value and whether it contains `international_student` with `institution_type === "university"`. Other selected situations do not interfere with either check.

# Legacy Data Compatibility Verified

Legacy scalar values are treated as one-element arrays. Existing aliases from the form metadata are normalized as well: `employed_full`, `employed_part`, `student_local`, and `student_international`. Rows such as `full_time` and `international_student` therefore retain their original meaning without a data migration.

# File(s) Modified

- `src/types/forms.ts`
- `src/app/forms/inquilino/page.tsx`
- `src/lib/profiling.ts`
- `TENANT_MATCHES_UX_FIXES.md`
- `EMPLOYMENT_STUDENT_STATUS_REDESIGN.md`

# Expected Result

Tenants can select any realistic combination of employment, education, retirement, and unemployment states. New submissions persist a structured JSON array, Premium classification reads each relevant value independently, and legacy single-value tenant rows continue to classify correctly.
