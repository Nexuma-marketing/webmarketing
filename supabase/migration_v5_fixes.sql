-- ============================================================
-- WebMarketing v5 - Schema Fixes
-- Run this in Supabase Dashboard → SQL Editor → New query
--
-- Fixes:
-- 1. pymes_diagnosis: Drop NOT NULL on legacy columns
-- 2. tenant_preferences: Add near_skytrain column
-- 3. properties.bathrooms: Change INTEGER to NUMERIC
-- 4. tenant_preferences.bathrooms_needed: Change INTEGER to NUMERIC
-- ============================================================

-- ============================================================
-- 1. PYMES_DIAGNOSIS: Drop NOT NULL on old columns
--    The Sales Leak Calculator form doesn't collect these
-- ============================================================

ALTER TABLE pymes_diagnosis ALTER COLUMN employee_count DROP NOT NULL;
ALTER TABLE pymes_diagnosis ALTER COLUMN main_challenge DROP NOT NULL;

-- ============================================================
-- 2. TENANT_PREFERENCES: Add missing near_skytrain column
-- ============================================================

ALTER TABLE tenant_preferences
  ADD COLUMN IF NOT EXISTS near_skytrain BOOLEAN DEFAULT FALSE;

-- ============================================================
-- 3. PROPERTIES: Change bathrooms from INTEGER to NUMERIC
--    Allows values like 1.5, 2.5 etc.
-- ============================================================

ALTER TABLE properties
  ALTER COLUMN bathrooms TYPE NUMERIC USING bathrooms::NUMERIC;

-- ============================================================
-- 4. TENANT_PREFERENCES: Change bathrooms_needed from INTEGER to NUMERIC
-- ============================================================

ALTER TABLE tenant_preferences
  ALTER COLUMN bathrooms_needed TYPE NUMERIC USING bathrooms_needed::NUMERIC;

-- ============================================================
-- 5. PYMES_DIAGNOSIS: Add contact_position column
-- ============================================================

ALTER TABLE pymes_diagnosis
  ADD COLUMN IF NOT EXISTS contact_position TEXT;

-- ============================================================
-- DONE! Run this after migration_v4_captacion.sql
-- ============================================================
