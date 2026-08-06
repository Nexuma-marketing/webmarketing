-- ============================================================
-- Migration v16 — Sync form_questions options with production forms
-- ============================================================
-- Steve 5/4 docx: "Las opciones y preguntas de Client Acquisition no
-- son las que están en el formulario", "En propietarios y tenant
-- profile no salen las opciones existentes", "En sale leak diagnosis
-- cambia la pregunta pero no las opciones".
--
-- Root cause: v10/v11/v12 seeded these forms with different question
-- shapes than what the public-facing forms actually render.
--
-- v16 wipes the existing seed and re-INSERTs each form's questions
-- using the EXACT field_keys, labels, and options used by:
--   * /forms/pymes (Client Acquisition + Sales Leak)
--   * /forms/propietario (Owner property registration)
--   * /forms/inquilino  (Tenant preferences)
-- so admin edits the same shape clients fill in.
-- ============================================================

-- ------------------------------------------------------------
-- A. Client Acquisition (slug: business_acquisition)
--    Three-step form per /forms/pymes CAPTACION_STEPS (lines 153-221).
-- ------------------------------------------------------------
DELETE FROM form_questions
WHERE form_id IN (SELECT id FROM forms_dynamic WHERE slug = 'business_acquisition');

UPDATE forms_dynamic
SET name = 'Client Acquisition (Empresas)',
    description = 'Three-step business profile / target audience / marketing form rendered at /forms/pymes when the visitor picks "Client Acquisition".',
    target_role = 'pymes',
    updated_at = NOW()
WHERE slug = 'business_acquisition';

INSERT INTO form_questions (form_id, position, field_key, label, question_type, options, required, is_active, helper_text)
SELECT f.id, q.position, q.field_key, q.label, q.question_type, q.options::jsonb, q.required, true, q.helper_text
FROM forms_dynamic f
CROSS JOIN (VALUES
  -- Step 1: Business Profile
  (0, 'business_name', 'Business name', 'text', NULL, true,
    'Step 1 of 3 — Business Profile'),
  (1, 'industry', 'Industry / Sector', 'select',
    '[{"value":"retail","label":"Retail / Commerce"},{"value":"services","label":"Services"},{"value":"technology","label":"Technology"},{"value":"food_beverage","label":"Food & Beverage"},{"value":"health","label":"Health & Wellness"},{"value":"education","label":"Education"},{"value":"construction","label":"Construction"},{"value":"other","label":"Other"}]',
    true, 'Step 1 of 3 — Business Profile'),
  (2, 'years_in_business', 'Years in business', 'number', NULL, true,
    'Step 1 of 3 — Business Profile'),
  (3, 'business_goals', 'Main business goals (select all that apply)', 'multiselect',
    '[{"value":"increase_revenue","label":"Increase revenue"},{"value":"more_clients","label":"Get more clients"},{"value":"brand_awareness","label":"Improve brand awareness"},{"value":"launch_product","label":"Launch new product/service"},{"value":"expand_market","label":"Expand to new market"},{"value":"client_retention","label":"Improve client retention"}]',
    true, 'Step 1 of 3 — Business Profile'),
  -- Step 2: Target Audience
  (4, 'target_age_range', 'Target customer age range', 'select',
    '[{"value":"18_25","label":"18-25"},{"value":"26_35","label":"26-35"},{"value":"36_50","label":"36-50"},{"value":"51_65","label":"51-65"},{"value":"65_plus","label":"65+"},{"value":"all_ages","label":"All ages"}]',
    true, 'Step 2 of 3 — Target Audience'),
  (5, 'target_location', 'Target customer location', 'text', NULL, true,
    'Step 2 of 3 — Target Audience'),
  (6, 'target_income', 'Target customer income level', 'select',
    '[{"value":"low","label":"Budget-conscious"},{"value":"medium","label":"Middle income"},{"value":"high","label":"High income"},{"value":"premium","label":"Premium / Luxury"}]',
    false, 'Step 2 of 3 — Target Audience'),
  (7, 'ideal_customer_description', 'Describe your ideal customer', 'textarea', NULL, true,
    'Step 2 of 3 — Target Audience'),
  -- Step 3: Current Marketing
  (8, 'current_channels', 'Current marketing channels (select all)', 'multiselect',
    '[{"value":"social_organic","label":"Social media (organic)"},{"value":"social_paid","label":"Social media (paid ads)"},{"value":"google_ads","label":"Google Ads"},{"value":"email","label":"Email marketing"},{"value":"content_blog","label":"Content / Blog"},{"value":"referrals","label":"Referrals / Word of mouth"},{"value":"events","label":"Events / Networking"},{"value":"none","label":"None"}]',
    true, 'Step 3 of 3 — Current Marketing'),
  (9, 'monthly_marketing_budget', 'Monthly marketing budget (CAD)', 'number', NULL, false,
    'Step 3 of 3 — Current Marketing'),
  (10, 'biggest_challenge', 'Biggest marketing challenge', 'select',
    '[{"value":"no_leads","label":"Not generating enough leads"},{"value":"low_conversion","label":"Low conversion rate"},{"value":"no_strategy","label":"No clear strategy"},{"value":"no_budget","label":"Limited budget"},{"value":"no_time","label":"No time to manage marketing"},{"value":"other","label":"Other"}]',
    true, 'Step 3 of 3 — Current Marketing')
) AS q(position, field_key, label, question_type, options, required, helper_text)
WHERE f.slug = 'business_acquisition';

-- ------------------------------------------------------------
-- B. Sales Leak Diagnosis (slug: pymes_diagnosis)
--    7 Likert questions + business name + sector + monthly_revenue,
--    matching /forms/pymes QUESTIONS array (lines 57-100).
--    v12 seeded the 7 Likert questions but used different field_keys
--    than the website. v16 corrects them so admin edits propagate.
-- ------------------------------------------------------------
DELETE FROM form_questions
WHERE form_id IN (SELECT id FROM forms_dynamic WHERE slug = 'pymes_diagnosis');

UPDATE forms_dynamic
SET name = 'Sales Leak Diagnosis',
    description = '7-question Likert calculator (1=Very poor, 5=Excellent) plus revenue/sector/business-name. Mirrors /forms/pymes Diagnosis exactly.',
    target_role = 'pymes',
    updated_at = NOW()
WHERE slug = 'pymes_diagnosis';

INSERT INTO form_questions (form_id, position, field_key, label, question_type, options, required, is_active, helper_text)
SELECT f.id, q.position, q.field_key, q.label, q.question_type, q.options::jsonb, q.required, true, q.helper_text
FROM forms_dynamic f
CROSS JOIN (VALUES
  (0, 'business_name', 'Business name', 'text', NULL, true, NULL),
  (1, 'sector', 'Industry / Sector', 'select',
    '[{"value":"retail","label":"Retail / Commerce"},{"value":"services","label":"Services"},{"value":"technology","label":"Technology"},{"value":"food_beverage","label":"Food & Beverage"},{"value":"health","label":"Health & Wellness"},{"value":"education","label":"Education"},{"value":"construction","label":"Construction"},{"value":"other","label":"Other"}]',
    true, NULL),
  (2, 'monthly_revenue', 'Average monthly revenue (CAD)', 'number', NULL, true,
    'Used to estimate the annual sales-leak loss (~30%/yr × 12 months).'),
  (3, 'q1_online_presence', 'Is your flow of new clients constant and predictable month to month?', 'select',
    '[{"value":"1","label":"1 - No, very irregular"},{"value":"2","label":"2 - Weak"},{"value":"3","label":"3 - Average"},{"value":"4","label":"4 - Good"},{"value":"5","label":"5 - Yes, constant and predictable"}]',
    true, 'Block: SALES'),
  (4, 'q2_seo_positioning', 'Do you have an automated system to follow up with prospects?', 'select',
    '[{"value":"1","label":"1 - No system at all"},{"value":"2","label":"2 - Weak"},{"value":"3","label":"3 - Average"},{"value":"4","label":"4 - Good"},{"value":"5","label":"5 - Yes, fully automated follow-up"}]',
    true, 'Block: SALES'),
  (5, 'q3_lead_generation', 'Is your value proposition so clear that a child would understand it in 10 seconds?', 'select',
    '[{"value":"1","label":"1 - Not clear at all"},{"value":"2","label":"2 - Weak"},{"value":"3","label":"3 - Average"},{"value":"4","label":"4 - Good"},{"value":"5","label":"5 - Absolutely clear and compelling"}]',
    true, 'Block: BRAND'),
  (6, 'q4_lead_conversion', 'Does your visual identity look more professional than your direct competition?', 'select',
    '[{"value":"1","label":"1 - No, it looks amateur"},{"value":"2","label":"2 - Weak"},{"value":"3","label":"3 - Average"},{"value":"4","label":"4 - Good"},{"value":"5","label":"5 - Yes, clearly more professional"}]',
    true, 'Block: BRAND'),
  (7, 'q5_client_retention', 'Can your business operate for a week without you intervening operationally?', 'select',
    '[{"value":"1","label":"1 - No, it depends on me entirely"},{"value":"2","label":"2 - Weak"},{"value":"3","label":"3 - Average"},{"value":"4","label":"4 - Good"},{"value":"5","label":"5 - Yes, it runs on its own"}]',
    true, 'Block: SYSTEMS'),
  (8, 'q6_repeat_purchases', 'Do you measure the exact cost of acquiring each new client?', 'select',
    '[{"value":"1","label":"1 - No idea what it costs"},{"value":"2","label":"2 - Weak"},{"value":"3","label":"3 - Average"},{"value":"4","label":"4 - Good"},{"value":"5","label":"5 - Yes, I know the exact CAC"}]',
    true, 'Block: SYSTEMS'),
  (9, 'q7_marketing_strategy', 'Cost of inaction: how serious would it be to continue the same way for 12 months?', 'select',
    '[{"value":"1","label":"1 - Not critical at all"},{"value":"2","label":"2 - Weak"},{"value":"3","label":"3 - Average"},{"value":"4","label":"4 - Good"},{"value":"5","label":"5 - Extremely critical, could threaten the business"}]',
    true, 'Block: FUTURE')
) AS q(position, field_key, label, question_type, options, required, helper_text)
WHERE f.slug = 'pymes_diagnosis';

-- ------------------------------------------------------------
-- C. Owner Property Registration (slug: owner_property)
--    Re-seed select fields with their option arrays. v10 left
--    options=NULL for many select fields, so admin saw the field
--    label but couldn't edit / preview the choices.
-- ------------------------------------------------------------
UPDATE form_questions
SET options = '[{"value":"propietario","label":"Property owner"},{"value":"inversionista","label":"Investor"}]'::jsonb
WHERE field_key = 'user_type'
  AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'owner_property')
  AND options IS NULL;

UPDATE form_questions
SET options = '[{"value":"single_house","label":"House"},{"value":"condo","label":"Condo / Apartment"},{"value":"penthouse","label":"Penthouse"},{"value":"basement","label":"Basement"},{"value":"studio","label":"Studio / Apartastudio"},{"value":"rooms_only","label":"Rooms only"}]'::jsonb
WHERE field_key = 'property_type'
  AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'owner_property')
  AND options IS NULL;

UPDATE form_questions
SET options = '[{"value":"empty","label":"Empty / Available now"},{"value":"occupied_lease","label":"Occupied (lease ending soon)"},{"value":"occupied_indef","label":"Occupied (no end date)"}]'::jsonb
WHERE field_key = 'occupancy_status'
  AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'owner_property')
  AND options IS NULL;

UPDATE form_questions
SET options = '[{"value":"1","label":"1 BR"},{"value":"2","label":"2 BR"},{"value":"3","label":"3 BR"},{"value":"4","label":"4 BR"},{"value":"5","label":"5 BR"},{"value":"6","label":"6 BR"},{"value":"7","label":"7 BR"}]'::jsonb
WHERE field_key = 'bedrooms'
  AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'owner_property')
  AND options IS NULL;

UPDATE form_questions
SET options = '[{"value":"1","label":"1 Bath"},{"value":"1.5","label":"1.5 Bath"},{"value":"2","label":"2 Bath"},{"value":"2.5","label":"2.5 Bath"},{"value":"3","label":"3 Bath"},{"value":"3.5","label":"3.5 Bath"}]'::jsonb
WHERE field_key = 'bathrooms'
  AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'owner_property')
  AND options IS NULL;

UPDATE form_questions
SET options = '[{"value":"modern","label":"Modern"},{"value":"classic","label":"Classic"},{"value":"minimalist","label":"Minimalist"},{"value":"luxury","label":"Luxury"},{"value":"rustic","label":"Rustic"}]'::jsonb
WHERE field_key = 'style'
  AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'owner_property')
  AND options IS NULL;

UPDATE form_questions
SET options = '[{"value":"single","label":"Single level"},{"value":"two","label":"Two levels"},{"value":"three_plus","label":"Three+ levels"}]'::jsonb
WHERE field_key = 'levels'
  AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'owner_property')
  AND options IS NULL;

UPDATE form_questions
SET options = '[{"value":"Vancouver","label":"Vancouver"},{"value":"Burnaby","label":"Burnaby"},{"value":"Richmond","label":"Richmond"},{"value":"Surrey","label":"Surrey"},{"value":"Coquitlam","label":"Coquitlam"},{"value":"North Vancouver","label":"North Vancouver"},{"value":"Langley","label":"Langley"},{"value":"Other","label":"Other (BC)"}]'::jsonb
WHERE field_key = 'city'
  AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'owner_property')
  AND options IS NULL;

-- ------------------------------------------------------------
-- D. Tenant Preferences (slug: tenant_preferences)
--    Same treatment — fill in the options for select fields that
--    v10 left as NULL.
-- ------------------------------------------------------------
UPDATE form_questions
SET options = '[{"value":"employed_full","label":"Employed full-time"},{"value":"employed_part","label":"Employed part-time"},{"value":"self_employed","label":"Self-employed"},{"value":"student_local","label":"Local student"},{"value":"student_international","label":"International student"},{"value":"retired","label":"Retired"},{"value":"unemployed","label":"Currently unemployed"}]'::jsonb
WHERE field_key = 'employment_type'
  AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'tenant_preferences')
  AND options IS NULL;

UPDATE form_questions
SET options = '[{"value":"university","label":"University"},{"value":"college","label":"College"},{"value":"language","label":"Language school"},{"value":"other","label":"Other"}]'::jsonb
WHERE field_key = 'institution_type'
  AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'tenant_preferences')
  AND options IS NULL;

UPDATE form_questions
SET options = '[{"value":"1","label":"1 person"},{"value":"2","label":"2 people"},{"value":"3","label":"3 people"},{"value":"4","label":"4 people"},{"value":"5_plus","label":"5+ people"}]'::jsonb
WHERE field_key = 'number_of_people'
  AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'tenant_preferences')
  AND options IS NULL;

UPDATE form_questions
SET options = '[{"value":"house","label":"House"},{"value":"condo","label":"Condo / Apartment"},{"value":"basement","label":"Basement"},{"value":"studio","label":"Studio"},{"value":"shared","label":"Shared room"}]'::jsonb
WHERE field_key = 'property_type_desired'
  AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'tenant_preferences')
  AND options IS NULL;

UPDATE form_questions
SET options = '[{"value":"Vancouver","label":"Vancouver"},{"value":"Burnaby","label":"Burnaby"},{"value":"Richmond","label":"Richmond"},{"value":"Surrey","label":"Surrey"},{"value":"Coquitlam","label":"Coquitlam"},{"value":"North Vancouver","label":"North Vancouver"},{"value":"Langley","label":"Langley"},{"value":"Other","label":"Other (BC)"}]'::jsonb
WHERE field_key = 'preferred_zones'
  AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'tenant_preferences')
  AND options IS NULL;

UPDATE form_questions
SET options = '[{"value":"1","label":"1 BR"},{"value":"2","label":"2 BR"},{"value":"3","label":"3 BR"},{"value":"4","label":"4 BR"},{"value":"5_plus","label":"5+ BR"}]'::jsonb
WHERE field_key = 'bedrooms_needed'
  AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'tenant_preferences')
  AND options IS NULL;

UPDATE form_questions
SET options = '[{"value":"1","label":"1 Bath"},{"value":"1.5","label":"1.5 Bath"},{"value":"2","label":"2 Bath"},{"value":"2.5","label":"2.5 Bath"},{"value":"3_plus","label":"3+ Bath"}]'::jsonb
WHERE field_key = 'bathrooms_needed'
  AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'tenant_preferences')
  AND options IS NULL;

UPDATE form_questions
SET options = '[{"value":"6","label":"6 months"},{"value":"12","label":"12 months"},{"value":"18","label":"18 months"},{"value":"24","label":"24 months"}]'::jsonb
WHERE field_key = 'contract_duration'
  AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'tenant_preferences')
  AND options IS NULL;

UPDATE form_questions
SET options = '[{"value":"single","label":"Single level"},{"value":"two","label":"Two levels"},{"value":"upper","label":"Upper floor"},{"value":"ground","label":"Ground floor"}]'::jsonb
WHERE field_key = 'levels_preferred'
  AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'tenant_preferences')
  AND options IS NULL;

UPDATE form_questions
SET options = '[{"value":"modern","label":"Modern"},{"value":"classic","label":"Classic"},{"value":"minimalist","label":"Minimalist"},{"value":"luxury","label":"Luxury"},{"value":"rustic","label":"Rustic"}]'::jsonb
WHERE field_key = 'style_preference'
  AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'tenant_preferences')
  AND options IS NULL;
