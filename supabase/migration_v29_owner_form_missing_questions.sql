-- ============================================================
-- Migration v29 — seed the 4 owner-property form_questions that
--                 v10 missed
-- ============================================================
-- Steve 5/15 (live test): the propietario form uses field keys
-- `smart_home_features`, `skytrain_lines`, `nearby_supermarkets`
-- and `social_life` (the data columns were added back in v3), but
-- v10 only seeded 31 form_questions rows and these four were left
-- out. As a consequence the admin panel /admin/forms shows no row
-- for them, so an admin cannot edit their label, helper text,
-- required flag, visibility, or options. The public form always
-- falls back to the hardcoded copy.
--
-- v29 inserts the four missing rows so admin/forms behaves
-- consistently for the whole owner_property form. Positions are
-- 32–35 (after the v10 0–31 range) to avoid colliding with any
-- existing rows or manual admin re-orders. Options for the three
-- multiselect fields are seeded from the production list shown in
-- src/app/forms/propietario/page.tsx (SMART_HOME_FEATURES,
-- SKYTRAIN_LINES, SUPERMARKETS).
--
-- Idempotent: ON CONFLICT(form_id, field_key) DO NOTHING.
-- ============================================================

INSERT INTO form_questions (form_id, position, field_key, label, question_type, options, required, is_active, helper_text)
SELECT f.id, q.position, q.field_key, q.label, q.question_type, q.options::jsonb, q.required, true, q.helper_text
FROM forms_dynamic f
CROSS JOIN (VALUES
  (32, 'smart_home_features',
       'Smart home features',
       'multiselect',
       '[{"value":"Smart locks","label":"Smart locks"},{"value":"Keyless entry card","label":"Keyless entry card"},{"value":"Other","label":"Other"}]',
       false,
       'Shown only when the owner has marked the property as smart-home enabled.'),
  (33, 'skytrain_lines',
       'SkyTrain lines nearby',
       'multiselect',
       '[{"value":"Millennium Line","label":"Millennium Line"},{"value":"Expo Line","label":"Expo Line"},{"value":"Canada Line","label":"Canada Line"}]',
       false,
       'Shown only when the owner has marked the property as near a SkyTrain station.'),
  (34, 'nearby_supermarkets',
       'Nearby supermarkets',
       'multiselect',
       '[{"value":"Superstore","label":"Superstore"},{"value":"Walmart","label":"Walmart"},{"value":"Costco","label":"Costco"},{"value":"Save-On-Foods","label":"Save-On-Foods"},{"value":"Whole Foods","label":"Whole Foods"},{"value":"T&T Supermarket","label":"T&T Supermarket"},{"value":"No Frills","label":"No Frills"},{"value":"Safeway","label":"Safeway"},{"value":"Dollarama","label":"Dollarama"}]',
       false,
       NULL),
  (35, 'social_life',
       'Social life nearby (optional)',
       'text',
       NULL,
       false,
       'Free-form: bars, cinemas, restaurants, etc.')
) AS q(position, field_key, label, question_type, options, required, helper_text)
WHERE f.slug = 'owner_property'
ON CONFLICT (form_id, field_key) DO NOTHING;

-- Verification:
-- SELECT field_key, question_type, position,
--        jsonb_array_length(options) AS option_count, helper_text
-- FROM form_questions
-- WHERE form_id = (SELECT id FROM forms_dynamic WHERE slug = 'owner_property')
--   AND field_key IN ('smart_home_features','skytrain_lines','nearby_supermarkets','social_life')
-- ORDER BY field_key;
