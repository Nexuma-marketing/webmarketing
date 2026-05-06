-- ============================================================
-- Consolidated migration: v16 + v17 + v18 + v19
-- ============================================================
-- ASCII-only single file you can paste into the Supabase SQL Editor
-- and run in one shot. Idempotent: re-running is safe.
--
-- v16: form_questions options sync (Client Acquisition,
--      Sales Leak Diagnosis, owner_property, tenant_preferences)
-- v17: legal_documents seeded with the seven actual consent texts
-- v18: consent_logs CHECK constraint widened to accept every
--      consent_type the registration forms now log
-- v19: missing "Plan: Low Price" service for the Reassign dropdown
-- ============================================================


-- ============================================================
-- v16: form_questions options sync
-- ============================================================

-- v16-A. Client Acquisition (slug: business_acquisition)
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
    'Step 1 of 3 - Business Profile'),
  (1, 'industry', 'Industry / Sector', 'select',
    '[{"value":"retail","label":"Retail / Commerce"},{"value":"services","label":"Services"},{"value":"technology","label":"Technology"},{"value":"food_beverage","label":"Food & Beverage"},{"value":"health","label":"Health & Wellness"},{"value":"education","label":"Education"},{"value":"construction","label":"Construction"},{"value":"other","label":"Other"}]',
    true, 'Step 1 of 3 - Business Profile'),
  (2, 'years_in_business', 'Years in business', 'number', NULL, true,
    'Step 1 of 3 - Business Profile'),
  (3, 'business_goals', 'Main business goals (select all that apply)', 'multiselect',
    '[{"value":"increase_revenue","label":"Increase revenue"},{"value":"more_clients","label":"Get more clients"},{"value":"brand_awareness","label":"Improve brand awareness"},{"value":"launch_product","label":"Launch new product/service"},{"value":"expand_market","label":"Expand to new market"},{"value":"client_retention","label":"Improve client retention"}]',
    true, 'Step 1 of 3 - Business Profile'),
  -- Step 2: Target Audience
  (4, 'target_age_range', 'Target customer age range', 'select',
    '[{"value":"18_25","label":"18-25"},{"value":"26_35","label":"26-35"},{"value":"36_50","label":"36-50"},{"value":"51_65","label":"51-65"},{"value":"65_plus","label":"65+"},{"value":"all_ages","label":"All ages"}]',
    true, 'Step 2 of 3 - Target Audience'),
  (5, 'target_location', 'Target customer location', 'text', NULL, true,
    'Step 2 of 3 - Target Audience'),
  (6, 'target_income', 'Target customer income level', 'select',
    '[{"value":"low","label":"Budget-conscious"},{"value":"medium","label":"Middle income"},{"value":"high","label":"High income"},{"value":"premium","label":"Premium / Luxury"}]',
    false, 'Step 2 of 3 - Target Audience'),
  (7, 'ideal_customer_description', 'Describe your ideal customer', 'textarea', NULL, true,
    'Step 2 of 3 - Target Audience'),
  -- Step 3: Current Marketing
  (8, 'current_channels', 'Current marketing channels (select all)', 'multiselect',
    '[{"value":"social_organic","label":"Social media (organic)"},{"value":"social_paid","label":"Social media (paid ads)"},{"value":"google_ads","label":"Google Ads"},{"value":"email","label":"Email marketing"},{"value":"content_blog","label":"Content / Blog"},{"value":"referrals","label":"Referrals / Word of mouth"},{"value":"events","label":"Events / Networking"},{"value":"none","label":"None"}]',
    true, 'Step 3 of 3 - Current Marketing'),
  (9, 'monthly_marketing_budget', 'Monthly marketing budget (CAD)', 'number', NULL, false,
    'Step 3 of 3 - Current Marketing'),
  (10, 'biggest_challenge', 'Biggest marketing challenge', 'select',
    '[{"value":"no_leads","label":"Not generating enough leads"},{"value":"low_conversion","label":"Low conversion rate"},{"value":"no_strategy","label":"No clear strategy"},{"value":"no_budget","label":"Limited budget"},{"value":"no_time","label":"No time to manage marketing"},{"value":"other","label":"Other"}]',
    true, 'Step 3 of 3 - Current Marketing')
) AS q(position, field_key, label, question_type, options, required, helper_text)
WHERE f.slug = 'business_acquisition';

-- v16-B. Sales Leak Diagnosis (slug: pymes_diagnosis)
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
    'Used to estimate the annual sales-leak loss (about 30%/yr x 12 months).'),
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

-- v16-C. Owner Property Registration option backfills
UPDATE form_questions SET options = '[{"value":"propietario","label":"Property owner"},{"value":"inversionista","label":"Investor"}]'::jsonb
WHERE field_key = 'user_type' AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'owner_property') AND options IS NULL;

UPDATE form_questions SET options = '[{"value":"single_house","label":"House"},{"value":"condo","label":"Condo / Apartment"},{"value":"penthouse","label":"Penthouse"},{"value":"basement","label":"Basement"},{"value":"studio","label":"Studio / Apartastudio"},{"value":"rooms_only","label":"Rooms only"}]'::jsonb
WHERE field_key = 'property_type' AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'owner_property') AND options IS NULL;

UPDATE form_questions SET options = '[{"value":"empty","label":"Empty / Available now"},{"value":"occupied_lease","label":"Occupied (lease ending soon)"},{"value":"occupied_indef","label":"Occupied (no end date)"}]'::jsonb
WHERE field_key = 'occupancy_status' AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'owner_property') AND options IS NULL;

UPDATE form_questions SET options = '[{"value":"1","label":"1 BR"},{"value":"2","label":"2 BR"},{"value":"3","label":"3 BR"},{"value":"4","label":"4 BR"},{"value":"5","label":"5 BR"},{"value":"6","label":"6 BR"},{"value":"7","label":"7 BR"}]'::jsonb
WHERE field_key = 'bedrooms' AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'owner_property') AND options IS NULL;

UPDATE form_questions SET options = '[{"value":"1","label":"1 Bath"},{"value":"1.5","label":"1.5 Bath"},{"value":"2","label":"2 Bath"},{"value":"2.5","label":"2.5 Bath"},{"value":"3","label":"3 Bath"},{"value":"3.5","label":"3.5 Bath"}]'::jsonb
WHERE field_key = 'bathrooms' AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'owner_property') AND options IS NULL;

UPDATE form_questions SET options = '[{"value":"modern","label":"Modern"},{"value":"classic","label":"Classic"},{"value":"minimalist","label":"Minimalist"},{"value":"luxury","label":"Luxury"},{"value":"rustic","label":"Rustic"}]'::jsonb
WHERE field_key = 'style' AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'owner_property') AND options IS NULL;

UPDATE form_questions SET options = '[{"value":"single","label":"Single level"},{"value":"two","label":"Two levels"},{"value":"three_plus","label":"Three+ levels"}]'::jsonb
WHERE field_key = 'levels' AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'owner_property') AND options IS NULL;

UPDATE form_questions SET options = '[{"value":"Vancouver","label":"Vancouver"},{"value":"Burnaby","label":"Burnaby"},{"value":"Richmond","label":"Richmond"},{"value":"Surrey","label":"Surrey"},{"value":"Coquitlam","label":"Coquitlam"},{"value":"North Vancouver","label":"North Vancouver"},{"value":"Langley","label":"Langley"},{"value":"Other","label":"Other (BC)"}]'::jsonb
WHERE field_key = 'city' AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'owner_property') AND options IS NULL;

-- v16-D. Tenant Preferences option backfills
UPDATE form_questions SET options = '[{"value":"employed_full","label":"Employed full-time"},{"value":"employed_part","label":"Employed part-time"},{"value":"self_employed","label":"Self-employed"},{"value":"student_local","label":"Local student"},{"value":"student_international","label":"International student"},{"value":"retired","label":"Retired"},{"value":"unemployed","label":"Currently unemployed"}]'::jsonb
WHERE field_key = 'employment_type' AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'tenant_preferences') AND options IS NULL;

UPDATE form_questions SET options = '[{"value":"university","label":"University"},{"value":"college","label":"College"},{"value":"language","label":"Language school"},{"value":"other","label":"Other"}]'::jsonb
WHERE field_key = 'institution_type' AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'tenant_preferences') AND options IS NULL;

UPDATE form_questions SET options = '[{"value":"1","label":"1 person"},{"value":"2","label":"2 people"},{"value":"3","label":"3 people"},{"value":"4","label":"4 people"},{"value":"5_plus","label":"5+ people"}]'::jsonb
WHERE field_key = 'number_of_people' AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'tenant_preferences') AND options IS NULL;

UPDATE form_questions SET options = '[{"value":"house","label":"House"},{"value":"condo","label":"Condo / Apartment"},{"value":"basement","label":"Basement"},{"value":"studio","label":"Studio"},{"value":"shared","label":"Shared room"}]'::jsonb
WHERE field_key = 'property_type_desired' AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'tenant_preferences') AND options IS NULL;

UPDATE form_questions SET options = '[{"value":"Vancouver","label":"Vancouver"},{"value":"Burnaby","label":"Burnaby"},{"value":"Richmond","label":"Richmond"},{"value":"Surrey","label":"Surrey"},{"value":"Coquitlam","label":"Coquitlam"},{"value":"North Vancouver","label":"North Vancouver"},{"value":"Langley","label":"Langley"},{"value":"Other","label":"Other (BC)"}]'::jsonb
WHERE field_key = 'preferred_zones' AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'tenant_preferences') AND options IS NULL;

UPDATE form_questions SET options = '[{"value":"1","label":"1 BR"},{"value":"2","label":"2 BR"},{"value":"3","label":"3 BR"},{"value":"4","label":"4 BR"},{"value":"5_plus","label":"5+ BR"}]'::jsonb
WHERE field_key = 'bedrooms_needed' AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'tenant_preferences') AND options IS NULL;

UPDATE form_questions SET options = '[{"value":"1","label":"1 Bath"},{"value":"1.5","label":"1.5 Bath"},{"value":"2","label":"2 Bath"},{"value":"2.5","label":"2.5 Bath"},{"value":"3_plus","label":"3+ Bath"}]'::jsonb
WHERE field_key = 'bathrooms_needed' AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'tenant_preferences') AND options IS NULL;

UPDATE form_questions SET options = '[{"value":"6","label":"6 months"},{"value":"12","label":"12 months"},{"value":"18","label":"18 months"},{"value":"24","label":"24 months"}]'::jsonb
WHERE field_key = 'contract_duration' AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'tenant_preferences') AND options IS NULL;

UPDATE form_questions SET options = '[{"value":"single","label":"Single level"},{"value":"two","label":"Two levels"},{"value":"upper","label":"Upper floor"},{"value":"ground","label":"Ground floor"}]'::jsonb
WHERE field_key = 'levels_preferred' AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'tenant_preferences') AND options IS NULL;

UPDATE form_questions SET options = '[{"value":"modern","label":"Modern"},{"value":"classic","label":"Classic"},{"value":"minimalist","label":"Minimalist"},{"value":"luxury","label":"Luxury"},{"value":"rustic","label":"Rustic"}]'::jsonb
WHERE field_key = 'style_preference' AND form_id = (SELECT id FROM forms_dynamic WHERE slug = 'tenant_preferences') AND options IS NULL;


-- ============================================================
-- v17: legal_documents seeded with the seven actual consent texts
-- ============================================================

INSERT INTO legal_documents (type, content, version) VALUES
  ('consent_image_usage',
    E'I consent to image usage and editing for marketing purposes.\n\nBy ticking this box, you authorize WebMarketing / Nexuma Marketing to:\n  - Use the photographs you upload for the purpose of advertising your property on our marketing channels (website, social media, listing portals, email campaigns).\n  - Apply standard editing such as cropping, color correction, watermarking and exposure adjustment to improve presentation, without altering the substance of the unit.\n  - Retain the images for as long as the property is actively listed plus 90 days after the listing ends.\n\nYou retain ownership of your images at all times. You can revoke this consent and request deletion at any time by contacting privacy@nexuma.ca.',
    '1.0'),

  ('consent_data_processing',
    E'I consent to data collection and processing (PIPA / PIPEDA).\n\nWe collect the personal information you provide on this form (name, contact details, property details) and process it solely to:\n  - Match your property with qualified tenants.\n  - Coordinate visits, screening and lease signing.\n  - Send you transactional updates about your listing.\n\nYour data is stored on infrastructure located in Canada and is protected with encryption in transit and at rest. We comply with the British Columbia Personal Information Protection Act (PIPA) and the federal Personal Information Protection and Electronic Documents Act (PIPEDA).',
    '1.0'),

  ('consent_marketing',
    E'I consent to receive electronic communications (CASL).\n\nUnder the Canadian Anti-Spam Legislation, we ask for your express consent before sending you marketing emails or SMS messages about new services, promotions, market reports or events.\n\nYou can withdraw consent at any time using the Unsubscribe link in any of our emails or by replying STOP to any SMS.',
    '1.0'),

  ('consent_third_party',
    E'I accept the Terms and Conditions of Service.\n\nThis includes:\n  - The general Terms of Service governing your use of the platform.\n  - The fee structure of the plan you have selected (Founder / Basic / Preferred / Elite).\n  - The dispute-resolution and governing-law clauses (British Columbia, Canada).\n\nIf you have questions about any clause please contact legal@nexuma.ca before submitting the form.',
    '1.0'),

  ('consent_screening',
    E'I consent to a background and credit screening (tenant).\n\nYou authorize WebMarketing / Nexuma Marketing and the property owner to perform a tenant screening that may include:\n  - Credit history check (e.g., Equifax / TransUnion soft pull).\n  - Verification of employment or income source you have declared.\n  - Search of public records (BC Online, court records) for prior eviction or judgment history.\n\nResults are shared only with the property owner whose listing you applied to. The screening report is destroyed 6 months after the application is closed.',
    '1.0'),

  ('consent_references',
    E'I consent to reference verification.\n\nYou authorize us to contact the personal and / or professional references you provided in the application to verify the information you have submitted. Reference responses are confidential and used only to assess your suitability as a tenant for the specific property you applied to.',
    '1.0'),

  ('consent_truthfulness',
    E'Declaration of truthfulness.\n\nI confirm that the information I have provided in this application is true, complete and not misleading to the best of my knowledge. I understand that providing false information may result in:\n  - Immediate cancellation of my application.\n  - Termination of any lease that may have been signed on the basis of false information.\n  - Liability for damages caused by the misrepresentation.',
    '1.0')
ON CONFLICT (type) DO NOTHING;


-- ============================================================
-- v18: consent_logs CHECK constraint widened
-- ============================================================

ALTER TABLE consent_logs DROP CONSTRAINT IF EXISTS consent_logs_consent_type_check;

ALTER TABLE consent_logs
  ADD CONSTRAINT consent_logs_consent_type_check
  CHECK (consent_type IN (
    'data_processing',
    'image_usage',
    'marketing',
    'third_party',
    'screening',
    'references',
    'truthfulness',
    'communications',
    'consent_data_processing',
    'consent_image_usage',
    'consent_marketing',
    'consent_third_party',
    'consent_screening',
    'consent_references',
    'consent_truthfulness',
    'consent_communications'
  ));

DROP POLICY IF EXISTS "Admins can view all consent_logs" ON consent_logs;
CREATE POLICY "Admins can view all consent_logs" ON consent_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );


-- ============================================================
-- v19: missing "Plan: Low Price" service for the Reassign dropdown
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


-- ============================================================
-- Verification (read-only - confirms each block landed)
-- ============================================================

SELECT
  (SELECT COUNT(*) FROM form_questions q
     JOIN forms_dynamic f ON f.id = q.form_id
     WHERE f.slug = 'business_acquisition') AS business_acquisition_questions,
  (SELECT COUNT(*) FROM form_questions q
     JOIN forms_dynamic f ON f.id = q.form_id
     WHERE f.slug = 'pymes_diagnosis') AS pymes_diagnosis_questions,
  (SELECT COUNT(*) FROM legal_documents) AS legal_documents_count,
  (SELECT COUNT(*) FROM services WHERE category = 'plan') AS plan_services_count;
