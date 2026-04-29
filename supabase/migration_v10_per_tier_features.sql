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
-- ============================================================
DROP POLICY IF EXISTS "Authenticated can read matching_rules" ON matching_rules;
CREATE POLICY "Authenticated can read matching_rules" ON matching_rules
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

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
-- ============================================================
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

-- Tenant preference questions (mirrors src/lib/profiling.ts criteria)
INSERT INTO form_questions (form_id, position, field_key, label, question_type, options, required, is_active, helper_text)
SELECT f.id, q.position, q.field_key, q.label, q.question_type, q.options::jsonb, q.required, true, q.helper_text
FROM forms_dynamic f
CROSS JOIN (VALUES
  (0, 'employment_type',    'Employment type',                         'select',
   '[{"value":"full_time","label":"Full-time employed"},{"value":"self_employed","label":"Self-employed"},{"value":"part_time","label":"Part-time"},{"value":"student","label":"Student"},{"value":"other","label":"Other"}]',
   true,  'Stable employment is one of the premium tenant criteria.'),
  (1, 'employment_verifiable', 'Can you provide employment verification?', 'yesno', NULL, true,  'Pay stubs, employment letter, or equivalent.'),
  (2, 'max_budget',         'Maximum monthly rent budget (CAD)',       'number',  NULL, true,  'Premium criteria triggers at $2,500+'),
  (3, 'preferred_amenities','Preferred amenities',                     'multiselect',
   '[{"value":"Gym","label":"Gym"},{"value":"Pool","label":"Pool"},{"value":"Rooftop","label":"Rooftop"},{"value":"Coworking","label":"Coworking"},{"value":"Jacuzzi","label":"Jacuzzi"},{"value":"Private parking","label":"Private parking"},{"value":"Sauna","label":"Sauna"}]',
   false, 'Pick all that apply.'),
  (4, 'prefers_urban_zone', 'Do you prefer urban zones (downtown, transit hubs)?', 'yesno', NULL, true, NULL),
  (5, 'bedrooms_needed',    'Bedrooms needed',                         'number',  NULL, true,  '2–4 bedrooms count toward premium classification.'),
  (6, 'smart_home_interest','Interested in smart-home features?',      'yesno',   NULL, false, NULL),
  (7, 'style_preference',   'Preferred design style',                  'select',
   '[{"value":"modern","label":"Modern"},{"value":"elegant","label":"Elegant"},{"value":"classic","label":"Classic"},{"value":"minimalist","label":"Minimalist"},{"value":"any","label":"No preference"}]',
   false, NULL),
  (8, 'furnished',          'Furnished property required?',             'yesno',   NULL, false, NULL),
  (9, 'contract_duration',  'Desired contract duration',                'select',
   '[{"value":"month_to_month","label":"Month to month"},{"value":"6_months","label":"6 months"},{"value":"12_months","label":"12 months"},{"value":"12_24_months","label":"12–24 months"},{"value":"24_months","label":"24 months"}]',
   true,  '12+ month contracts contribute to premium classification.')
) AS q(position, field_key, label, question_type, options, required, helper_text)
WHERE f.slug = 'tenant_preferences'
ON CONFLICT (form_id, field_key) DO NOTHING;

-- Owner property registration questions
INSERT INTO form_questions (form_id, position, field_key, label, question_type, options, required, is_active, helper_text)
SELECT f.id, q.position, q.field_key, q.label, q.question_type, q.options::jsonb, q.required, true, q.helper_text
FROM forms_dynamic f
CROSS JOIN (VALUES
  (0, 'property_type',  'Property type', 'select',
   '[{"value":"house","label":"House"},{"value":"condo","label":"Condo"},{"value":"penthouse","label":"Penthouse"},{"value":"basement","label":"Basement"},{"value":"studio","label":"Studio"}]',
   true,  NULL),
  (1, 'address',        'Street address',                  'text',     NULL, true, NULL),
  (2, 'city',           'City',                            'text',     NULL, true, NULL),
  (3, 'province',       'Province',                        'text',     NULL, true, 'British Columbia, Ontario, etc.'),
  (4, 'monthly_rent',   'Asking monthly rent (CAD)',       'number',   NULL, true, 'Used to compute CFP and Elite tier classification.'),
  (5, 'bedrooms',       'Bedrooms',                        'number',   NULL, true, NULL),
  (6, 'bathrooms',      'Bathrooms',                       'number',   NULL, true, NULL),
  (7, 'is_available',   'Currently available for tenants?', 'yesno',   NULL, true, NULL),
  (8, 'description',    'Description',                     'textarea', NULL, false, 'Highlights for the listing.')
) AS q(position, field_key, label, question_type, options, required, helper_text)
WHERE f.slug = 'owner_property'
ON CONFLICT (form_id, field_key) DO NOTHING;

-- Pymes diagnosis questions (subset — full scoring logic stays in code)
INSERT INTO form_questions (form_id, position, field_key, label, question_type, options, required, is_active, helper_text)
SELECT f.id, q.position, q.field_key, q.label, q.question_type, q.options::jsonb, q.required, true, q.helper_text
FROM forms_dynamic f
CROSS JOIN (VALUES
  (0, 'business_name',     'Business name',                   'text',     NULL, true,  NULL),
  (1, 'industry',          'Industry / sector',               'text',     NULL, true,  NULL),
  (2, 'monthly_revenue',   'Average monthly revenue (CAD)',   'number',   NULL, true,  'Used to estimate the sales leak.'),
  (3, 'years_operating',   'Years operating',                 'number',   NULL, true,  NULL),
  (4, 'main_pain_point',   'Biggest pain point right now',    'select',
   '[{"value":"low_leads","label":"Not enough leads"},{"value":"low_conversion","label":"Leads do not convert"},{"value":"churn","label":"High customer churn"},{"value":"brand","label":"Weak brand presence"},{"value":"team","label":"Team / operational chaos"}]',
   true, NULL),
  (5, 'has_marketing_team','Do you have an internal marketing team?', 'yesno', NULL, true, NULL),
  (6, 'urgency_level',     'How urgent is solving this?',     'select',
   '[{"value":"critical","label":"Critical — bleeding revenue"},{"value":"high","label":"High — losing ground"},{"value":"medium","label":"Medium — want to grow faster"},{"value":"low","label":"Low — exploring options"}]',
   true, 'Drives the recommended Rescue / Growth / Scale plan.'),
  (7, 'preferred_contact', 'Preferred contact channel',       'select',
   '[{"value":"email","label":"Email"},{"value":"phone","label":"Phone"},{"value":"whatsapp","label":"WhatsApp"}]',
   false, NULL)
) AS q(position, field_key, label, question_type, options, required, helper_text)
WHERE f.slug = 'pymes_diagnosis'
ON CONFLICT (form_id, field_key) DO NOTHING;
