-- ============================================================
-- WebMarketing v61 — payments (authenticated SELECT) and
-- promotions (service_role CRUD) grants fix
--
-- BUG 1 — Payment History shows "No payments yet" after a
-- successful payment, for every plan across all three customer
-- roles (Property Owner, Investor, PYME).
--
-- Root cause: dashboard/payments/page.tsx reads `payments` with
-- the cookie-context (authenticated-role) Supabase client, gated
-- by the existing "Users can view own payments" RLS policy
-- (migration_v8_stripe.sql). That policy is necessary but not
-- sufficient — Postgres also requires an explicit base table
-- GRANT before RLS is even evaluated. `payments` never received
-- one: migration_v40_customer_tables_grants_and_recursion.sql did
-- a comprehensive sweep granting `authenticated` SELECT/INSERT/
-- UPDATE on every other customer-owned table (profiles,
-- properties, pymes_captacion, pymes_diagnosis, tenant_preferences,
-- etc.) and migration_v41 covered services/pymes_plans (the two
-- tables embedded in the payments query) — `payments` itself was
-- simply never listed in either pass.
--
-- The resulting 42501 "permission denied for table payments" is
-- caught by the page (`if (paymentsError) console.error(...)`) but
-- never surfaced to the UI, so `payments` stays null/undefined and
-- the page falls through to the same empty state as a customer
-- with zero transactions: $0 Total Paid, 0 Transactions, 0
-- Pending, "No payments yet". This reproduces identically for every
-- plan/role because the query has no plan-specific logic — it only
-- filters by `user_id`.
--
-- This is independent of whether the webhook's INSERT into
-- `payments` (service_role, migration_v44) is succeeding. Both can
-- be true at once: the row can exist and still be invisible to the
-- owning customer.
--
-- BUG 2 — Admin "New Promotion" create fails with "permission
-- denied for table promotions".
--
-- Root cause: /api/admin/promotions/route.ts (GET/POST/PUT/DELETE)
-- was switched to the service-role client specifically because the
-- cookie-context (authenticated + RLS) admin write path was
-- silently applying nothing (see the route file's own comment:
-- editing a promo's dates updated the UI but not the DB row). That
-- switch fixed the silent-no-op, but `service_role` was never
-- granted any privilege on `promotions` — only `authenticated` got
-- a bare SELECT in migration_v43_legal_documents_promotions_grants.sql
-- (added for the public/customer read paths, which are themselves
-- blocked from ever matching a row by the admin-only "FOR ALL"
-- RLS policy also added in v43). So the admin route's INSERT now
-- fails loudly instead of silently: "permission denied for table
-- promotions" (42501).
--
-- The same missing service_role grant also affects the two banner
-- components that already read `promotions` via service_role
-- (components/dashboard/active-promotions-banner.tsx and
-- components/public/public-promotions-banner.tsx) — both swallow
-- the read error (`const { data } = await supabase...`, no error
-- check) and silently render nothing. Granting service_role SELECT
-- here is required for those banners to ever show a promotion, not
-- just for the admin list view.
--
-- Idempotent pre/post verification pattern per
-- migration_v44_service_role_webhook_grants.sql. Adds only grants
-- confirmed absent; safe to re-run.
-- ============================================================

-- Pre-grant verification: one row per privilege required by the checked-in
-- Payment History page and admin Promotions route. is_present = false
-- identifies a missing explicit grant.
WITH required_grants(grantee, table_name, privilege_type) AS (
  VALUES
    ('authenticated', 'payments', 'SELECT'),
    ('service_role', 'promotions', 'SELECT'),
    ('service_role', 'promotions', 'INSERT'),
    ('service_role', 'promotions', 'UPDATE'),
    ('service_role', 'promotions', 'DELETE')
)
SELECT
  required_grants.grantee,
  required_grants.table_name,
  required_grants.privilege_type,
  (role_table_grants.privilege_type IS NOT NULL) AS is_present
FROM required_grants
LEFT JOIN information_schema.role_table_grants AS role_table_grants
  ON role_table_grants.table_schema = 'public'
 AND role_table_grants.table_name = required_grants.table_name
 AND role_table_grants.grantee = required_grants.grantee
 AND role_table_grants.privilege_type = required_grants.privilege_type
ORDER BY required_grants.table_name, required_grants.grantee, required_grants.privilege_type;

-- Add only privileges that the pre-grant information_schema check shows are
-- absent. Re-running the migration does not broaden or duplicate grants.
DO $migration$
DECLARE
  required_grant record;
BEGIN
  FOR required_grant IN
    SELECT *
    FROM (VALUES
      ('authenticated', 'payments', 'SELECT'),
      ('service_role', 'promotions', 'SELECT'),
      ('service_role', 'promotions', 'INSERT'),
      ('service_role', 'promotions', 'UPDATE'),
      ('service_role', 'promotions', 'DELETE')
    ) AS grants_needed(grantee, table_name, privilege_type)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.role_table_grants
      WHERE table_schema = 'public'
        AND table_name = required_grant.table_name
        AND grantee = required_grant.grantee
        AND privilege_type = required_grant.privilege_type
    ) THEN
      EXECUTE format(
        'GRANT %s ON TABLE public.%I TO %I',
        required_grant.privilege_type,
        required_grant.table_name,
        required_grant.grantee
      );
    END IF;
  END LOOP;
END
$migration$;

-- Post-grant verification: all five rows should report is_present = true.
WITH required_grants(grantee, table_name, privilege_type) AS (
  VALUES
    ('authenticated', 'payments', 'SELECT'),
    ('service_role', 'promotions', 'SELECT'),
    ('service_role', 'promotions', 'INSERT'),
    ('service_role', 'promotions', 'UPDATE'),
    ('service_role', 'promotions', 'DELETE')
)
SELECT
  required_grants.grantee,
  required_grants.table_name,
  required_grants.privilege_type,
  (role_table_grants.privilege_type IS NOT NULL) AS is_present
FROM required_grants
LEFT JOIN information_schema.role_table_grants AS role_table_grants
  ON role_table_grants.table_schema = 'public'
 AND role_table_grants.table_name = required_grants.table_name
 AND role_table_grants.grantee = required_grants.grantee
 AND role_table_grants.privilege_type = required_grants.privilege_type
ORDER BY required_grants.table_name, required_grants.grantee, required_grants.privilege_type;
