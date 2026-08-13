# Root Cause Confirmed

PostgreSQL returned `permission denied for table discovery_briefs` (error code `42501`) because the `authenticated` role did not have the base table-level `SELECT`, `INSERT`, and `UPDATE` privileges. Table-level grants are checked separately from, and before, row-level security (RLS), so the existing RLS policies could not authorize the request.

# Exact Grants Added

The migration grants `SELECT`, `INSERT`, and `UPDATE` on `public.discovery_briefs` to the `authenticated` role.

It does not grant `DELETE`. The existing owner policies cover only `SELECT`, `INSERT`, and `UPDATE`, and no separate existing policy requires authenticated owners to delete discovery briefs.

# Migration File Created

`supabase/migration_v39_discovery_briefs_grants.sql`

This is a new, separate, additive migration following the existing versioned migration naming convention.

# What Was Intentionally Not Changed

No RLS policy was added, removed, or modified. All four existing `discovery_briefs` policies remain unchanged.

No privileges were granted to `anon`, because there is no existing anonymous or public-access RLS policy for this table. Grants for `service_role` and `postgres` were not changed. No other table, schema structure, column, migration, or application file was changed.

# How To Apply This Migration (step-by-step, in plain non-technical language, assuming the person will run it manually in the Supabase SQL Editor)

1. Open the Supabase project in the Supabase dashboard.
2. Select **SQL Editor** from the left-hand menu.
3. Open the file `supabase/migration_v39_discovery_briefs_grants.sql` from this project.
4. Copy the entire contents of that file.
5. In the Supabase SQL Editor, create a new query and paste the copied SQL into it.
6. Confirm that the query mentions only `public.discovery_briefs`, the `authenticated` role, and the `SELECT`, `INSERT`, and `UPDATE` privileges.
7. Click **Run** once.
8. Confirm that Supabase reports the query completed successfully.
9. Sign in as a Property Owner, complete onboarding, accept the consents, and click **Submit** to verify the flow.

# Expected Result

After the migration is applied, an authenticated Property Owner can submit onboarding successfully: a `discovery_briefs` row is inserted for that user and the user proceeds to the Dashboard. Admin access to all `discovery_briefs` rows remains fully functional and unchanged. No other table, policy, grant, schema element, or application behavior is affected.
