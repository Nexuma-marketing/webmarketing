-- ============================================================
-- WebMarketing v41 — additional customer read grants and RLS recursion fix
--
-- Authenticated customers read matching_rules, services, site_content, and
-- app_config during matching and Dashboard flows, but require the matching
-- base SELECT grants before their existing RLS policies can be evaluated.
-- Owner and Investor photo flows likewise require base INSERT and SELECT
-- grants on storage.objects for the existing property-images bucket policies.
--
-- The four relational tables also have admin/staff policies that query
-- profiles directly. This migration preserves their existing role and command
-- scopes while switching those checks to the non-recursive SECURITY DEFINER
-- helpers introduced by migration v40.
-- ============================================================

GRANT SELECT
  ON TABLE public.matching_rules
  TO authenticated;

GRANT SELECT
  ON TABLE public.services
  TO authenticated;

GRANT SELECT
  ON TABLE public.site_content
  TO authenticated;

GRANT SELECT
  ON TABLE public.app_config
  TO authenticated;

GRANT SELECT, INSERT
  ON TABLE storage.objects
  TO authenticated;

-- matching_rules retains its existing admin-or-marketing FOR ALL access.
DROP POLICY IF EXISTS "Admins can manage matching_rules" ON public.matching_rules;
CREATE POLICY "Admins can manage matching_rules"
  ON public.matching_rules FOR ALL TO authenticated
  USING (public.is_forms_admin_or_marketing())
  WITH CHECK (public.is_forms_admin_or_marketing());

-- The remaining policies retain their existing admin-only FOR ALL access.
DROP POLICY IF EXISTS "Admins can manage services" ON public.services;
CREATE POLICY "Admins can manage services"
  ON public.services FOR ALL TO authenticated
  USING (public.is_customer_data_admin())
  WITH CHECK (public.is_customer_data_admin());

DROP POLICY IF EXISTS "Admins can manage site_content" ON public.site_content;
CREATE POLICY "Admins can manage site_content"
  ON public.site_content FOR ALL TO authenticated
  USING (public.is_customer_data_admin())
  WITH CHECK (public.is_customer_data_admin());

DROP POLICY IF EXISTS "Admins can manage app_config" ON public.app_config;
CREATE POLICY "Admins can manage app_config"
  ON public.app_config FOR ALL TO authenticated
  USING (public.is_customer_data_admin())
  WITH CHECK (public.is_customer_data_admin());
