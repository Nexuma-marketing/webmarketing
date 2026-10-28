-- ============================================================
-- WebMarketing v71 — payments.refunded_amount
--
-- Why: `payments` only stored status (completed/refunded) and the
-- charged amount, so a partial refund was invisible in Admin →
-- Payments, the client's Payment History and the refund emails.
-- refunded_amount holds the CUMULATIVE amount refunded in Stripe for
-- the payment, in dollars like `amount`. The charge.refunded webhook
-- writes charge.amount_refunded / 100 on every refund event, partial
-- or full. See FIX_REFUND_VISIBILITY_REPORT.md.
--
-- Backfill: rows already 'refunded' were full refunds (a partial
-- refund never changed the row), so refunded_amount = amount.
-- Partial refunds issued before this migration cannot be recovered
-- from the database; they stay 0 until Stripe sends another
-- charge.refunded for that charge.
--
-- Grants: none needed. service_role (v44) and authenticated (v61)
-- have table-level grants on payments, which cover new columns.
--
-- Idempotent: safe to run more than once.
-- ============================================================

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(10,2) NOT NULL DEFAULT 0;

UPDATE public.payments
   SET refunded_amount = amount
 WHERE status = 'refunded'
   AND refunded_amount = 0;
