-- ============================================================
-- WebMarketing v69 — subscription_cancellations
--
-- Why: cancellations of PYME installment plans and Elite monthly
-- platform-fee subscriptions are made only from the admin panel
-- (Sales Report PYME section and Admin → Payments), by admin (end of
-- period or now) or sales (end of period only). Each effective
-- cancellation is recorded here with the mandatory reason, who did it
-- and when. See BUGFIX_CANCELLATIONS_PANEL.md.
--
-- The UNIQUE index on (stripe_subscription_id, mode) is the concurrency
-- guard: when two people cancel the same plan at the same time, only
-- the request whose INSERT succeeds sends the emails.
--
-- Access: only the service role, from API routes. RLS is enabled with
-- no policies, so authenticated/anon clients cannot read or write.
-- In this project a table GRANT is required for service_role (same
-- class of bug as v44 / v46 / v61 / v66).
--
-- Idempotent: safe to run more than once.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.subscription_cancellations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_subscription_id TEXT NOT NULL,
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  cancelled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  cancelled_by_role TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('end_of_period', 'now')),
  reason TEXT NOT NULL,
  plan_label TEXT,
  effective_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS subscription_cancellations_sub_mode_key
  ON public.subscription_cancellations (stripe_subscription_id, mode);

CREATE INDEX IF NOT EXISTS idx_subscription_cancellations_created_at
  ON public.subscription_cancellations (stripe_subscription_id, created_at DESC);

ALTER TABLE public.subscription_cancellations ENABLE ROW LEVEL SECURITY;

-- No client policies on purpose. Drop any that may have been added by hand.
DROP POLICY IF EXISTS "subscription_cancellations_select" ON public.subscription_cancellations;
DROP POLICY IF EXISTS "subscription_cancellations_insert" ON public.subscription_cancellations;

GRANT ALL ON public.subscription_cancellations TO service_role;

-- Verification:
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'subscription_cancellations'
--  ORDER BY ordinal_position;
-- SELECT indexname, indexdef FROM pg_indexes
--  WHERE schemaname = 'public' AND tablename = 'subscription_cancellations';
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
--  WHERE table_schema = 'public' AND table_name = 'subscription_cancellations';
-- SELECT relrowsecurity FROM pg_class WHERE oid = 'public.subscription_cancellations'::regclass;
