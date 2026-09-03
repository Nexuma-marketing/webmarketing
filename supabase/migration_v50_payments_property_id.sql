-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  Migration V50 — payments.property_id                           ║
-- ║  Adds a nullable property reference to payments so recurring    ║
-- ║  Elite Assets & Legacy monthly maintenance-fee charges (and any ║
-- ║  other property-scoped payment) can be attributed back to the   ║
-- ║  specific property, e.g. for per-property Payment History.      ║
-- ║                                                                  ║
-- ║  Additive only: no existing column, table, or data is modified. ║
-- ║  Mirrors the existing service_id / pymes_plan_id reference       ║
-- ║  columns on this same table (nullable, ON DELETE SET NULL) —    ║
-- ║  see migration_v2_mvp.sql lines 130-136, 287-289.                ║
-- ╚══════════════════════════════════════════════════════════════════╝

-- ─── 1. Add property_id to payments ──────────────────────────────
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS property_id UUID;

-- ─── 2. Foreign key + delete behavior ────────────────────────────
-- Steve: same pattern as service_id/pymes_plan_id on this table — if
-- the property is ever deleted, keep the historical payment row but
-- null out the reference rather than cascading the delete.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_property_id_fkey'
  ) THEN
    ALTER TABLE payments
      ADD CONSTRAINT payments_property_id_fkey
      FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── 3. Index for per-property Payment History lookups ───────────
CREATE INDEX IF NOT EXISTS idx_payments_property_id
  ON payments (property_id)
  WHERE property_id IS NOT NULL;

-- Verification:
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns
--   WHERE table_name = 'payments' AND column_name = 'property_id';
-- SELECT conname FROM pg_constraint WHERE conname = 'payments_property_id_fkey';
