# Root Cause Confirmed (exact mismatch found)

The Tenant Preferences component stores the answer in the React Hook Form field `employment_type`.

The component's built-in option values are:

- Full-time employment: `full_time`
- Part-time employment: `part_time`
- Temporary contract: `contract`
- Self-employed / Business owner: `self_employed`
- International student: `international_student`

However, `fieldOptions(fieldMeta, "employment_type", EMPLOYMENT_TYPES)` gives admin/DB-backed metadata priority over those built-in values. The tenant metadata backfill contains these actual runtime values:

- Employed full-time: `employed_full`
- Employed part-time: `employed_part`
- Self-employed: `self_employed`
- Local student: `student_local`
- International student: `student_international`
- Retired: `retired`
- Currently unemployed: `unemployed`

On Next, `nextStep()` calls `trigger(["employment_type", "number_of_people", "property_type_desired"])`. The resolver validates `employment_type` with `tenantFormSchema`, whose enum accepts only `full_time`, `part_time`, `contract`, `self_employed`, or `international_student`. Therefore, selecting Employed part-time stored `employed_part`, but validation expected `part_time`, producing `Please select your current situation`.

This is a value-identifier mismatch, not a missing state update, wrong field name, array/string mismatch, database permission problem, or RLS problem.

# Other Questions Checked For Same Pattern (list each, fixed or not needed)

- `number_of_people`: not needed. It stores a string and validation accepts any non-empty string.
- `property_type_desired`: not needed. It stores a string array and validation accepts any non-empty string array.
- `institution_type`: not needed. It stores an optional string without an enum restriction.
- `preferred_zones`: not needed. It stores a string array and validation accepts any non-empty string array.
- `bedrooms_needed`: not needed. It stores a non-empty string.
- `bathrooms_needed`: not needed. It stores a non-empty string.
- `style_preference`: fixed. The component fallback values match the original enum, but runtime tenant metadata can supply `luxury` and `rustic`; the original enum rejected both during final form validation. Those two existing metadata values were added to this field's enum. No labels or options were changed.
- `contract_duration`: not needed. It stores a non-empty string rather than validating against an enum.
- All remaining option-backed questions in this form store unrestricted strings/string arrays or booleans, so the current-situation enum mismatch pattern does not apply.

# Exact Fix Implemented

Added a component-local alias map for the three confirmed legacy metadata identifiers and applied it only to the internal `SelectItem` values:

- `employed_full` → `full_time`
- `employed_part` → `part_time`
- `student_international` → `international_student`

The option labels and order still come from the same source and are unchanged. A selection now writes the canonical value expected by validation. This also restores the existing International student conditional follow-up, which checks for `international_student`.

For the separately identified `style_preference` mismatch, the direct tenant validation helper now also accepts the existing runtime metadata values `luxury` and `rustic`. Existing accepted style values and all other validation rules are unchanged.

# File(s) Modified

- `src/app/forms/inquilino/page.tsx`
- `src/types/forms.ts` (direct Tenant Preferences validation helper only)
- `TENANT_CURRENT_SITUATION_VALIDATION_FIX.md` (this report)

# What Was Intentionally Not Changed

- No question wording, visual option labels, or option order.
- No validation logic for any other form or any other Tenant Preferences question beyond the separately reported `style_preference` value mismatch.
- No personal-info, Owner, Investor, PYME, or Legal Consents form.
- No shared schema or form metadata helper.
- No Supabase schema, RLS, grants, migrations, or database data.
- No commits, pushes, or deployments.

# Expected Result

Selecting Employed part-time now stores `part_time`. Clicking Next recognizes the selection and advances when the other required Step 1 questions are valid. Full-time and International student legacy metadata values are recognized in the same way, and International student continues to reveal its conditional follow-up fields.
