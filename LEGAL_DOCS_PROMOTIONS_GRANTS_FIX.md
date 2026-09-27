# Root Cause Confirmed

Live PostgreSQL grant inspection confirmed that `authenticated` lacked `SELECT` on both `public.legal_documents` and `public.promotions`. It had only `TRUNCATE`, `TRIGGER`, and `REFERENCES`. Supabase therefore returned PostgreSQL error `42501`, `permission denied for table ...`, before row-level security could evaluate whether a customer could see any rows.

Both tables had also retained the old admin-policy pattern that queried `public.profiles` directly from an RLS policy. That pattern can recursively evaluate `profiles` RLS. The repository already provides the non-recursive `SECURITY DEFINER` helper `public.is_customer_data_admin()`, which checks exactly the same `admin` role.

# Exact Grants Added

The migration adds only these privileges:

```sql
GRANT SELECT
  ON TABLE public.legal_documents
  TO authenticated;

GRANT SELECT
  ON TABLE public.promotions
  TO authenticated;
```

It does not grant `INSERT`, `UPDATE`, or `DELETE` on either table.

# Recursion Fix Applied (per table, if needed)

## `public.legal_documents`

The existing `Admins can manage legal_documents` policy used a direct `profiles` subquery and recognized only `role = 'admin'`. It is recreated with `public.is_customer_data_admin()` and retains `FOR ALL` admin management behavior. Both `USING` and `WITH CHECK` are explicit.

The existing `Anyone can read legal_documents` SELECT policy is not changed. After the new table grant, authenticated customers can reach that existing read policy.

## `public.promotions`

The existing `Admins can manage promotions` policy used the same direct `profiles` subquery and recognized only `role = 'admin'`. It is recreated with `public.is_customer_data_admin()` and retains the same `FOR ALL` admin scope. Both `USING` and `WITH CHECK` are explicit.

No customer-facing promotions RLS policy was added or broadened because this task is grants-only and explicitly prohibits weakening existing RLS protections. The new `SELECT` grant removes the table-level permission error, while promotion row visibility remains controlled by the policies already present in the target database.

# Migration File Created

`supabase/migration_v43_legal_documents_promotions_grants.sql`

The requested change was described as the next migration after v41. The working tree already contained the separate, pre-existing `migration_v42_authenticated_lead_registration.sql` from the preceding task. To avoid a duplicate migration number or modifying that out-of-scope file, this migration uses the next collision-free sequential number, v43.

# What Was Intentionally Not Changed

- No table other than `public.legal_documents` and `public.promotions` is referenced by the new migration, other than calling the already-existing helper function.
- No application code was changed.
- No existing migration was edited.
- No schema columns, constraints, triggers, or data were changed.
- No `INSERT`, `UPDATE`, or `DELETE` privilege was granted to customers.
- The public/customer read policy on `legal_documents` was not changed.
- No new or broader promotions row-visibility policy was added.
- The set of roles considered administrative was not changed; it remains exactly `admin` through `public.is_customer_data_admin()`.
- The migration was not applied to any local, Preview, remote, or production database.
- Nothing was committed, pushed, merged, or deployed.

# How To Apply (plain language, Supabase SQL Editor)

1. Open the Supabase project for the intended environment.
2. Open **SQL Editor** and create a new query.
3. Copy the complete contents of `supabase/migration_v43_legal_documents_promotions_grants.sql` into the editor.
4. Review that the query names only `public.legal_documents`, `public.promotions`, and the existing `public.is_customer_data_admin()` helper.
5. Run the query once.
6. Verify `information_schema.role_table_grants` now shows `SELECT` for `authenticated` on both tables and does not show customer `INSERT`, `UPDATE`, or `DELETE` grants added by this migration.
7. Test customer onboarding and promotion display in the relevant Preview environment before considering production application.

# Expected Result

- Authenticated reads of `public.legal_documents` no longer fail with PostgreSQL error `42501`; the existing public-read RLS policy permits the rows required by onboarding.
- Authenticated reads of `public.promotions` no longer fail at the table-privilege layer with `42501`. Returned rows remain subject to the target database's existing promotions RLS policies.
- Authenticated customers still cannot create, edit, or delete legal documents or promotions through privileges added by this migration.
- Admin management eligibility remains restricted to the same `admin` role, now checked through the non-recursive helper.
- The old recursive `profiles` subquery pattern is removed from both tables' admin policies.
