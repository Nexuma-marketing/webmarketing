-- ============================================================
-- WebMarketing v44 — first service_role base table grants fix
--
-- Live Vercel webhook errors:
--   INSERT on public.payments:
--     "permission denied for table payments" (code 42501)
--     Hint: "GRANT INSERT ON public.payments TO service_role;"
--
--   SELECT on public.services:
--     "permission denied for table services" (code 42501)
--     Hint: "GRANT SELECT ON public.services TO service_role;"
--
-- This is the first service_role grants fix in this project. Prior grants
-- migrations v38-v43 targeted authenticated access. This migration changes
-- base table privileges only; it does not create or modify RLS policies.
-- ============================================================

-- Pre-grant verification: one row per privilege required by the checked-in
-- Stripe webhook. is_present = false identifies a missing explicit grant.
WITH required_grants(table_name, privilege_type) AS (
  VALUES
    ('payments', 'SELECT'),
    ('payments', 'INSERT'),
    ('payments', 'UPDATE'),
    ('services', 'SELECT'),
    ('app_config', 'SELECT'),
    ('app_config', 'UPDATE'),
    ('leads', 'UPDATE'),
    ('properties', 'SELECT'),
    ('properties', 'UPDATE')
)
SELECT
  required_grants.table_name,
  required_grants.privilege_type,
  (role_table_grants.privilege_type IS NOT NULL) AS is_present
FROM required_grants
LEFT JOIN information_schema.role_table_grants AS role_table_grants
  ON role_table_grants.table_schema = 'public'
 AND role_table_grants.table_name = required_grants.table_name
 AND role_table_grants.grantee = 'service_role'
 AND role_table_grants.privilege_type = required_grants.privilege_type
ORDER BY required_grants.table_name, required_grants.privilege_type;

-- Add only privileges that the pre-grant information_schema check shows are
-- absent. Re-running the migration does not broaden or duplicate grants.
DO $migration$
DECLARE
  required_grant record;
BEGIN
  FOR required_grant IN
    SELECT *
    FROM (VALUES
      ('payments', 'SELECT'),
      ('payments', 'INSERT'),
      ('payments', 'UPDATE'),
      ('services', 'SELECT'),
      ('app_config', 'SELECT'),
      ('app_config', 'UPDATE'),
      ('leads', 'UPDATE'),
      ('properties', 'SELECT'),
      ('properties', 'UPDATE')
    ) AS grants_needed(table_name, privilege_type)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.role_table_grants
      WHERE table_schema = 'public'
        AND table_name = required_grant.table_name
        AND grantee = 'service_role'
        AND privilege_type = required_grant.privilege_type
    ) THEN
      EXECUTE format(
        'GRANT %s ON TABLE public.%I TO service_role',
        required_grant.privilege_type,
        required_grant.table_name
      );
    END IF;
  END LOOP;
END
$migration$;

-- Post-grant verification: all nine rows should report is_present = true.
WITH required_grants(table_name, privilege_type) AS (
  VALUES
    ('payments', 'SELECT'),
    ('payments', 'INSERT'),
    ('payments', 'UPDATE'),
    ('services', 'SELECT'),
    ('app_config', 'SELECT'),
    ('app_config', 'UPDATE'),
    ('leads', 'UPDATE'),
    ('properties', 'SELECT'),
    ('properties', 'UPDATE')
)
SELECT
  required_grants.table_name,
  required_grants.privilege_type,
  (role_table_grants.privilege_type IS NOT NULL) AS is_present
FROM required_grants
LEFT JOIN information_schema.role_table_grants AS role_table_grants
  ON role_table_grants.table_schema = 'public'
 AND role_table_grants.table_name = required_grants.table_name
 AND role_table_grants.grantee = 'service_role'
 AND role_table_grants.privilege_type = required_grants.privilege_type
ORDER BY required_grants.table_name, required_grants.privilege_type;
