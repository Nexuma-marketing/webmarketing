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

-- ============================================================
-- app_config: allow authenticated users to READ public config
-- Steve 4/28 (round 2): Founders counter saved as 7 by admin but
-- propietario sees 0 because the existing RLS only let admins read.
-- Same problem affects plan_features:* used on the Services page.
-- We add a public-read policy for the "founders_plan" and
-- "plan_features:*" categories. Writes still admin-only.
-- ============================================================
DROP POLICY IF EXISTS "Authenticated can read public app_config" ON app_config;
CREATE POLICY "Authenticated can read public app_config" ON app_config
  FOR SELECT
  USING (
    category = 'founders_plan'
    OR category LIKE 'plan_features:%'
  );

-- ============================================================
-- matching_rules: allow authenticated users to READ
-- Steve 4/28: profileTenant() runs with the tenant's auth context
-- and reads matching_rules to apply the configured weights. Without
-- a public-read policy, the tenant gets an empty result and the
-- engine silently falls back to hardcoded defaults — meaning admin
-- edits in /admin/matching never take effect for real submissions.
-- Guarded so v10 can run even if v9 (which creates matching_rules)
-- has not been applied yet.
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'matching_rules'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated can read matching_rules" ON matching_rules';
    EXECUTE 'CREATE POLICY "Authenticated can read matching_rules" ON matching_rules
             FOR SELECT USING (auth.uid() IS NOT NULL)';
  ELSE
    RAISE NOTICE 'Skipped matching_rules policy — table not present (run migration v9 first).';
  END IF;
END $$;

-- ============================================================
-- Seed site_content with the public homepage testimonials & FAQ
-- so the admin's "Content" page matches what the user sees.
-- Steve 4/28 round 2: admin saw 4 FAQ items but the homepage had 7
-- different ones, and changing testimonial_1_author had no effect.
-- This seeds the rows once; further admin edits override these.
-- ============================================================
INSERT INTO site_content (section, key, value) VALUES
  ('testimonials', 'testimonial_1_author', 'Sarah Mitchell'),
  ('testimonials', 'testimonial_1_role',   'Property Owner'),
  ('testimonials', 'testimonial_1_text',   'Thanks to WebMarketing, I rented my apartment in record time. The professional photos and digital strategy made all the difference.'),
  ('testimonials', 'testimonial_1_img',    'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=100&h=100&fit=crop&crop=face'),
  ('testimonials', 'testimonial_2_author', 'Caroline Tremblay'),
  ('testimonials', 'testimonial_2_role',   'Business Owner'),
  ('testimonials', 'testimonial_2_text',   'The Sales Leak Calculator was eye-opening. Now I have a clear digital strategy and my sales have increased significantly.'),
  ('testimonials', 'testimonial_2_img',    'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop&crop=face'),
  ('testimonials', 'testimonial_3_author', 'Anna Chen'),
  ('testimonials', 'testimonial_3_role',   'Tenant'),
  ('testimonials', 'testimonial_3_text',   'I found my ideal home in less than a week. The preference profile connected me with exactly what I was looking for.'),
  ('testimonials', 'testimonial_3_img',    'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop&crop=face'),
  ('faq', 'faq_1_question', 'Do I have to pay to register?'),
  ('faq', 'faq_1_answer',   'Initial registration is free. Some premium or specialized services have a cost, which is always disclosed before any payment.'),
  ('faq', 'faq_2_question', 'How is the communication — will I talk to a bot or a junior executive?'),
  ('faq', 'faq_2_answer',   'Closeness is our core value. You''ll have a direct channel with the person responsible for your strategy. We believe in total transparency: you''ll know what we''re working on each week through clear reports.'),
  ('faq', 'faq_3_question', 'What is the differential value of this platform?'),
  ('faq', 'faq_3_answer',   'For property owners, as our motto says "your property, your money": you pay us only once, and once tenants move in, the tenant pays you directly — no intermediaries, no rent increases to cover third-party costs and profits.'),
  ('faq', 'faq_4_question', 'How do you balance marketing for B2B and B2C audiences?'),
  ('faq', 'faq_4_answer',   'We understand that even if channels change, we are always dealing with people. That''s why all our marketing is personalized and handled by an advisor — we prioritize emotional connection and passion for the product.'),
  ('faq', 'faq_5_question', 'What happens if my needs change mid-project?'),
  ('faq', 'faq_5_answer',   'Flexibility is one of our greatest strengths. As an agile and human organization, we can pivot and adjust strategies without the bureaucratic delays of traditional agencies.'),
  ('faq', 'faq_6_question', 'How do you ensure marketing attracts the ideal tenant and not just curious visitors?'),
  ('faq', 'faq_6_answer',   'Our approach isn''t limited to "filling the space" — it''s about protecting your investment. We use a segmented marketing strategy that combines profiling formats with specific qualification filters and tenant credit screening services.'),
  ('faq', 'faq_7_question', 'How do I know my information is secure?'),
  ('faq', 'faq_7_answer',   'We use secure connections and strong data-protection practices. Your information is used only to manage your request and deliver the service.')
ON CONFLICT (section, key) DO NOTHING;

-- ============================================================
-- Seed forms_dynamic + form_questions with the three live forms
-- (Tenant preferences, Owner property registration, Pymes diagnosis)
-- so admin can edit/reorder/toggle the actual production questions
-- from /admin/forms instead of an empty page.
-- Steve 4/28 round 2: "Editar preguntas existentes" was Pendiente
-- because the table was empty.
-- Guarded so v10 still completes when v9 has not been applied.
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'forms_dynamic'
  ) THEN
    RAISE NOTICE 'Skipped form seed — forms_dynamic missing (run migration v9 first).';
    RETURN;
  END IF;

INSERT INTO forms_dynamic (slug, name, description, target_role, is_active) VALUES
  ('tenant_preferences', 'Tenant Preferences',
   'Profiling questionnaire filled out by tenants to enable property matching and premium classification.',
   'inquilino', true),
  ('owner_property',     'Owner Property Registration',
   'Form a property owner fills to list a property on the platform.',
   'propietario', true),
  ('pymes_diagnosis',    'PYMES Sales-Leak Diagnosis',
   'Multi-step questionnaire for SMB clients to determine recommended Rescue / Growth / Scale plan.',
   'pymes', true)
ON CONFLICT (slug) DO NOTHING;

-- Tenant preference questions — full set matching production form
INSERT INTO form_questions (form_id, position, field_key, label, question_type, options, required, is_active, helper_text)
SELECT f.id, q.position, q.field_key, q.label, q.question_type, q.options::jsonb, q.required, true, q.helper_text
FROM forms_dynamic f
CROSS JOIN (VALUES
  (0,  'employment_type',         'What is your current situation?',          'select', NULL, true,  'Stable employment is one of the premium tenant criteria.'),
  (1,  'institution_type',        'Type of institution',                       'select', NULL, false, 'Only shown for international students.'),
  (2,  'institution_name',        'Name of institution (optional)',            'text',   NULL, false, NULL),
  (3,  'employment_verifiable',   'Can you provide employment verification?',  'yesno',  NULL, true,  'Pay stubs, employment letter, or equivalent.'),
  (4,  'number_of_people',        'How many people are you looking for housing?', 'select', NULL, true, NULL),
  (5,  'property_type_desired',   'Type of property desired',                  'multiselect', NULL, true, 'Select all that apply.'),
  (6,  'preferred_zones',         'Preferred zone (British Columbia)',         'multiselect', NULL, true, NULL),
  (7,  'bedrooms_needed',         'Bedrooms',                                  'select', NULL, true,  '2–4 bedrooms count toward premium classification.'),
  (8,  'bathrooms_needed',        'Bathrooms',                                 'select', NULL, true,  NULL),
  (9,  'size_sqft',               'Size (optional)',                           'number', NULL, false, NULL),
  (10, 'levels_preferred',        'Levels / Floor',                            'select', NULL, false, NULL),
  (11, 'style_preference',        'Style preference',                          'select', NULL, false, NULL),
  (12, 'pet_friendly',            'Pet-friendly required?',                    'yesno',  NULL, false, NULL),
  (13, 'smart_home_interest',     'Smart home features',                       'yesno',  NULL, false, NULL),
  (14, 'furnished',               'Furnished property required?',              'yesno',  NULL, false, NULL),
  (15, 'utilities_included',      'Utilities included required?',              'yesno',  NULL, false, NULL),
  (16, 'min_budget',              'Monthly budget min (CAD)',                  'number', NULL, true,  NULL),
  (17, 'max_budget',              'Monthly budget max (CAD)',                  'number', NULL, true,  'Premium criteria triggers at $2,500+'),
  (18, 'move_in_date',            'When are you planning to move?',            'date',   NULL, true,  NULL),
  (19, 'move_in_flexible',        'Move-in date is flexible',                  'yesno',  NULL, false, NULL),
  (20, 'contract_duration',       'Lease contract duration',                   'select', NULL, true,  '12+ month contracts contribute to premium classification.'),
  (21, 'preferred_amenities',     'Preferred amenities',                       'multiselect', NULL, false, NULL),
  (22, 'common_areas',            'Building common areas',                     'multiselect', NULL, false, NULL),
  (23, 'parking_needed',          'Parking needed',                            'yesno',  NULL, false, NULL),
  (24, 'near_bus',                'Near bus stop',                             'yesno',  NULL, false, NULL),
  (25, 'near_skytrain',           'Near SkyTrain',                             'yesno',  NULL, false, NULL),
  (26, 'near_downtown',           'Near downtown',                             'yesno',  NULL, false, NULL),
  (27, 'near_social',             'Near social venues',                        'yesno',  NULL, false, NULL),
  (28, 'near_banks',              'Near banks',                                'yesno',  NULL, false, NULL),
  (29, 'prefers_urban_zone',      'Prefers urban zone',                        'yesno',  NULL, false, NULL),
  (30, 'additional_requirements', 'Additional requirements (optional)',         'textarea', NULL, false, NULL),
  (31, 'consent_data_processing', 'Consent: data processing',                  'checkbox', NULL, true, 'Required by PIPA/PIPEDA.'),
  (32, 'consent_screening',       'Consent: background screening',             'checkbox', NULL, false, NULL),
  (33, 'consent_references',      'Consent: reference verification',           'checkbox', NULL, false, NULL),
  (34, 'consent_communications',  'Consent: electronic communications (CASL)', 'checkbox', NULL, false, NULL),
  (35, 'consent_truthfulness',    'Declaration of truthfulness',               'checkbox', NULL, false, NULL),
  (36, 'consent_marketing',       'Consent: marketing communications (optional)', 'checkbox', NULL, false, NULL)
) AS q(position, field_key, label, question_type, options, required, helper_text)
WHERE f.slug = 'tenant_preferences'
ON CONFLICT (form_id, field_key) DO NOTHING;

-- Owner property registration questions — full set matching production form
INSERT INTO form_questions (form_id, position, field_key, label, question_type, options, required, is_active, helper_text)
SELECT f.id, q.position, q.field_key, q.label, q.question_type, q.options::jsonb, q.required, true, q.helper_text
FROM forms_dynamic f
CROSS JOIN (VALUES
  (0,  'user_type',          'Are you a property owner or an investor?',        'select', NULL, true,  NULL),
  (1,  'property_count',     'Number of properties',                            'number', NULL, true,  NULL),
  (2,  'objectives',         'What are your objectives?',                       'multiselect', NULL, true, 'Select all that apply.'),
  (3,  'property_type',      'Property type',                                   'select', NULL, true,  NULL),
  (4,  'occupancy_status',   'Current occupancy status',                        'select', NULL, true,  NULL),
  (5,  'vacancy_date',       'When does the property become available?',        'date',   NULL, false, 'Approximate date when the current tenant moves out.'),
  (6,  'availability_date',  'Availability date (for new tenants)',             'date',   NULL, false, NULL),
  (7,  'bedrooms',           'Bedrooms',                                        'select', NULL, true,  NULL),
  (8,  'bathrooms',          'Bathrooms',                                       'select', NULL, true,  NULL),
  (9,  'area_sqft',          'Size',                                            'number', NULL, false, NULL),
  (10, 'style',              'Style',                                           'select', NULL, false, NULL),
  (11, 'levels',             'Levels / Floor',                                  'select', NULL, false, NULL),
  (12, 'furnished',          'Furnished',                                       'yesno',  NULL, false, NULL),
  (13, 'utilities_included', 'Utilities included',                              'yesno',  NULL, false, NULL),
  (14, 'pet_friendly',       'Pet-friendly',                                    'yesno',  NULL, false, NULL),
  (15, 'shared_unit',        'Shared unit',                                     'yesno',  NULL, false, NULL),
  (16, 'smart_home',         'Smart home',                                      'yesno',  NULL, false, NULL),
  (17, 'amenities',          'Amenities',                                       'multiselect', NULL, false, NULL),
  (18, 'common_areas',       'Building common areas',                           'multiselect', NULL, false, NULL),
  (19, 'city',               'City',                                            'select', NULL, true,  NULL),
  (20, 'postal_code',        'Postal code',                                     'text',   NULL, false, NULL),
  (21, 'address',            'Address',                                         'text',   NULL, true,  NULL),
  (22, 'near_parks',         'Parks nearby',                                    'yesno',  NULL, false, NULL),
  (23, 'near_churches',      'Churches nearby',                                 'yesno',  NULL, false, NULL),
  (24, 'near_bus',           'Bus stop nearby',                                 'yesno',  NULL, false, NULL),
  (25, 'near_skytrain',      'SkyTrain nearby',                                 'yesno',  NULL, false, NULL),
  (26, 'near_mall',          'Shopping mall nearby',                            'yesno',  NULL, false, NULL),
  (27, 'listing_platforms',  'Listing platforms',                               'multiselect', NULL, false, NULL),
  (28, 'consent_image_usage','Consent: image usage',                            'checkbox', NULL, true, NULL),
  (29, 'consent_data_processing','Consent: data processing',                    'checkbox', NULL, true, NULL),
  (30, 'consent_third_party','Consent: third-party verification',               'checkbox', NULL, true, NULL),
  (31, 'consent_marketing',  'Consent: marketing communications',               'checkbox', NULL, false, NULL)
) AS q(position, field_key, label, question_type, options, required, helper_text)
WHERE f.slug = 'owner_property'
ON CONFLICT (form_id, field_key) DO NOTHING;

-- Pymes diagnosis questions — matches actual production form
INSERT INTO form_questions (form_id, position, field_key, label, question_type, options, required, is_active, helper_text)
SELECT f.id, q.position, q.field_key, q.label, q.question_type, q.options::jsonb, q.required, true, q.helper_text
FROM forms_dynamic f
CROSS JOIN (VALUES
  (0, 'business_name',     'Company name',                                'text',   NULL, true,  NULL),
  (1, 'contact_position',  'Your position / Job title',                   'text',   NULL, false, NULL),
  (2, 'industry',          'Industry sector',                             'select', NULL, true,  NULL),
  (3, 'monthly_revenue',   'Monthly revenue (CAD)',                       'number', NULL, true,  'This is used to calculate your estimated annual loss.'),
  (4, 'main_pain_point',   'Biggest pain point right now',                'select',
   '[{"value":"low_leads","label":"Not enough leads"},{"value":"low_conversion","label":"Leads do not convert"},{"value":"churn","label":"High customer churn"},{"value":"brand","label":"Weak brand presence"},{"value":"team","label":"Team / operational chaos"}]',
   false, NULL),
  (5, 'has_marketing_team','Do you have an internal marketing team?',     'yesno',  NULL, false, NULL),
  (6, 'urgency_level',     'How urgent is solving this?',                 'select',
   '[{"value":"critical","label":"Critical — bleeding revenue"},{"value":"high","label":"High — losing ground"},{"value":"medium","label":"Medium — want to grow faster"},{"value":"low","label":"Low — exploring options"}]',
   false, 'Drives the recommended Rescue / Growth / Scale plan.'),
  (7, 'preferred_contact', 'Preferred contact channel',                   'select',
   '[{"value":"email","label":"Email"},{"value":"phone","label":"Phone"},{"value":"whatsapp","label":"WhatsApp"}]',
   false, NULL)
) AS q(position, field_key, label, question_type, options, required, helper_text)
WHERE f.slug = 'pymes_diagnosis'
ON CONFLICT (form_id, field_key) DO NOTHING;

END $$;
