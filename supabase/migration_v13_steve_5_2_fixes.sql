-- ============================================================
-- Migration v13 — Steve 5/2 follow-up: Spanish keyword backfill
-- ============================================================
-- The 5/2 leads CSV showed three older contact_form leads still
-- with role=NULL because the v12 heuristic was English-leaning:
--   * "Prueba envio mail schedule desde inversionista" — the
--     `\binversion\b` boundary in the regex (mirrored in
--     ILIKE '%inversion%') matched, but only because we were lucky;
--     the proper Spanish term is "inversionista" / "inversor".
--   * "Prueba de envio a comercial" — "comercial" had no mapping at
--     all, so the lead landed with role=NULL.
--   * "Prueba envio mail schedule desde empresa" — should have
--     matched, kept here for safety.
-- v13 re-runs the backfill with broader Spanish coverage. It is
-- idempotent and only touches rows where role IS STILL NULL.
-- ============================================================

UPDATE leads
SET role = CASE
  WHEN role IS NOT NULL THEN role
  WHEN notes ILIKE '%inquilino%' OR notes ILIKE '%tenant%'
       OR notes ILIKE '%apartment%' OR notes ILIKE '%rent a%'
       OR notes ILIKE '%arrend%'
    THEN 'inquilino'
  WHEN notes ILIKE '%propietario%' OR notes ILIKE '%landlord%'
       OR notes ILIKE '%my property%' OR notes ILIKE '%my unit%'
       OR notes ILIKE '%propiedad%'
    THEN 'propietario'
  WHEN notes ILIKE '%empresa%' OR notes ILIKE '%business%'
       OR notes ILIKE '%pyme%' OR notes ILIKE '%my company%'
       OR notes ILIKE '%small business%'
       OR notes ILIKE '%comercial%' OR notes ILIKE '%negocio%'
       OR notes ILIKE '%comercio%'
    THEN 'pymes'
  WHEN notes ILIKE '%inversion%' OR notes ILIKE '%investor%'
       OR notes ILIKE '%portfolio%' OR notes ILIKE '%inversor%'
       OR notes ILIKE '%portafolio%'
    THEN 'inversionista'
  ELSE role
END
WHERE role IS NULL
  AND notes IS NOT NULL;
