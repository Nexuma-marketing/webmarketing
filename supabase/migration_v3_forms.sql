-- ============================================================
-- WebMarketing MVP v3 - Form Fields Migration
-- Run this in Supabase Dashboard → SQL Editor → New query
--
-- Adds missing columns required by the MVP PDF for:
-- - Tenant preferences (BC cities, expanded fields)
-- - Properties (zone info, expanded details)
-- - Owner profile fields in discovery_briefs
-- ============================================================

-- ============================================================
-- 1. TENANT_PREFERENCES - Add missing PDF fields
-- ============================================================

ALTER TABLE tenant_preferences
  ADD COLUMN IF NOT EXISTS number_of_people TEXT,
  ADD COLUMN IF NOT EXISTS property_type_desired TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS furnished BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS utilities_included BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS levels_preferred TEXT,
  ADD COLUMN IF NOT EXISTS size_sqft NUMERIC,
  ADD COLUMN IF NOT EXISTS size_unit TEXT DEFAULT 'sqft',
  ADD COLUMN IF NOT EXISTS common_areas TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS move_in_flexible BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS skytrain_lines TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS near_bus BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS near_social BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS near_banks BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS near_downtown BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS institution_type TEXT,
  ADD COLUMN IF NOT EXISTS institution_name TEXT,
  ADD COLUMN IF NOT EXISTS consent_screening BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS consent_references BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS consent_communications BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS consent_truthfulness BOOLEAN DEFAULT FALSE;

-- ============================================================
-- 2. PROPERTIES - Add zone and expanded detail fields
-- ============================================================

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS availability_date DATE,
  ADD COLUMN IF NOT EXISTS dishwasher BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS common_areas TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS pet_friendly BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS smart_home BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS smart_home_features TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS shared_unit BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS levels TEXT,
  ADD COLUMN IF NOT EXISTS furnished BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS utilities_included BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS style TEXT,
  -- Zone fields
  ADD COLUMN IF NOT EXISTS near_parks BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS near_churches BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS near_skytrain BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS skytrain_lines TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS near_bus BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS social_life TEXT,
  ADD COLUMN IF NOT EXISTS near_mall BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS nearby_supermarkets TEXT[] DEFAULT '{}';

-- ============================================================
-- 3. DISCOVERY_BRIEFS - Add owner profile fields per PDF
-- ============================================================

ALTER TABLE discovery_briefs
  ADD COLUMN IF NOT EXISTS objectives TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cities TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS rents NUMERIC[] DEFAULT '{}';

-- ============================================================
-- 4. Fix properties province default for BC
-- ============================================================

ALTER TABLE properties
  ALTER COLUMN province SET DEFAULT 'British Columbia';

-- ============================================================
-- 5. PROPERTIES - Add Steve feedback fields (v3.1)
--    occupancy_status, vacancy_date, listing_platforms
-- ============================================================

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS occupancy_status TEXT DEFAULT 'vacant',
  ADD COLUMN IF NOT EXISTS vacancy_date DATE,
  ADD COLUMN IF NOT EXISTS listing_platforms TEXT[] DEFAULT '{}';

-- ============================================================
-- DONE! Run this after migration_v2_mvp.sql
-- ============================================================
