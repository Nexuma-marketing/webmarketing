-- ============================================================
-- Migration v21 - align admin form_questions options with the
-- options actually rendered on the public propietario / inquilino
-- forms so /admin/forms Edit Question shows real, editable options.
-- ============================================================
-- Steve 5/6: two pendings on the new feedback file.
--
-- 1. /admin/forms -> owner_property -> Edit Question on a multiselect
--    such as "objectives" shows "No options yet -- add at least one."
--    The public propietario form renders the OBJECTIVES list from a
--    hardcoded constant, so the form_questions row exists but its
--    options column is NULL. We backfill it.
--
-- 2. /admin/forms -> tenant_preferences -> Edit Question on
--    property_type_desired shows house / condo / basement / studio /
--    shared as options, but the public inquilino form actually uses
--    eleven options ranging from "Full house / apartment / basement
--    (not shared)" through "Pet Friendly". Steve compared the two and
--    flagged the mismatch in the 6 May DOCX (red ink "No son las
--    opciones" / "Son estas opciones").
--
-- Idempotent: each UPDATE writes the same value every run.
-- ============================================================


-- v21-A. Owner Property: backfill multiselect options that were left
-- NULL by the v16 seed.
UPDATE form_questions
SET options = '[
  {"value":"Rent extra spaces (rooms, den)","label":"Rent extra spaces (rooms, den)"},
  {"value":"Rent a full unit (basement, suite, house, apartment, penthouse)","label":"Rent a full unit (basement, suite, house, apartment, penthouse)"},
  {"value":"Cover mortgage payments","label":"Cover mortgage payments"},
  {"value":"Increase income","label":"Increase income"},
  {"value":"Get return on property investment","label":"Get return on property investment"},
  {"value":"Short-term rentals","label":"Short-term rentals"},
  {"value":"Long-term rentals","label":"Long-term rentals"},
  {"value":"Optimize assets","label":"Optimize assets"}
]'::jsonb
WHERE field_key = 'objectives'
  AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'owner_property');

UPDATE form_questions
SET options = '[
  {"value":"vacant","label":"Vacant"},
  {"value":"occupied","label":"Currently occupied"},
  {"value":"renovation","label":"Under renovation"},
  {"value":"new_construction","label":"New construction"}
]'::jsonb
WHERE field_key = 'occupancy_status'
  AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'owner_property');

UPDATE form_questions
SET options = '[
  {"value":"Gym","label":"Gym"},
  {"value":"Rooftop","label":"Rooftop"},
  {"value":"Coworking","label":"Coworking"},
  {"value":"Pool","label":"Pool"},
  {"value":"Jacuzzi","label":"Jacuzzi"},
  {"value":"Sauna","label":"Sauna"},
  {"value":"Covered parking","label":"Covered parking"},
  {"value":"Open parking","label":"Open parking"},
  {"value":"Private parking","label":"Private parking"},
  {"value":"In-unit laundry (washer & dryer)","label":"In-unit laundry (washer & dryer)"},
  {"value":"Building laundry (paid)","label":"Building laundry (paid)"},
  {"value":"In-unit washer only","label":"In-unit washer only"},
  {"value":"Fireplace","label":"Fireplace"},
  {"value":"Internet","label":"Internet"},
  {"value":"Airfryer","label":"Airfryer"},
  {"value":"Other","label":"Other"}
]'::jsonb
WHERE field_key = 'amenities'
  AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'owner_property');

UPDATE form_questions
SET options = '[
  {"value":"BBQ zone","label":"BBQ zone"},
  {"value":"SPA","label":"SPA"},
  {"value":"Billiards","label":"Billiards"},
  {"value":"Pool","label":"Pool"}
]'::jsonb
WHERE field_key = 'common_areas'
  AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'owner_property');

UPDATE form_questions
SET options = '[
  {"value":"Smart locks","label":"Smart locks"},
  {"value":"Keyless entry card","label":"Keyless entry card"},
  {"value":"Other","label":"Other"}
]'::jsonb
WHERE field_key = 'smart_home_features'
  AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'owner_property');

UPDATE form_questions
SET options = '[
  {"value":"Zumper","label":"Zumper"},
  {"value":"Craigslist","label":"Craigslist"},
  {"value":"Zillow","label":"Zillow"},
  {"value":"Kijiji","label":"Kijiji"},
  {"value":"Facebook Marketplace","label":"Facebook Marketplace"},
  {"value":"Realtor.ca","label":"Realtor.ca"},
  {"value":"Rentals.ca","label":"Rentals.ca"},
  {"value":"PadMapper","label":"PadMapper"},
  {"value":"Other","label":"Other"}
]'::jsonb
WHERE field_key = 'listing_platforms'
  AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'owner_property');

UPDATE form_questions
SET options = '[
  {"value":"Millennium Line","label":"Millennium Line"},
  {"value":"Expo Line","label":"Expo Line"},
  {"value":"Canada Line","label":"Canada Line"}
]'::jsonb
WHERE field_key = 'skytrain_lines'
  AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'owner_property');

UPDATE form_questions
SET options = '[
  {"value":"Superstore","label":"Superstore"},
  {"value":"Walmart","label":"Walmart"},
  {"value":"Costco","label":"Costco"},
  {"value":"Save-On-Foods","label":"Save-On-Foods"},
  {"value":"Whole Foods","label":"Whole Foods"},
  {"value":"T&T Supermarket","label":"T&T Supermarket"},
  {"value":"No Frills","label":"No Frills"},
  {"value":"Safeway","label":"Safeway"},
  {"value":"Dollarama","label":"Dollarama"}
]'::jsonb
WHERE field_key = 'nearby_supermarkets'
  AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'owner_property');


-- v21-B. Tenant Preferences: replace the v16 short list of property
-- types with the eleven-option list rendered on the public form.
UPDATE form_questions
SET options = '[
  {"value":"Full house / apartment / basement (not shared)","label":"Full house / apartment / basement (not shared)"},
  {"value":"Shared house / apartment / basement","label":"Shared house / apartment / basement"},
  {"value":"Private room & private bathroom","label":"Private room & private bathroom"},
  {"value":"Private room & shared bathroom","label":"Private room & shared bathroom"},
  {"value":"Shared room & shared bathroom","label":"Shared room & shared bathroom"},
  {"value":"Suite","label":"Suite"},
  {"value":"Penthouse","label":"Penthouse"},
  {"value":"Den","label":"Den"},
  {"value":"Smart home","label":"Smart home"},
  {"value":"Modern & elegant style","label":"Modern & elegant style"},
  {"value":"Pet Friendly","label":"Pet Friendly"}
]'::jsonb
WHERE field_key = 'property_type_desired'
  AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'tenant_preferences');

UPDATE form_questions
SET options = '[
  {"value":"Gym","label":"Gym"},
  {"value":"Rooftop","label":"Rooftop"},
  {"value":"Coworking","label":"Coworking"},
  {"value":"Pool","label":"Pool"},
  {"value":"Jacuzzi","label":"Jacuzzi"},
  {"value":"Sauna","label":"Sauna"},
  {"value":"Covered parking","label":"Covered parking"},
  {"value":"Open parking","label":"Open parking"},
  {"value":"Private parking","label":"Private parking"},
  {"value":"In-unit laundry (washer & dryer)","label":"In-unit laundry (washer & dryer)"},
  {"value":"Building laundry (paid)","label":"Building laundry (paid)"},
  {"value":"Fireplace","label":"Fireplace"},
  {"value":"Internet","label":"Internet"},
  {"value":"More","label":"More"}
]'::jsonb
WHERE field_key = 'preferred_amenities'
  AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'tenant_preferences');


-- Verification (dev-time check; safe to run multiple times):
-- SELECT slug, field_key, jsonb_array_length(options) AS option_count
-- FROM form_questions q JOIN forms_dynamic f ON f.id = q.form_id
-- WHERE field_key IN ('objectives','property_type_desired','preferred_amenities','occupancy_status')
-- ORDER BY slug, field_key;
