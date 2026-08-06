-- ============================================================
-- WebMarketing MVP v4 - Client Acquisition (Captacion) Table
-- Run this in Supabase Dashboard → SQL Editor → New query
--
-- Creates the pymes_captacion table for the Client Acquisition
-- form (PDF 5.1.2) — separate from the Sales Leak Diagnosis.
-- ============================================================

-- ============================================================
-- 1. PYMES_CAPTACION - Client Acquisition Form (PDF 5.1.2)
-- ============================================================

CREATE TABLE IF NOT EXISTS pymes_captacion (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Step 1: Business Profile
  business_name TEXT NOT NULL,
  industry TEXT NOT NULL,
  years_in_business INTEGER,
  business_goals TEXT[] DEFAULT '{}',

  -- Step 2: Target Audience
  target_age_range TEXT,
  target_location TEXT,
  target_income TEXT,
  ideal_customer_description TEXT,

  -- Step 3: Current Marketing
  current_channels TEXT[] DEFAULT '{}',
  monthly_marketing_budget NUMERIC,
  biggest_challenge TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 2. RLS Policies
-- ============================================================

ALTER TABLE pymes_captacion ENABLE ROW LEVEL SECURITY;

-- Users can read their own captacion records
CREATE POLICY "Users can view own captacion"
  ON pymes_captacion FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own captacion records
CREATE POLICY "Users can insert own captacion"
  ON pymes_captacion FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own captacion records
CREATE POLICY "Users can update own captacion"
  ON pymes_captacion FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================================
-- 3. Index for fast lookup
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_pymes_captacion_user_id
  ON pymes_captacion(user_id);

-- ============================================================
-- DONE! Run this after migration_v3_forms.sql
-- ============================================================
