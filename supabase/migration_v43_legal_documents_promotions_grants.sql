-- ============================================================
-- WebMarketing v43 — customer read grants for legal documents
-- and promotions, plus non-recursive admin policy checks
-- ============================================================

GRANT SELECT
  ON TABLE public.legal_documents
  TO authenticated;

GRANT SELECT
  ON TABLE public.promotions
  TO authenticated;

DROP POLICY IF EXISTS "Admins can manage legal_documents"
  ON public.legal_documents;
CREATE POLICY "Admins can manage legal_documents"
  ON public.legal_documents FOR ALL TO authenticated
  USING (public.is_customer_data_admin())
  WITH CHECK (public.is_customer_data_admin());

DROP POLICY IF EXISTS "Admins can manage promotions"
  ON public.promotions;
CREATE POLICY "Admins can manage promotions"
  ON public.promotions FOR ALL TO authenticated
  USING (public.is_customer_data_admin())
  WITH CHECK (public.is_customer_data_admin());
