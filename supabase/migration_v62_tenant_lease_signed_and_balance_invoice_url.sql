-- ============================================================
-- Migration v62 — properties: explicit "Tenant signed lease" tracking
-- + persist the balance invoice's hosted_invoice_url
-- ============================================================
-- Run in Supabase SQL Editor (postgres / service_role).
--
-- Context: PROMPT2 payment-flow overhaul, item 1. The `is_available`
-- toggle (migration v37) used to implicitly mean "tenant signed the
-- lease" when flipped to false, and triggered generateBalanceInvoice()
-- as a side effect. That's wrong — `is_available` is also flipped for
-- unrelated reasons (owner withdraws before finding a tenant, owner
-- rents independently and tells us, etc.). This migration adds an
-- explicit, auditable "tenant signed lease" event instead, and a
-- column to persist the Stripe hosted invoice URL that
-- generateBalanceInvoice() already computed but never stored (it was
-- only returned in the function's response, never written to the DB).
--
-- All columns nullable — existing rows keep working.
-- ============================================================

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS tenant_lease_signed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tenant_lease_signed_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS balance_invoice_url TEXT;

COMMENT ON COLUMN properties.tenant_lease_signed_at IS
  'Set by POST /api/admin/properties/[id]/tenant-signed-lease. Explicit, decoupled from is_available (see migration v37 header for the old, now-removed, implicit trigger).';
COMMENT ON COLUMN properties.tenant_lease_signed_by IS
  'profiles.id of the admin/marketing/sales user who triggered the Tenant signed lease action.';
COMMENT ON COLUMN properties.balance_invoice_url IS
  'Stripe hosted_invoice_url for the current balance_invoice_id, so Payment History can link directly to Stripe without depending on Stripe''s own invoice email ever arriving.';

-- Verification:
-- SELECT id, address, is_available, tenant_lease_signed_at,
--        balance_invoice_id, balance_invoice_url
-- FROM properties
-- LIMIT 5;
