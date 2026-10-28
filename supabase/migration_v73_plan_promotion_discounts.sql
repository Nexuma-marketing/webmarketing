-- ============================================================
-- v73: promo-code discounts on plans paid as upfront + balance
-- FIX_PROMOTIONS_BALANCE_REPORT.md
--
-- Low Price, Founders, Support Tier and Premier Tier charge an upfront
-- at checkout and the rest of the plan's value (rent × plan %) later:
-- one balance invoice after the tenant signs the lease, or Premier's
-- scheduled installments. A promo code now discounts that value, not
-- the upfront. The Stripe webhook stores the discount here, per
-- property, when the upfront is paid; the balance invoice and the
-- Premier schedule subtract it from what they bill.
--
-- One row per paid checkout session (UNIQUE stripe_session_id), so a
-- repeated webhook event never stores it twice. A row only counts while
-- that session's payment is still `completed` (checked in code), so a
-- fully refunded upfront no longer carries its discount.
--
-- Written and read only by the server (service role). RLS on, no
-- client policies.
-- Idempotent: safe to run more than once. Needs no other v72 object.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.plan_promotion_discounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- The plan the upfront was paid for.
  service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  promotion_id UUID REFERENCES public.promotions(id) ON DELETE SET NULL,
  promotion_code TEXT NOT NULL,
  discount_type TEXT NOT NULL,
  discount_value NUMERIC(12, 2) NOT NULL,
  -- What the value to charge was calculated from at checkout.
  plan_percentage NUMERIC(6, 4),
  monthly_rent NUMERIC(12, 2),
  -- Value to charge before the discount (rent × plan %), in cents.
  plan_total_cents INTEGER NOT NULL CHECK (plan_total_cents > 0),
  -- Total discount taken off the plan, in cents.
  discount_cents INTEGER NOT NULL CHECK (discount_cents >= 0),
  -- Already paid when the code was applied (not discounted), in cents.
  upfront_cents INTEGER NOT NULL CHECK (upfront_cents >= 0),
  stripe_session_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT plan_promotion_discounts_session_key UNIQUE (stripe_session_id)
);

CREATE INDEX IF NOT EXISTS idx_plan_promotion_discounts_property
  ON public.plan_promotion_discounts (property_id, created_at DESC);

ALTER TABLE public.plan_promotion_discounts ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_promotion_discounts TO service_role;

-- Verification:
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'plan_promotion_discounts' ORDER BY ordinal_position;
-- SELECT relrowsecurity FROM pg_class WHERE oid = 'public.plan_promotion_discounts'::regclass;  -- true
-- SELECT policyname FROM pg_policies WHERE tablename = 'plan_promotion_discounts';               -- no rows
-- SELECT privilege_type FROM information_schema.role_table_grants
--   WHERE table_name = 'plan_promotion_discounts' AND grantee = 'service_role';
