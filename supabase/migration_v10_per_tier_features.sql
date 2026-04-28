-- ============================================================
-- Migration v10 — Per-tier service checklists + long description
-- ============================================================
-- Steve 4/28: client wants to edit "Qué incluye" (what's included)
-- separately for Basic / Preferred Owners / Elite tiers from the
-- service edit dialog, not just from /admin/plans.
-- ============================================================

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS long_description TEXT,
  ADD COLUMN IF NOT EXISTS features_basic TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS features_preferred TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS features_elite TEXT[] NOT NULL DEFAULT '{}';

-- ============================================================
-- Backfill leads.role from linked profile when NULL
-- Steve 4/28: "filtro de Pymes trajo todo" — root cause was that
-- contact_form / apply-property / pymes-schedule-rescue inserts
-- never wrote leads.role, so the .eq filter excluded them all.
-- Going forward those endpoints set role explicitly; this fixes
-- the historical rows.
-- ============================================================
UPDATE leads l
SET role = p.role
FROM profiles p
WHERE l.user_id = p.id
  AND l.role IS NULL
  AND p.role IS NOT NULL;
