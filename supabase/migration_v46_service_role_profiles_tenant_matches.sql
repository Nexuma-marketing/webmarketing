-- ============================================================
-- WebMarketing v46 — Tenant Matches service_role SELECT grants
--
-- The checked-in Tenant Matches route reads profiles and
-- tenant_preferences through supabaseAdmin. service_role bypasses RLS, but
-- it still requires base table privileges. This migration follows v44's
-- grants-only pattern and adds only the two SELECT privileges used by that
-- route. No RLS policy or authenticated/anon privilege is changed.
-- ============================================================

-- Pre-grant verification: is_present = false identifies a missing explicit
-- service_role SELECT grant before any privilege is added.
WITH required_grants(table_name, privilege_type) AS (
  VALUES
    ('profiles', 'SELECT'),
    ('tenant_preferences', 'SELECT')
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

-- Add only a missing SELECT privilege. Re-running the migration does not
-- broaden access or duplicate grants.
DO $migration$
DECLARE
  required_grant record;
BEGIN
  FOR required_grant IN
    SELECT *
    FROM (VALUES
      ('profiles', 'SELECT'),
      ('tenant_preferences', 'SELECT')
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

-- Post-grant verification: both rows should report is_present = true.
WITH required_grants(table_name, privilege_type) AS (
  VALUES
    ('profiles', 'SELECT'),
    ('tenant_preferences', 'SELECT')
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
