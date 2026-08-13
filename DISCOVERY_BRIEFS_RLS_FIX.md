# Root Cause Confirmed

`discovery_briefs` already had valid owner SELECT and INSERT policies. The blocker was its admin `FOR ALL` policy querying `profiles` directly. Evaluating that subquery invoked the self-referential admin policy on `profiles`, causing recursive RLS evaluation during an otherwise valid owner insert.

# Exact Policy Change(s) Made

Added `public.is_discovery_briefs_admin()`, a narrowly scoped `SECURITY DEFINER` function that checks the existing `profiles.role = 'admin'` rule without invoking profiles RLS. Execute permission is limited to `authenticated`.

Recreated only `Admins can view all discovery briefs` as an authenticated `FOR ALL` policy using that function in both `USING` and `WITH CHECK`. Existing owner SELECT, INSERT, and UPDATE policies were left unchanged.

# Migration File Created/Modified

Created `supabase/migration_v38_discovery_briefs_rls.sql` following the repository's additive numbered migration convention.

# Admin Access Verification (confirm admin FOR ALL access is unchanged)

Admin access remains `FOR ALL`: SELECT, INSERT, UPDATE, and DELETE across every `discovery_briefs` row. The admin criterion remains exactly `profiles.role = 'admin'`; only the non-recursive evaluation mechanism changed.

# What Was Intentionally Not Changed

No application code, other table policy, role definition, schema column, historical migration, commercial/marketing access, registration, authentication, onboarding, email, payment, pricing, scoring, or service-tier behavior was changed.

# Expected Result

An authenticated owner can insert and select their own `discovery_briefs` row through the existing owner policies without the admin policy triggering recursive profiles RLS. Admins retain full access to all discovery briefs. Final onboarding can proceed to its existing Dashboard navigation after the remaining required operations succeed.
