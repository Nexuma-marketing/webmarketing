-- ============================================================
-- WebMarketing v40 — customer table grants and RLS recursion fix
--
-- Root cause 1: authenticated customers received PostgreSQL error 42501
-- ("permission denied for table ...") because base table-level privileges
-- were missing. These grants are checked separately from, and before, RLS.
--
-- Root cause 2: admin policies queried public.profiles directly. Evaluating
-- those policies could recursively evaluate profiles RLS and raise error
-- 42P17 ("infinite recursion detected in policy for relation profiles").
-- SECURITY DEFINER helpers preserve the same role checks without recursion.
--
-- Tables covered and inclusion reason:
--   profiles                customer owns SELECT/INSERT/UPDATE of own profile
--   properties              owner has SELECT/INSERT/UPDATE/DELETE of own rows
--   property_images         owner has ALL operations for own property images
--   pymes_captacion         customer has SELECT/INSERT/UPDATE of own rows
--   pymes_diagnosis         customer has SELECT/INSERT/UPDATE of own rows
--   pymes_plans             customers read active plans
--   tenant_preferences      customer has SELECT/INSERT/UPDATE of own rows
--   consent_logs            customer has SELECT/INSERT of own consent records
--   forms_dynamic           customers read active form definitions
--   form_questions          customers read active form questions
--   service_recommendations customer reads own recommendations
--
-- discovery_briefs is intentionally unchanged: v38 already corrected its
-- admin policy and v39 already added its matching authenticated grants.
-- leads is intentionally excluded: its policies support only admins and the
-- service role, not direct customer access.
-- ============================================================

-- Base table privileges matching existing customer RLS policies.
GRANT SELECT, INSERT, UPDATE
  ON TABLE public.profiles
  TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.properties
  TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.property_images
  TO authenticated;

GRANT SELECT, INSERT, UPDATE
  ON TABLE public.pymes_captacion
  TO authenticated;

GRANT SELECT, INSERT, UPDATE
  ON TABLE public.pymes_diagnosis
  TO authenticated;

GRANT SELECT
  ON TABLE public.pymes_plans
  TO authenticated;

GRANT SELECT, INSERT, UPDATE
  ON TABLE public.tenant_preferences
  TO authenticated;

GRANT SELECT, INSERT
  ON TABLE public.consent_logs
  TO authenticated;

GRANT SELECT
  ON TABLE public.forms_dynamic
  TO authenticated;

GRANT SELECT
  ON TABLE public.form_questions
  TO authenticated;

GRANT SELECT
  ON TABLE public.service_recommendations
  TO authenticated;

-- Non-recursive admin check for customer-data policies.
CREATE OR REPLACE FUNCTION public.is_customer_data_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_customer_data_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_customer_data_admin() TO authenticated;

-- Preserve each existing admin policy's command and eligibility exactly.
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.is_customer_data_admin());

DROP POLICY IF EXISTS "Admins can manage all properties" ON public.properties;
CREATE POLICY "Admins can manage all properties"
  ON public.properties FOR ALL TO authenticated
  USING (public.is_customer_data_admin())
  WITH CHECK (public.is_customer_data_admin());

DROP POLICY IF EXISTS "Admins can manage all property images" ON public.property_images;
CREATE POLICY "Admins can manage all property images"
  ON public.property_images FOR ALL TO authenticated
  USING (public.is_customer_data_admin())
  WITH CHECK (public.is_customer_data_admin());

DROP POLICY IF EXISTS "Admins can view all diagnoses" ON public.pymes_diagnosis;
CREATE POLICY "Admins can view all diagnoses"
  ON public.pymes_diagnosis FOR SELECT TO authenticated
  USING (public.is_customer_data_admin());

DROP POLICY IF EXISTS "Admins can manage pymes plans" ON public.pymes_plans;
CREATE POLICY "Admins can manage pymes plans"
  ON public.pymes_plans FOR ALL TO authenticated
  USING (public.is_customer_data_admin())
  WITH CHECK (public.is_customer_data_admin());

DROP POLICY IF EXISTS "Admins can view all preferences" ON public.tenant_preferences;
CREATE POLICY "Admins can view all preferences"
  ON public.tenant_preferences FOR SELECT TO authenticated
  USING (public.is_customer_data_admin());

DROP POLICY IF EXISTS "Admins can view all consent logs" ON public.consent_logs;
CREATE POLICY "Admins can view all consent logs"
  ON public.consent_logs FOR ALL TO authenticated
  USING (public.is_customer_data_admin())
  WITH CHECK (public.is_customer_data_admin());

DROP POLICY IF EXISTS "Admins can view all consent_logs" ON public.consent_logs;
CREATE POLICY "Admins can view all consent_logs"
  ON public.consent_logs FOR SELECT TO authenticated
  USING (public.is_customer_data_admin());

DROP POLICY IF EXISTS "Admins can manage recommendations" ON public.service_recommendations;
CREATE POLICY "Admins can manage recommendations"
  ON public.service_recommendations FOR ALL TO authenticated
  USING (public.is_customer_data_admin())
  WITH CHECK (public.is_customer_data_admin());

-- Form policies also allow the existing marketing role; keep that exact
-- eligibility while removing their direct profiles subqueries.
CREATE OR REPLACE FUNCTION public.is_forms_admin_or_marketing()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'marketing')
  );
$$;

REVOKE ALL ON FUNCTION public.is_forms_admin_or_marketing() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_forms_admin_or_marketing() TO anon, authenticated;

DROP POLICY IF EXISTS "Anyone can read active forms" ON public.forms_dynamic;
CREATE POLICY "Anyone can read active forms"
  ON public.forms_dynamic FOR SELECT
  USING (is_active = true OR public.is_forms_admin_or_marketing());

DROP POLICY IF EXISTS "Admins can manage forms" ON public.forms_dynamic;
CREATE POLICY "Admins can manage forms"
  ON public.forms_dynamic FOR ALL TO authenticated
  USING (public.is_forms_admin_or_marketing())
  WITH CHECK (public.is_forms_admin_or_marketing());

DROP POLICY IF EXISTS "Anyone can read questions for active forms" ON public.form_questions;
CREATE POLICY "Anyone can read questions for active forms"
  ON public.form_questions FOR SELECT
  USING (is_active = true OR public.is_forms_admin_or_marketing());

DROP POLICY IF EXISTS "Admins can manage questions" ON public.form_questions;
CREATE POLICY "Admins can manage questions"
  ON public.form_questions FOR ALL TO authenticated
  USING (public.is_forms_admin_or_marketing())
  WITH CHECK (public.is_forms_admin_or_marketing());
