-- ============================================================
-- Migration v55: Client Acquisition Plan Scoring
-- Run this in Supabase Dashboard → SQL Editor → New query
--
-- Client Acquisition (pymes_captacion) previously had no plan
-- assignment mechanism at all. This adds the same
-- total_score / recommended_plan pattern already used by
-- pymes_diagnosis (Sales Leak Diagnosis) so a Client Acquisition
-- submission can carry its own calculated Rescue/Growth/Scale
-- recommendation, scored from 3 questions already collected on
-- that form (monthly marketing budget, years in business, current
-- marketing channels).
--
-- NOTE: this score uses a different scale (3-9, from 3 questions)
-- than pymes_diagnosis.total_score (7-35, from 7 Likert questions).
-- It is intentionally its own column on its own table rather than
-- writing into pymes_diagnosis.total_score, since several UI
-- surfaces (e.g. the Dashboard "Diagnosis Score" stat card) render
-- that column with a hardcoded "/35" suffix — mixing scales there
-- would show a misleading number. See
-- CLIENT_ACQUISITION_PLAN_SCORING_FIX.md for the full design.
-- ============================================================

ALTER TABLE pymes_captacion
  ADD COLUMN IF NOT EXISTS total_score INTEGER,
  ADD COLUMN IF NOT EXISTS recommended_plan TEXT CHECK (recommended_plan IN ('rescue', 'growth', 'scale'));

-- ============================================================
-- DONE!
-- ============================================================
