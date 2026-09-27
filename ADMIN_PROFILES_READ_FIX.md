# Root Cause Confirmed

The checked-in schema has two historical creation paths for the admin `SELECT` policy on `public.profiles`:

- `supabase/migration.sql` creates `"Admins can view all profiles"` using a direct subquery against `profiles`.
- `supabase/migrations/001_initial_schema.sql` creates `"Admin can view all profiles"` (singular `Admin`) using the same direct subquery pattern.

Migration v40 replaced only the plural-named policy with the safe `public.is_customer_data_admin()` check. A database initialized through the alternate initial-schema path can therefore retain the singular-named recursive policy alongside the safe policy. That leaves the live admin read path dependent on migration history and can prevent the query from reaching a clean RLS decision.

The other required authorization layer is the base table privilege. Migration v40 contains `GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated`, but the live `42501 permission denied for table profiles` confirms that the deployed database does not currently provide an effective base `SELECT` privilege for this request. The new migration explicitly restores that grant before recreating the RLS policy.

# Existing Admin Policy State (present/absent, safe/unsafe pattern)

A canonical admin read-all policy is present in checked-in migration v40:

```sql
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.is_customer_data_admin());
```

This is the safe, non-recursive pattern already proven in this project. The helper is `STABLE`, `SECURITY DEFINER`, uses an empty `search_path`, reads `public.profiles`, and is executable by `authenticated`.

However, the alternate initial schema also defines `"Admin can view all profiles"` with an unsafe direct subquery back into `profiles`. V40 does not drop that differently named policy. The effective checked-in migration history is therefore not guaranteed to contain only the safe policy.

No checked-in column-level `GRANT` or `REVOKE` restricts `id`, `full_name`, `email`, `role`, `phone`, or `created_at`. The relevant grant is table-level. RLS `SELECT` policies are permissive, so the customer self-read policy is not a competing denial; the unsafe legacy admin policy is the competing policy that must be removed.

# Exact Fix Applied

The migration:

1. Grants table-level `SELECT` on `public.profiles` to the PostgreSQL `authenticated` role so authenticated requests can reach RLS evaluation.
2. Drops only the two historical admin read-all policy names: `"Admin can view all profiles"` and `"Admins can view all profiles"`.
3. Recreates the canonical `"Admins can view all profiles"` policy as `FOR SELECT TO authenticated` using `public.is_customer_data_admin()`.

The existing helper is reused exactly; no new role-check function or authorization pattern was introduced.

# Roles Granted Access (and why, based on checked-in page code)

Read-all row access is granted only to users whose `profiles.role` is `admin`, because `public.is_customer_data_admin()` checks exactly that role.

The table-level grant is made to the Supabase `authenticated` database role, as required for RLS to run, but it does not itself grant access to every row. Non-admin users remain limited by the existing `profiles` RLS policies, including the unchanged self-read policy.

The checked-in Tenant Matches page calls `/api/admin/tenant-matches`. That route permits `admin`, `marketing`, `sales`, and `support` to enter, but its bulk query for other users' profile rows is performed with `supabaseAdmin` (the server-side service-role client). Its authenticated client reads only the caller's own `role`, which is already covered by the customer self-read policy. Therefore marketing, sales, and support do not require—and were not given—authenticated read-all RLS access to `profiles` by this fix.

# Migration File Created

`supabase/migration_v45_admin_profiles_read.sql`

This follows the repository's sequential migration convention after v44.

# What Was Intentionally Not Changed

- No table other than `public.profiles` was touched.
- No application code was changed.
- The existing customer self-read, self-insert, self-update, and any admin update policies were not changed.
- No read-all access was added for marketing, sales, support, customer roles, `anon`, or any other application role.
- No column-level privileges were added because none are needed or used in the checked-in grant model.
- The existing `public.is_customer_data_admin()` helper was not modified.
- The migration was not committed, pushed, deployed, or applied to a local or remote database.

# How To Apply (plain language)

Open the Supabase SQL Editor for the intended project, copy the complete contents of `supabase/migration_v45_admin_profiles_read.sql`, and run it once. Then sign out and back in as the admin user if the current session is stale, and reload Tenant Matches.

The migration is safe to rerun: the grant is idempotent, both policy drops use `IF EXISTS`, and the canonical policy is recreated after the drops.

# Expected Result

An authenticated user whose `public.profiles.role` is `admin` can select tenant rows from `public.profiles`, including `id`, `full_name`, `email`, `role`, `phone`, and `created_at`, without the `42501` table-permission failure or a recursive profiles-policy check.

Non-admin authenticated users retain only the profile rows allowed by their existing policies. The Tenant Matches API continues to serve its checked-in internal-role audience without broadening direct authenticated read-all access.
