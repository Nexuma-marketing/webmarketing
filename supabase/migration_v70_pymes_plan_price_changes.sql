-- ============================================================
-- WebMarketing v70 — PYME plan prices: single source + audit
--
-- Why: `pymes_plans` is now the only source of PYME prices (checkout
-- already charged from it; every screen and email now reads it too).
-- Admin edits it in Admin → Pricing → PYME Plans through
-- /api/admin/pymes-plans (service role, admin only). Each saved change
-- writes one row in pymes_plan_price_changes.
-- See FIX_PYME_PRICES_SINGLE_SOURCE_REPORT.md.
--
-- Apply AFTER migration_v68_pymes_plan_pricing.sql.
--
-- Access to pymes_plan_price_changes: only the service role, from the
-- API route. RLS enabled with no policies, so authenticated/anon cannot
-- read or write. A table GRANT for service_role is required in this
-- project (same class of bug as v44 / v46 / v61 / v66 / v69).
--
-- Idempotent: safe to run more than once.
-- ============================================================

-- 1. Audit table
CREATE TABLE IF NOT EXISTS public.pymes_plan_price_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.pymes_plans(id),
  changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  old_values JSONB NOT NULL,
  new_values JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pymes_plan_price_changes_plan
  ON public.pymes_plan_price_changes (plan_id, created_at DESC);

ALTER TABLE public.pymes_plan_price_changes ENABLE ROW LEVEL SECURITY;

-- No client policies on purpose.
REVOKE ALL ON public.pymes_plan_price_changes FROM anon, authenticated;
GRANT SELECT, INSERT ON public.pymes_plan_price_changes TO service_role;

-- 2. The editor API reads and updates pymes_plans and keeps the legacy
--    "Plan: PYMES — X" services rows in step, both with the service role.
GRANT SELECT, UPDATE ON public.pymes_plans TO service_role;
GRANT SELECT, UPDATE ON public.services TO service_role;

-- 3. Total always = upfront + installments × amount (official values
--    already match: 750+2×375, 1250+2×625, 1520+4×570).
UPDATE public.pymes_plans
   SET price = upfront_amount + installment_months * installment_amount
 WHERE is_active = true
   AND upfront_amount IS NOT NULL
   AND installment_amount IS NOT NULL
   AND installment_months IS NOT NULL
   AND price IS DISTINCT FROM upfront_amount + installment_months * installment_amount;

-- 4. Legacy services rows "Plan: PYMES — X": price follows the plan
--    total (newest active pymes_plans row per plan_type), and the
--    hand-written "One-time $X." is removed from the description
--    (the price is shown next to it from services.price).
WITH plan_totals AS (
  SELECT DISTINCT ON (plan_type)
         plan_type,
         upfront_amount + installment_months * installment_amount AS total
    FROM public.pymes_plans
   WHERE is_active = true
     AND upfront_amount IS NOT NULL
     AND installment_amount IS NOT NULL
     AND installment_months IS NOT NULL
   ORDER BY plan_type, created_at DESC
)
UPDATE public.services s
   SET price = pt.total
  FROM plan_totals pt
 WHERE s.name = 'Plan: PYMES — ' || initcap(pt.plan_type)
   AND s.price IS DISTINCT FROM pt.total;

UPDATE public.services
   SET description = regexp_replace(description, '\s*One-time \$[0-9,]+(\.[0-9]{2})?\.?\s*$', '')
 WHERE name LIKE 'Plan: PYMES — %'
   AND description ~ 'One-time \$[0-9,]+(\.[0-9]{2})?\.?\s*$';

-- Verification:
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'pymes_plan_price_changes'
--  ORDER BY ordinal_position;
-- SELECT relrowsecurity FROM pg_class WHERE oid = 'public.pymes_plan_price_changes'::regclass;
-- SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pymes_plan_price_changes';
-- SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants
--  WHERE table_schema = 'public'
--    AND table_name IN ('pymes_plan_price_changes', 'pymes_plans', 'services')
--    AND grantee IN ('service_role', 'anon', 'authenticated')
--  ORDER BY table_name, grantee, privilege_type;
-- SELECT id, plan_type, name, price, upfront_amount, installment_amount, installment_months, is_active
--   FROM public.pymes_plans ORDER BY plan_type, created_at DESC;
-- SELECT name, price, description FROM public.services WHERE name LIKE 'Plan: PYMES — %' ORDER BY name;
