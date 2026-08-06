-- ============================================================
-- Migration v24 - restore Victoria + missing BC cities to forms
-- ============================================================
-- Steve 5/7: the customer flagged that Victoria (BC) no longer
-- appears in the city dropdown for propietarios / inversionistas.
-- The 7 May DOCX item [186]: "Ya no aparece la ciudad de victoria
-- y antes estaba tanto para inquilinos, como propietarios e
-- inversionistas."
--
-- Root cause:
--   /admin/forms writes city options into form_questions.options.
--   The propietario page reads via fieldOptions(fieldMeta, "city",
--   BC_CITIES) — DB row wins over the hardcoded BC_CITIES fallback.
--   v16 seeded only 8 cities, omitting Victoria, Kelowna, Nanaimo,
--   Kamloops, West Vancouver, New Westminster, Abbotsford. Result:
--   the public form silently dropped Victoria even though the code
--   constant still listed it.
--
-- This migration replaces the city/preferred_zones option arrays
-- with the full BC city list the hardcoded constants ship with so
-- DB and code agree.
--
-- Idempotent.
-- ============================================================

-- 1. Owner Property "city" — full BC_CITIES list from
--    src/app/forms/propietario/page.tsx (12 cities).
UPDATE form_questions
SET options = '[
  {"value":"Vancouver","label":"Vancouver"},
  {"value":"Burnaby","label":"Burnaby"},
  {"value":"Surrey","label":"Surrey"},
  {"value":"Richmond","label":"Richmond"},
  {"value":"North Vancouver","label":"North Vancouver"},
  {"value":"West Vancouver","label":"West Vancouver"},
  {"value":"Coquitlam","label":"Coquitlam"},
  {"value":"New Westminster","label":"New Westminster"},
  {"value":"Victoria","label":"Victoria"},
  {"value":"Kelowna","label":"Kelowna"},
  {"value":"Langley","label":"Langley"},
  {"value":"Abbotsford","label":"Abbotsford"},
  {"value":"Other","label":"Other (BC)"}
]'::jsonb
WHERE field_key = 'city'
  AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'owner_property');

-- 2. Tenant Preferences "preferred_zones" — full BC_ZONES list from
--    src/app/forms/inquilino/page.tsx (Downtown + 6 cities incl.
--    Victoria). Even though the inquilino page renders BC_ZONES
--    directly today, we keep the DB row in sync so any future switch
--    to fieldOptions overlay does not regress.
UPDATE form_questions
SET options = '[
  {"value":"Downtown","label":"Downtown"},
  {"value":"Vancouver","label":"Vancouver"},
  {"value":"Burnaby","label":"Burnaby"},
  {"value":"Surrey","label":"Surrey"},
  {"value":"Victoria","label":"Victoria"},
  {"value":"North Vancouver","label":"North Vancouver"},
  {"value":"Metrotown","label":"Metrotown"},
  {"value":"Richmond","label":"Richmond"},
  {"value":"Coquitlam","label":"Coquitlam"},
  {"value":"Langley","label":"Langley"},
  {"value":"Other","label":"Other (BC)"}
]'::jsonb
WHERE field_key = 'preferred_zones'
  AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'tenant_preferences');

-- Verification:
-- SELECT slug, field_key, options FROM form_questions q
-- JOIN forms_dynamic f ON f.id = q.form_id
-- WHERE field_key IN ('city','preferred_zones')
-- ORDER BY slug, field_key;
