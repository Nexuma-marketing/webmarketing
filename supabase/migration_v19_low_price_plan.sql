-- ============================================================
-- Migration v19 — Add the missing "Plan: Low Price" service
-- ============================================================
-- Steve 5/5 docx item #2 sub-issue:
--   "Aun en el panel administrador estan unos servicios con valor
--    $0 y falta el servicio Low price"
--
-- The Owner Basic tier on /dashboard/services lists two plans:
--   * Founder Package — Visionary Owners (already seeded by v12)
--   * Low Price (35% of first month's rent, one-time)  ← MISSING
--
-- v19 inserts the missing Low Price plan-level service so the
-- Reassign dropdown shows it next to the Founder Package.
-- ============================================================

INSERT INTO services
  (name, description, category, price, currency, is_active, target_roles, status)
SELECT * FROM (VALUES
  ('Plan: Low Price',
   'Owner Basic plan at the standard 35% of first month''s rent, paid once when the tenant signs the lease. $200 system fee upfront, balance after lease signing.',
   'plan', 0::numeric, 'CAD', true,
   ARRAY['propietario','propietario_preferido']::text[], 'active')
) AS v(name, description, category, price, currency, is_active, target_roles, status)
WHERE NOT EXISTS (
  SELECT 1 FROM services s WHERE s.name = v.name
);
