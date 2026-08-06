-- ============================================================
-- Migration v30 — payments table: allow 'canceled' status and
--                 track refund/cancel timestamps
-- ============================================================
-- Steve 5/16 Milestone 4: the original payments status CHECK only
-- accepted ('pending','completed','failed','refunded'). To close the
-- Stripe payment loop we also need to record:
--
--   * 'canceled' when a recurring subscription is canceled (Stripe
--     event customer.subscription.deleted) before all installments
--     are paid — different semantics from 'refunded' (which means
--     money returned to the customer).
--
--   * refunded_at + canceled_at timestamps so the admin Sales Report
--     can break refund/cancel volume by date and the admin actions
--     UI can show "refunded on …" instead of just a status badge.
--
-- All changes are additive and idempotent.
-- ============================================================

-- ─── 1. Expand status CHECK to include 'canceled' ────────────
DO $$
DECLARE
  has_canceled boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name LIKE 'payments_status_check%'
      AND check_clause ILIKE '%canceled%'
  ) INTO has_canceled;

  IF NOT has_canceled THEN
    -- Drop any existing status check and recreate with the
    -- expanded value set. We tolerate either the original
    -- constraint name or its variants.
    EXECUTE (
      SELECT 'ALTER TABLE payments DROP CONSTRAINT ' || quote_ident(conname)
      FROM pg_constraint
      WHERE conrelid = 'public.payments'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%status%'
      LIMIT 1
    );

    ALTER TABLE payments
      ADD CONSTRAINT payments_status_check
      CHECK (status IN ('pending','completed','failed','refunded','canceled'));
  END IF;
END $$;

-- ─── 2. Timestamp columns ───────────────────────────────────
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ;

-- ─── 3. Useful indexes for the Sales Report queries ─────────
CREATE INDEX IF NOT EXISTS idx_payments_status_created
  ON payments (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_refunded_at
  ON payments (refunded_at)
  WHERE refunded_at IS NOT NULL;

-- Verification:
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'public.payments'::regclass AND contype = 'c';
--
-- \d payments
