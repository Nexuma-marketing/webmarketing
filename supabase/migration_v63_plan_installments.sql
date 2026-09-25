-- ============================================================
-- Migration v63 — plan_installments (Premier Tier installment schedule)
-- ============================================================
-- Run in Supabase SQL Editor (postgres / service_role).
--
-- Context: PROMPT2 payment-flow overhaul, item 5. Premier Tier does
-- NOT use the single-lump-balance flow (migration v37/v62,
-- generateBalanceInvoice) — its remaining balance is scheduled
-- automatically starting the moment the $200 upfront is paid,
-- calendar-based (never gated by "Tenant signed lease"):
--   - Property #1 for that owner: one installment, 100% of
--     (30% x rent - $200), due 2 months after the upfront payment date.
--   - Property #2/#3: three installments, 50/30/20% of
--     (28% x rent - $200), due at +1/+2/+3 months from the upfront
--     payment date.
-- Rows are inserted all at once by
-- src/lib/premier-installments.ts::schedulePremierInstallments(),
-- called from the Stripe webhook's checkout.session.completed handler
-- right after a Premier Tier $200 upfront payment is recorded. A daily
-- Vercel Cron (src/app/api/cron/process-installments/route.ts) finds
-- rows whose due_date has arrived and status='scheduled', creates +
-- finalizes + sends a Stripe Invoice for that installment's exact
-- amount (reusing src/lib/balance-invoice.ts's
-- createAndSendStripeInvoice), then updates the row.
-- ============================================================

CREATE TABLE IF NOT EXISTS plan_installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  service_id UUID REFERENCES services(id) ON DELETE SET NULL,
  sequence INTEGER NOT NULL,
  due_date TIMESTAMPTZ NOT NULL,
  percentage NUMERIC NOT NULL,
  amount_cents INTEGER NOT NULL,
  stripe_invoice_id TEXT,
  hosted_invoice_url TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'invoiced', 'paid', 'failed', 'voided')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (property_id, service_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_plan_installments_property_id ON plan_installments(property_id);
CREATE INDEX IF NOT EXISTS idx_plan_installments_due_scheduled
  ON plan_installments(due_date)
  WHERE status = 'scheduled';

ALTER TABLE plan_installments ENABLE ROW LEVEL SECURITY;

-- Owners can read their own properties' installments (join through
-- properties.owner_id, same pattern as every other owner-scoped table
-- in this app).
CREATE POLICY "Owners can view own plan_installments"
  ON plan_installments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = plan_installments.property_id
        AND properties.owner_id = auth.uid()
    )
  );

-- Internal staff can read everything (Payment History admin views,
-- reconciliation). Writes are service-role only (cron + webhook), so
-- no staff write policy is added here.
CREATE POLICY "Internal staff can view all plan_installments"
  ON plan_installments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'marketing', 'sales', 'support')
    )
  );

COMMENT ON TABLE plan_installments IS
  'Premier Tier calendar-based balance installment schedule. See PROMPT2 item 5. Rows are inserted by schedulePremierInstallments() and progressed by the daily process-installments cron + the invoice.payment_succeeded/failed webhook branches keyed on metadata.kind = plan_installment.';

-- Verification:
-- SELECT property_id, sequence, due_date, percentage, amount_cents, status
-- FROM plan_installments
-- ORDER BY property_id, sequence;
