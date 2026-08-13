-- ============================================================
-- WebMarketing v38 — discovery_briefs RLS recursion fix
-- ============================================================

-- Evaluate the existing admin role without invoking profiles RLS from inside
-- the discovery_briefs policy. The function is intentionally specific to this
-- table's policy so other tables and their policies remain unchanged.
CREATE OR REPLACE FUNCTION public.is_discovery_briefs_admin()
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

REVOKE ALL ON FUNCTION public.is_discovery_briefs_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_discovery_briefs_admin() TO authenticated;

-- Preserve the existing admin FOR ALL intent while removing the recursive
-- profiles-policy evaluation from this discovery_briefs policy.
DROP POLICY IF EXISTS "Admins can view all discovery briefs" ON public.discovery_briefs;

CREATE POLICY "Admins can view all discovery briefs"
  ON public.discovery_briefs
  FOR ALL
  TO authenticated
  USING (public.is_discovery_briefs_admin())
  WITH CHECK (public.is_discovery_briefs_admin());

-- Existing owner policies remain unchanged:
--   "Users can view own discovery briefs"   SELECT USING auth.uid() = user_id
--   "Users can insert own discovery briefs" INSERT WITH CHECK auth.uid() = user_id
--   "Users can update own discovery briefs" UPDATE USING auth.uid() = user_id
