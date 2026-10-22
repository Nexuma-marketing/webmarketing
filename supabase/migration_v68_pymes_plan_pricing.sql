-- ============================================================
-- WebMarketing v68 — PYME plan pricing (upfront + installments)
--
-- Why: the pymes_plans seed in migration_v2_mvp.sql kept the MVP
-- split (rescue 750 + 3×250, growth 1000 + 4×375, scale 1500 + 5×460),
-- which never matched the official values shown to customers from
-- PYMES_PLANS in src/lib/constants.ts. Checkout and the monthly
-- subscription read these columns, so customers were charged a
-- different split than the one displayed.
-- See INVESTIGATION_PYME_PLAN_PRICING.md.
--
-- Already applied manually in the test database. Idempotent: it
-- sets fixed values, so re-running changes nothing. Updates active
-- rows in place (no new rows; ids are referenced by payments).
-- `price` (total) is already correct and is not touched. Existing
-- Stripe subscriptions keep their own amount and installment count.
-- ============================================================

UPDATE public.pymes_plans SET upfront_amount = 750,  installment_amount = 375, installment_months = 2 WHERE plan_type = 'rescue' AND is_active = true;
UPDATE public.pymes_plans SET upfront_amount = 1250, installment_amount = 625, installment_months = 2 WHERE plan_type = 'growth' AND is_active = true;
UPDATE public.pymes_plans SET upfront_amount = 1520, installment_amount = 570, installment_months = 4 WHERE plan_type = 'scale'  AND is_active = true;

-- Verification:
-- SELECT plan_type, name, price, upfront_amount, installment_amount, installment_months, is_active
-- FROM public.pymes_plans
-- ORDER BY plan_type;
