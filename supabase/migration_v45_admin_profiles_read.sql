-- ============================================================
-- WebMarketing v45 — admin read access to all profiles
--
-- The repository has two historical names for the profiles admin SELECT
-- policy. The singular-name variant from migrations/001_initial_schema.sql
-- queries profiles from inside a profiles policy and can therefore recurse.
-- v40 replaced only the plural-name variant with the proven non-recursive
-- public.is_customer_data_admin() check.
--
-- Keep the existing customer self-read policy unchanged. Remove only the two
-- historical admin SELECT policy variants, restore the canonical safe policy,
-- and ensure authenticated requests have the base SELECT privilege required
-- before RLS can be evaluated.
-- ============================================================

GRANT SELECT
  ON TABLE public.profiles
  TO authenticated;

DROP POLICY IF EXISTS "Admin can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.is_customer_data_admin());
