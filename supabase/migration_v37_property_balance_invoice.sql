-- ============================================================
-- Migration v37 — properties: balance invoice tracking columns
-- ============================================================
-- Run in Supabase SQL Editor (postgres / service_role).
--
-- Context: 2026-06-11 — Alex signed off on the residential plan
-- balance flow per 6-2.md #53. When Sales toggles a property's
-- Available switch OFF, we create a Stripe Invoice for
-- (rent * planPercentage) - $200. We need a handful of columns
-- on properties to track that invoice through to "rented & paid".
--
-- All columns are nullable so existing rows keep working — only
-- properties that have actually triggered a balance get values.
-- ============================================================

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS balance_invoice_id TEXT,
  ADD COLUMN IF NOT EXISTS balance_invoice_status TEXT,
  ADD COLUMN IF NOT EXISTS balance_invoice_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS balance_invoice_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS balance_invoice_paid_at TIMESTAMPTZ;

-- Optional status enum check. Stripe statuses we care about are
--   open, paid, void, uncollectible.
-- Plus our internal label "rented_balance_paid" after the webhook
-- fires. Leaving it as plain TEXT to avoid migration churn if
-- Stripe adds new states.
COMMENT ON COLUMN properties.balance_invoice_status IS
  'Stripe invoice status (open / paid / void / uncollectible) or our internal label after the webhook flips it.';
