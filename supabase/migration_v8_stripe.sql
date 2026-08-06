-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  Migration V8 — Stripe Integration Fields                      ║
-- ║  Adds stripe_customer_id to profiles and total_installments    ║
-- ║  to payments for installment tracking.                         ║
-- ╚══════════════════════════════════════════════════════════════════╝

-- ─── 1. Add stripe_customer_id to profiles ───────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

-- Index for fast lookup when creating/retrieving Stripe customers
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id
  ON profiles (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- ─── 2. Add total_installments to payments ───────────────────────
-- Tracks how many installments are expected for subscription-based payments
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS total_installments INTEGER;

-- ─── 3. Add installment_number to payments ───────────────────────
-- Tracks which installment number this payment represents (1, 2, 3...)
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS installment_number INTEGER;

-- ─── 4. Add stripe_subscription_id to payments ──────────────────
-- Links payment to the Stripe subscription for installment plans
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- ─── 5. Ensure payments table has proper indexes ─────────────────
CREATE INDEX IF NOT EXISTS idx_payments_user_id
  ON payments (user_id);

CREATE INDEX IF NOT EXISTS idx_payments_status
  ON payments (status);

CREATE INDEX IF NOT EXISTS idx_payments_stripe_session_id
  ON payments (stripe_session_id);

CREATE INDEX IF NOT EXISTS idx_payments_stripe_subscription_id
  ON payments (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- ─── 6. RLS policies for payments (if not already set) ──────────
-- Users can read their own payments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'payments' AND policyname = 'Users can view own payments'
  ) THEN
    CREATE POLICY "Users can view own payments"
      ON payments FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Admins can view all payments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'payments' AND policyname = 'Admins can view all payments'
  ) THEN
    CREATE POLICY "Admins can view all payments"
      ON payments FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role = 'admin'
        )
      );
  END IF;
END $$;
