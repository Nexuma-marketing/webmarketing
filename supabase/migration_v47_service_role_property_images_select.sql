-- WebMarketing v47 — Property View service_role photo-read grant
-- The admin property APIs use supabaseAdmin. service_role bypasses RLS but
-- still needs the base SELECT privilege. No RLS policy is changed here.

-- Pre-grant verification: false proves the privilege is missing.
SELECT EXISTS (
  SELECT 1 FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name = 'property_images'
    AND grantee = 'service_role'
    AND privilege_type = 'SELECT'
) AS service_role_property_images_select_is_present;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'property_images'
      AND grantee = 'service_role'
      AND privilege_type = 'SELECT'
  ) THEN
    GRANT SELECT ON TABLE public.property_images TO service_role;
  END IF;
END
$migration$;

-- Post-grant verification: must be true.
SELECT EXISTS (
  SELECT 1 FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name = 'property_images'
    AND grantee = 'service_role'
    AND privilege_type = 'SELECT'
) AS service_role_property_images_select_is_present;
