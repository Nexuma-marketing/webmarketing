-- ============================================================
-- Migration v58 - Widen the properties.elite_tier CHECK constraint
--                 to allow 'below_minimum'
-- ============================================================
-- Steve - BELOW_MINIMUM_STILL_NOT_APPLIED_DIAGNOSTIC.md: confirmed root
-- cause of the "Below Portfolio Minimum" fallback tier
-- (BELOW_PORTFOLIO_MINIMUM_FALLBACK_FIX.md) silently never persisting.
--
-- properties.elite_tier was originally added with an inline CHECK
-- constraint (migration_v2_mvp.sql, line 51):
--   ADD COLUMN IF NOT EXISTS elite_tier TEXT CHECK (elite_tier IN ('essentials', 'signature', 'lujo')),
-- Postgres auto-named this constraint 'properties_elite_tier_check'
-- (the default <table>_<column>_check naming for an inline, unnamed
-- CHECK). No later migration ever widened or renamed it - confirmed by
-- grepping every migration file for 'elite_tier' / 'DROP CONSTRAINT'.
--
-- When BELOW_PORTFOLIO_MINIMUM_FALLBACK_FIX.md added 'below_minimum' as
-- a new elite_tier value in application code (src/types/database.ts,
-- src/lib/constants.ts, src/lib/profiling.ts), it never widened this
-- database constraint to match. Every attempt to write
-- elite_tier = 'below_minimum' has since been rejected by Postgres
-- (error 23514), and profileOwner()'s per-property .update() call never
-- checked its result - see ELITE_TIER_CHECK_CONSTRAINT_FIX.md, which
-- also fixes that silent error-swallowing in src/lib/profiling.ts
-- alongside this migration - so the rejection was completely silent.
--
-- This follows the exact same safe drop-and-recreate pattern already
-- used in this project to widen an enum-like CHECK constraint when a
-- new allowed value is introduced (see profiles_role_check, widened the
-- same way in migration_v2_mvp.sql and again in
-- migration_v9_admin_suite.sql).
--
-- Scope note: this ONLY widens the allowed values for elite_tier. It
-- does not touch service_tier, does not touch any Property
-- Owner/Preferred Owner logic, and does not change which rows get an
-- elite_tier value written - that remains governed entirely by
-- application code (classifyEliteTier() / profileOwner(), both gated on
-- service_tier === 'elite', i.e. Investor only - see
-- ELITE_TIER_CHECK_CONSTRAINT_FIX.md for the exact guard). A Property
-- Owner/Preferred Owner property's elite_tier column simply stays NULL,
-- exactly as before this migration.
-- ============================================================

ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_elite_tier_check;

ALTER TABLE properties ADD CONSTRAINT properties_elite_tier_check
  CHECK (elite_tier IN ('essentials', 'signature', 'lujo', 'below_minimum'));

-- Verification:
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'properties'::regclass
--   AND conname = 'properties_elite_tier_check';
--
-- Re-running "Update Preferences" (or any other write that goes through
-- profileOwner()) for an already-existing property with rent under
-- $2,500 should now successfully persist elite_tier = 'below_minimum'
-- instead of being silently rejected.
