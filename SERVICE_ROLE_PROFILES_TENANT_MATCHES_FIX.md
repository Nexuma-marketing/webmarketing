# Root Cause Confirmed

`src/app/api/admin/tenant-matches/route.ts` uses the service-role-backed `supabaseAdmin` client to read all tenant rows from `public.profiles`. The deployed `service_role` lacks the base table-level `SELECT` privilege on that table, so PostgreSQL rejects the request with `42501 permission denied for table profiles` before RLS is relevant.

The same route next reads `public.tenant_preferences` through `supabaseAdmin`. That operation requires the equivalent base `SELECT` privilege and is included so the route does not fail at its next required query after `profiles` is corrected.

# Grants Verified Missing (via information_schema query)

The migration begins with a read-only query against `information_schema.role_table_grants` for exactly these required grants:

- `service_role` / `public.profiles` / `SELECT`
- `service_role` / `public.tenant_preferences` / `SELECT`

It reports one row per requirement with `is_present = false` when the explicit grant is missing. The confirmed live `profiles` failure establishes that its required access is absent or ineffective. The migration checks `tenant_preferences` explicitly before granting rather than assuming its state.

The migration was not run against a local or remote database during implementation, so no live query result is claimed in this report. When applied in the Supabase SQL Editor, its first result set is the requested pre-grant verification, followed by the conditional grants and a post-grant result set in which both rows should show `is_present = true`.

# Exact Grants Added

Only the privileges used by Tenant Matches are conditionally added:

```sql
GRANT SELECT ON TABLE public.profiles TO service_role;
GRANT SELECT ON TABLE public.tenant_preferences TO service_role;
```

The migration implements these through the same conditional `information_schema.role_table_grants` loop used by v44, so an already-present privilege is not changed or duplicated.

The checked-in route confirms the minimum scope:

- `profiles`: `.select("id, full_name, email, role, phone, created_at")` followed by tenant-role filtering.
- `tenant_preferences`: `.select(...)` followed by tenant-ID filtering and ordering.

There is no `INSERT`, `UPDATE`, or `DELETE` on either table in this route.

# Other supabaseAdmin Usages Found On These Tables (if any)

Other checked-in `supabaseAdmin` reads of `profiles` exist in shared helpers and in admin, dashboard, Stripe, export, reporting, user, property, image, business-profile, reassignment, and payment flows. Examples include `src/lib/leads.ts`, `src/lib/balance-invoice.ts`, `src/app/api/stripe/webhook/route.ts`, `src/app/api/admin/users/route.ts`, `src/app/api/admin/team/route.ts`, `src/app/api/admin/export/route.ts`, and `src/app/(dashboard)/admin/page.tsx`. These existing reads will also be able to use the same table-level `SELECT` privilege; no additional privilege is introduced for them.

There are also `supabaseAdmin` update operations on `profiles`, including the Stripe-customer update in `src/lib/balance-invoice.ts` and the admin user update route. Those are outside this confirmed Tenant Matches SELECT-only failure. This migration deliberately does not grant `UPDATE`.

The repository search found no other `supabaseAdmin.from("tenant_preferences")` call beyond `src/app/api/admin/tenant-matches/route.ts`. Other application access patterns are not used to broaden this migration.

# Migration File Created

`supabase/migration_v46_service_role_profiles_tenant_matches.sql`

This follows the repository's sequential convention after the already-applied v45 migration.

# What Was Intentionally Not Changed

- No RLS policy was added, removed, or modified.
- No privilege for `authenticated` or `anon` was changed.
- No `INSERT`, `UPDATE`, or `DELETE` privilege was granted.
- No table other than `public.profiles` and `public.tenant_preferences` was referenced by a grant.
- No application code or existing migration was changed.
- The separate missing error checks for later Tenant Matches queries were not addressed.
- Nothing was committed, pushed, deployed, or applied to a database.

# How To Apply (plain language)

Open the Supabase SQL Editor for the intended project, copy the complete contents of `supabase/migration_v46_service_role_profiles_tenant_matches.sql`, and run it once.

Review the first result set to see whether each required grant was present before the change. After the conditional grant block runs, review the final result set; both `profiles / SELECT` and `tenant_preferences / SELECT` should report `is_present = true`. Then reload Tenant Matches in the deployed application.

# Expected Result

The `supabaseAdmin` tenant-profile query should pass the base privilege check instead of returning `42501`. The following `tenant_preferences` SELECT should also have the required base privilege. The route can then continue to its already-granted `properties` SELECT, compute the tenant matches, and return the populated response to both authorized admin and internal-role users.
