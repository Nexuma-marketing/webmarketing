# Part 1 — Grants and Recursion Fix (per table: exact grant added, recursion fix applied or not needed)

- `matching_rules`: grants `SELECT` to `authenticated`. Its existing admin-or-marketing `FOR ALL` policy now uses `public.is_forms_admin_or_marketing()`, preserving both staff roles without a direct `profiles` subquery.
- `services`: grants `SELECT` to `authenticated`. Its existing admin-only `FOR ALL` policy now uses `public.is_customer_data_admin()`.
- `site_content`: grants `SELECT` to `authenticated`. Its existing admin-only `FOR ALL` policy now uses `public.is_customer_data_admin()`.
- `app_config`: grants `SELECT` to `authenticated`. Its existing admin-only `FOR ALL` policy now uses `public.is_customer_data_admin()`.
- `storage.objects`: grants only `SELECT` and `INSERT` to `authenticated`, matching the existing checked-in public-read and authenticated-upload policies for bucket `property-images`. No Storage policy was changed, and no `DELETE` grant was added.

No live database query or migration application was performed. The Storage grant is idempotent and ensures the required privileges when the migration is manually applied.

# Part 2 — Leads Query Removal (files changed, confirmation the removed data was never rendered, OR discrepancy report if it was actually used)

No leads query was removed. Inspection contradicted the premise that its result is unused: `src/app/(dashboard)/dashboard/page.tsx` assigns the count to `leadCount` and renders an **Active Leads** card containing that value whenever it is greater than zero. The task’s stop condition therefore applied, and that file was left unchanged.

No count-style `leads` query was found in `src/app/(dashboard)/dashboard/services/page.tsx` or another customer Dashboard page. No grant or RLS policy on `leads` was changed.

# Part 3 — pymes_plans Filter Fix (exact change made, OR schema-gap report if no matching field exists)

`src/app/results/pymes/[id]/page.tsx` already selects the complete customer-owned `pymes_diagnosis` row, including `total_score`. The shared `pymes_plans` catalog has the existing tier field `plan_type`, constrained to `rescue`, `growth`, or `scale`.

The invalid `.eq("user_id", user.id)` filter was replaced with an active-plan lookup by `plan_type`, derived only from the confirmed score bands: 7–14 → `rescue`, 15–24 → `growth`, and 25–35 → `scale`. No query is made for an out-of-range score. No schema field was invented.

# Migration File Created (Part 1 only)

`supabase/migration_v41_additional_customer_read_grants_and_recursion.sql`

This is one new additive migration after v40. It was not applied to Supabase.

# Application Files Modified (Part 2 and/or 3 only)

- `src/app/results/pymes/[id]/page.tsx`: only the `pymes_plans` lookup filter and the score-to-existing-tier selection needed by that filter were changed.

The customer Dashboard file was not modified because its lead count is rendered.

# What Was Intentionally Not Changed

No table or policy outside `matching_rules`, `services`, `site_content`, `app_config`, and the table grants on `storage.objects` was changed. Existing customer/public read policies and all Storage RLS policies remain unchanged. No `DELETE`, `INSERT`, or `UPDATE` privilege was added to the four relational catalog/config tables. No Storage `DELETE` privilege was added.

The `leads` and `payments` tables, their grants, and their RLS policies were not touched. No scoring formula, score value, pricing, plan definition, diagnosis submission, acquisition form, or other application code was changed.

# How To Apply (plain language: which part requires a Supabase SQL step, which parts are already-committed-locally code changes)

1. Review `supabase/migration_v41_additional_customer_read_grants_and_recursion.sql`.
2. Open the project in the Supabase dashboard and choose **SQL Editor**.
3. Create a new query, paste the entire migration into it, and click **Run** once. This is the only part requiring a Supabase SQL step.
4. Review the local code change in `src/app/results/pymes/[id]/page.tsx`. It is present in the working tree but has not been committed, pushed, merged, or deployed.
5. Part 2 has no code change because the inspected lead count is rendered; decide separately whether the **Active Leads** card and its query should both be removed in a future authorized change.

# Expected Result

After v41 is manually applied, authenticated customers can read the four required catalog/config tables and upload/read Property Owner or Investor images while existing RLS continues to control row access. Admin and marketing checks on the four relational tables avoid recursive `profiles` evaluation without changing role eligibility.

The PYME results page selects the active shared plan definition by the diagnosis score’s plan tier instead of querying a nonexistent `user_id` column. The customer Dashboard continues its existing leads query and card because the result was confirmed to be rendered and therefore could not be removed under this task’s stop condition.
