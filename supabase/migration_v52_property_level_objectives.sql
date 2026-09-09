-- ============================================================
-- v52: Move Investment Objectives from account-level to per-property
-- ============================================================
-- Diagnosed in OBJECTIVES_PER_PROPERTY_DIAGNOSTIC.md: a single Investor
-- can have different objectives for each of their properties (e.g.
-- "maximize this condo as an asset" for one property, "just increase
-- income" for a cheaper house, "cover mortgage payments" for another).
-- objectives was previously stored once per account on
-- discovery_briefs.objectives — this migration adds the real per-
-- property column and backfills it from the existing account-level
-- value so no customer's already-stated objectives are lost.
-- ============================================================

-- 1. Add the per-property objectives column, same shape as the
--    existing discovery_briefs.objectives TEXT[] column.
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS objectives TEXT[] DEFAULT '{}';

-- 2. One-time backfill: copy each user's account-level objectives to
--    every property they currently own, but only where that property
--    doesn't already have its own objectives set (idempotent — safe to
--    re-run, and won't clobber objectives entered per-property after
--    this migration first runs).
UPDATE properties p
SET objectives = db.objectives
FROM discovery_briefs db
WHERE p.owner_id = db.user_id
  AND db.objectives IS NOT NULL
  AND db.objectives <> '{}'
  AND (p.objectives IS NULL OR p.objectives = '{}');

-- 3. discovery_briefs.objectives is now LEGACY / NO LONGER AUTHORITATIVE.
--    Nothing in the app reads it after this migration (confirmed in the
--    diagnostic — it was already write-only, with objectives now written
--    to properties.objectives instead). Left in place, not dropped, so
--    the customer's originally-stated data is never lost and the change
--    stays reversible.
COMMENT ON COLUMN discovery_briefs.objectives IS
  'LEGACY as of v52: objectives moved to properties.objectives (per-property). This column is no longer written or read by the app; kept only to avoid losing historical data.';
