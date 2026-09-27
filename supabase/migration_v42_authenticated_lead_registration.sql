-- ============================================================
-- WebMarketing v42 — authenticated customer lead registration
--
-- Customer final-submit flows look up and create their own lead through
-- the authenticated request context. Grant only the operations used by
-- that flow, and keep row access constrained to auth.uid() = user_id.
-- ============================================================

GRANT SELECT, INSERT
  ON TABLE public.leads
  TO authenticated;

-- The original policy name said "Service role" but omitted a role scope.
-- Preserve service-role insertion while preventing that unrestricted check
-- from applying to newly granted authenticated inserts.
DROP POLICY IF EXISTS "Service role can insert leads" ON public.leads;
CREATE POLICY "Service role can insert leads"
  ON public.leads FOR INSERT TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view own lead" ON public.leads;
CREATE POLICY "Users can view own lead"
  ON public.leads FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own lead" ON public.leads;
CREATE POLICY "Users can create own lead"
  ON public.leads FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
