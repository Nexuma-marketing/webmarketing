-- ============================================================
-- WebMarketing v6 - CFP/Payback + Matching
-- Run this in Supabase Dashboard → SQL Editor → New query
--
-- Changes:
-- 1. properties: Add payback_months column for Elite investors
-- ============================================================

-- ============================================================
-- 1. PROPERTIES: Add payback_months for Elite investor calculations
--    Payback = Portfolio Fee / CFP monthly (in months)
-- ============================================================

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS payback_months NUMERIC;

-- ============================================================
-- DONE! Run this after migration_v5_fixes.sql
-- ============================================================
