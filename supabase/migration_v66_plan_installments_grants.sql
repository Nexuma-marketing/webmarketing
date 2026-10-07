-- ============================================================
-- WebMarketing v66 — plan_installments grants
-- (service_role CRUD + authenticated SELECT)
--
-- BUG — Premier Tier installment schedule is never saved.
--
-- Root cause (confirmed in Vercel logs while paying the $200 upfront
-- of a Premier Tier property):
--
--   code: '42501'
--   message: 'permission denied for table plan_installments'
--   hint: 'GRANT INSERT ON public.plan_installments TO service_role;'
--
-- migration_v63_plan_installments.sql created the table, enabled RLS
-- and added two SELECT policies, but never issued a single GRANT. In
-- this project a table GRANT is required before RLS is even evaluated
-- (same class of bug as migration_v44 / v46 / v61), and service_role —
-- although it bypasses RLS — still needs the base table privilege.
--
-- Every code path that touches plan_installments, and the privilege
-- each one needs:
--
--   service_role INSERT
--     - src/lib/premier-installments.ts (schedule insert, called from
--       the Stripe webhook's checkout.session.completed handler and
--       from the admin "Reschedule installments" endpoint)
--   service_role SELECT
--     - src/lib/premier-installments.ts (idempotency check)
--     - src/app/api/cron/process-installments/route.ts (due rows)
--     - src/lib/property-payment-summary.ts (Sales Report)
--     - src/app/api/admin/properties/[id]/route.ts (admin modal)
--   service_role UPDATE
--     - src/app/api/cron/process-installments/route.ts
--       (status -> 'invoiced', stripe_invoice_id, hosted_invoice_url)
--     - src/app/api/stripe/webhook/route.ts
--       (invoice.payment_succeeded -> 'paid', payment_failed -> 'failed')
--   service_role DELETE
--     - src/app/api/admin/properties/[id]/reschedule-installments/route.ts
--       (removes not-yet-invoiced 'scheduled' rows before re-inserting;
--       rows with an invoice or payment are never deleted)
--   authenticated SELECT
--     - src/app/(dashboard)/dashboard/services/page.tsx
--     - src/app/(dashboard)/dashboard/payments/page.tsx
--       Both read the owner's own installments with the cookie-context
--       client, scoped by v63's "Owners can view own plan_installments"
--       RLS policy. Without this grant the query fails with the same
--       42501 and the owner never sees their installment schedule even
--       once the rows exist. RLS still limits rows to the owner's own
--       properties (and to internal staff) — this grant does not widen
--       row visibility.
--
-- Only INSERT is confirmed missing by the production error; the other
-- privileges are checked individually below and granted only if absent.
--
-- Idempotent pre/post verification pattern per
-- migration_v61_payments_promotions_grants.sql. Safe to re-run.
-- ============================================================

-- Pre-grant verification: one row per privilege required by the
-- checked-in code. is_present = false identifies a missing grant.
WITH required_grants(grantee, table_name, privilege_type) AS (
  VALUES
    ('service_role', 'plan_installments', 'SELECT'),
    ('service_role', 'plan_installments', 'INSERT'),
    ('service_role', 'plan_installments', 'UPDATE'),
    ('service_role', 'plan_installments', 'DELETE'),
    ('authenticated', 'plan_installments', 'SELECT')
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
      ('service_role', 'plan_installments', 'SELECT'),
      ('service_role', 'plan_installments', 'INSERT'),
      ('service_role', 'plan_installments', 'UPDATE'),
      ('service_role', 'plan_installments', 'DELETE'),
      ('authenticated', 'plan_installments', 'SELECT')
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
    ('service_role', 'plan_installments', 'SELECT'),
    ('service_role', 'plan_installments', 'INSERT'),
    ('service_role', 'plan_installments', 'UPDATE'),
    ('service_role', 'plan_installments', 'DELETE'),
    ('authenticated', 'plan_installments', 'SELECT')
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
