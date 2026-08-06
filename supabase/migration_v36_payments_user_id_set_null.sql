-- ============================================================
-- Migration v36 — payments.user_id ON DELETE SET NULL
-- ============================================================
-- ⚠️  Run in Supabase SQL Editor (postgres / service_role).
--
-- Context: 2026-06-07 client (Alex) docx Item 4 screenshot 1+2.
-- She submitted a $180 Founder Package payment on 6 Jun from a
-- test account (alexsmarke@gmail.com). After we ran the v33-style
-- profile cleanup for that email on 2026-06-08 (per 6-2.md #01),
-- the payment row was silently CASCADE-deleted alongside the
-- profile. SQL audit on the same day confirmed only 4 rows remain
-- in `payments` even though Stripe-side ledger has all of them.
--
-- Root cause: payments.user_id had ON DELETE CASCADE in the
-- original schema (migration.sql line 303). For any other PII
-- table that's defensible — when a user is deleted we should
-- erase their preferences, etc. But payments are FINANCIAL records
-- that must outlive the user. We need them for revenue audits,
-- refunds, regulator inquiries, etc.
--
-- Fix:
--   1. drop the NOT NULL constraint on payments.user_id (so SET
--      NULL is legal)
--   2. drop the existing CASCADE foreign key
--   3. re-add the foreign key with ON DELETE SET NULL
--
-- After this migration, deleting a profile leaves their payment
-- rows behind with user_id = NULL. The admin Payments page
-- already renders "Unknown" for those (see /api/admin/payments
-- and /api/admin/export). Revenue totals stay accurate.
--
-- Note: the $580 of test data that was already CASCADE-deleted
-- earlier on 2026-06-08 is unrecoverable from this migration.
-- That data is reconstructable only from Stripe Dashboard if
-- needed.
--
-- Other tables that still have ON DELETE CASCADE on user_id
-- (tenant_preferences, pymes_diagnosis, service_recommendations)
-- are PII / behavioral records — intentionally left CASCADE so
-- privacy-style deletes remain effective.
-- ============================================================

-- 1. Allow user_id to become NULL when a profile is removed
ALTER TABLE payments ALTER COLUMN user_id DROP NOT NULL;

-- 2. Drop the existing CASCADE FK. The constraint name follows
--    Postgres convention (<table>_<column>_fkey) but we use IF
--    EXISTS to be tolerant of older names.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_user_id_fkey;

-- 3. Re-add it with SET NULL semantics
ALTER TABLE payments
  ADD CONSTRAINT payments_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES profiles(id)
  ON DELETE SET NULL;

-- Verify (uncomment to inspect):
-- SELECT
--   tc.constraint_name,
--   rc.delete_rule,
--   kcu.column_name
-- FROM information_schema.table_constraints tc
-- JOIN information_schema.key_column_usage kcu
--   USING (constraint_schema, constraint_name)
-- LEFT JOIN information_schema.referential_constraints rc
--   USING (constraint_schema, constraint_name)
-- WHERE tc.table_name = 'payments'
--   AND tc.constraint_type = 'FOREIGN KEY';
-- Expected: payments_user_id_fkey ... SET NULL ... user_id
