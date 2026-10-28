-- ============================================================
-- WebMarketing v72 — promo codes: one system (the app's)
--
-- See FIX_PROMOTIONS_REPORT.md.
--   1. promotions.applies_to ('all' | 'pymes' | 'properties'),
--      default 'all'. Existing codes become 'all'.
--   2. (No value CHECKs in the database: values are validated by the
--      API and the form. A CHECK would also block turning off an old
--      code that breaks the new rules. The report has a query that
--      lists those old codes.)
--   3. Case-insensitive unique code (only if no duplicates exist).
--   4. RLS: admin, marketing and sales can read, create and edit;
--      only admin can delete.
--   5. promotion_redemptions: one use per customer per code, written
--      only by the Stripe webhook (service role). RLS on, no client
--      policies.
--   6. public.redeem_promotion(): counts the use and stores the
--      redemption in one transaction. Idempotent per checkout session.
--
-- target_zones stays in the table but is no longer used.
-- Idempotent: safe to run more than once.
-- ============================================================

-- 1. applies_to -------------------------------------------------
ALTER TABLE public.promotions
  ADD COLUMN IF NOT EXISTS applies_to TEXT NOT NULL DEFAULT 'all';

UPDATE public.promotions SET applies_to = 'all' WHERE applies_to IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.promotions'::regclass AND conname = 'promotions_applies_to_check'
  ) THEN
    ALTER TABLE public.promotions
      ADD CONSTRAINT promotions_applies_to_check CHECK (applies_to IN ('all', 'pymes', 'properties'));
  END IF;
END $$;

-- 3. Case-insensitive unique code --------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'promotions_code_upper_key'
  ) THEN
    IF EXISTS (
      SELECT upper(code) FROM public.promotions GROUP BY upper(code) HAVING count(*) > 1
    ) THEN
      RAISE NOTICE 'promotions_code_upper_key NOT created: some codes differ only by case. See FIX_PROMOTIONS_REPORT.md.';
    ELSE
      CREATE UNIQUE INDEX promotions_code_upper_key ON public.promotions (upper(code));
    END IF;
  END IF;
END $$;

-- 4. RLS on promotions -------------------------------------------
CREATE OR REPLACE FUNCTION public.is_promotions_manager()
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
      AND role IN ('admin', 'marketing', 'sales')
  );
$$;

REVOKE ALL ON FUNCTION public.is_promotions_manager() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_promotions_manager() TO authenticated;

ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage promotions" ON public.promotions;
DROP POLICY IF EXISTS "Promotion managers can read promotions" ON public.promotions;
DROP POLICY IF EXISTS "Promotion managers can create promotions" ON public.promotions;
DROP POLICY IF EXISTS "Promotion managers can update promotions" ON public.promotions;
DROP POLICY IF EXISTS "Admins can delete promotions" ON public.promotions;

CREATE POLICY "Promotion managers can read promotions"
  ON public.promotions FOR SELECT TO authenticated
  USING (public.is_promotions_manager());

CREATE POLICY "Promotion managers can create promotions"
  ON public.promotions FOR INSERT TO authenticated
  WITH CHECK (public.is_promotions_manager());

CREATE POLICY "Promotion managers can update promotions"
  ON public.promotions FOR UPDATE TO authenticated
  USING (public.is_promotions_manager())
  WITH CHECK (public.is_promotions_manager());

CREATE POLICY "Admins can delete promotions"
  ON public.promotions FOR DELETE TO authenticated
  USING (public.is_customer_data_admin());

-- Grants are unchanged: authenticated keeps SELECT only (v43), the app
-- writes through the service role (v61). Re-assert service_role here.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promotions TO service_role;

-- 5. promotion_redemptions ---------------------------------------
CREATE TABLE IF NOT EXISTS public.promotion_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id UUID REFERENCES public.promotions(id) ON DELETE SET NULL,
  promotion_code TEXT NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  stripe_session_id TEXT NOT NULL,
  stripe_payment_intent_id TEXT,
  discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  -- false when the payment completed after the last use was taken
  -- (the payment was kept but used_count was not raised).
  counted BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT promotion_redemptions_promotion_user_key UNIQUE (promotion_id, user_id),
  CONSTRAINT promotion_redemptions_session_key UNIQUE (stripe_session_id)
);

CREATE INDEX IF NOT EXISTS idx_promotion_redemptions_promotion
  ON public.promotion_redemptions (promotion_id, created_at DESC);

ALTER TABLE public.promotion_redemptions ENABLE ROW LEVEL SECURITY;
-- No client policies on purpose.
DROP POLICY IF EXISTS "promotion_redemptions_select" ON public.promotion_redemptions;
DROP POLICY IF EXISTS "promotion_redemptions_insert" ON public.promotion_redemptions;

GRANT ALL ON public.promotion_redemptions TO service_role;

-- 6. Atomic, idempotent redemption -------------------------------
-- Returns: 'counted' | 'already_recorded' | 'limit_reached' |
--          'already_redeemed_by_user' | 'promotion_missing'
CREATE OR REPLACE FUNCTION public.redeem_promotion(
  p_promotion_id UUID,
  p_user_id UUID,
  p_session_id TEXT,
  p_payment_intent_id TEXT,
  p_discount_amount NUMERIC
)
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_code TEXT;
  v_constraint TEXT;
  v_updated INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM public.promotion_redemptions WHERE stripe_session_id = p_session_id) THEN
    RETURN 'already_recorded';
  END IF;

  SELECT code INTO v_code FROM public.promotions WHERE id = p_promotion_id;
  IF v_code IS NULL THEN
    RETURN 'promotion_missing';
  END IF;

  BEGIN
    INSERT INTO public.promotion_redemptions
      (promotion_id, promotion_code, user_id, stripe_session_id, stripe_payment_intent_id, discount_amount, counted)
    VALUES
      (p_promotion_id, v_code, p_user_id, p_session_id, p_payment_intent_id, GREATEST(COALESCE(p_discount_amount, 0), 0), true);
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint = 'promotion_redemptions_session_key' THEN
        RETURN 'already_recorded';
      END IF;
      RETURN 'already_redeemed_by_user';
    WHEN foreign_key_violation THEN
      RETURN 'promotion_missing';
  END;

  -- Conditional: two payments racing for the last use can't both count.
  UPDATE public.promotions
     SET used_count = COALESCE(used_count, 0) + 1,
         updated_at = now()
   WHERE id = p_promotion_id
     AND (max_uses IS NULL OR COALESCE(used_count, 0) < max_uses);
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    UPDATE public.promotion_redemptions SET counted = false WHERE stripe_session_id = p_session_id;
    RETURN 'limit_reached';
  END IF;

  RETURN 'counted';
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_promotion(UUID, UUID, TEXT, TEXT, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redeem_promotion(UUID, UUID, TEXT, TEXT, NUMERIC) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_promotion(UUID, UUID, TEXT, TEXT, NUMERIC) TO service_role;

-- Verification: see FIX_PROMOTIONS_REPORT.md.
