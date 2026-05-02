-- ============================================================
-- Migration v12 — Steve 4/30 follow-up fixes
-- ============================================================
-- The 4/29 PDF flagged 13 items Pendiente. After v11 some were
-- resolved (image library, plan checklist sync, Tiempo objetivo,
-- branding name change) but several seeds didn't take effect on the
-- live DB:
--   * legal_documents kept their placeholder content (v11's
--     ON CONFLICT DO NOTHING preserved the empty rows seeded by v7)
--   * lead_sales_calculator / business_acquisition forms didn't
--     appear (v11's DO $$ block likely silently RETURNed)
--   * pymes_diagnosis form had the wrong (non-Likert) questions —
--     they don't match the 7-question Sales Leak calculator at
--     /forms/pymes that the website actually shows
--   * Plan-level services rows (Founder Package, Essentials, …)
--     didn't appear in the Reassign dropdown
--   * Founders counter still rendered 0 to propietario despite admin
--     saving 7 — suggests the public-read RLS policy isn't applied
-- v12 re-applies everything WITHOUT DO blocks, with FORCE-UPDATE for
-- placeholder content.
-- ============================================================

-- ------------------------------------------------------------
-- 1. app_config public-read policy — re-applied with a clearer
--    intent and a defensive fallback that allows any authenticated
--    user to read the public categories. Drops every variant first.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can read public app_config" ON app_config;
DROP POLICY IF EXISTS "Public read app_config" ON app_config;

CREATE POLICY "Public read app_config" ON app_config
  FOR SELECT
  TO authenticated, anon
  USING (
    category = 'founders_plan'
    OR category LIKE 'plan_features:%'
    OR category LIKE 'plan_timing:%'
  );

-- ------------------------------------------------------------
-- 2. consent_logs admin policy — re-applied so /admin/legal can
--    show user consents. Combined with v2's "Users can view own"
--    policy via OR (Postgres RLS combines policies with OR).
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 3. legal_documents — FORCE-UPDATE empty/placeholder content.
--    v11 used ON CONFLICT DO NOTHING which preserved the empty
--    "Privacy policy content goes here ..." rows seeded by v7.
--    Here we UPDATE every row whose content looks like a placeholder
--    (very short, or contains "goes here", or is whitespace only).
-- ------------------------------------------------------------
UPDATE legal_documents
SET content = E'PRIVACY POLICY\n\nWe respect your privacy and are committed to protecting it through compliance with this policy.\n\n1. INFORMATION WE COLLECT\nWe collect information you provide directly (name, email, phone) and information about how you use our services.\n\n2. HOW WE USE INFORMATION\nWe use your information to provide our services, communicate with you, and improve the platform.\n\n3. SHARING\nWe do not sell your personal data. We share information only with service providers acting on our behalf, or as required by law.\n\n4. SECURITY\nWe protect your data with secure connections and access controls aligned with PIPEDA / British Columbia PIPA.\n\n5. YOUR RIGHTS\nYou can request access, correction, or deletion of your data at any time by contacting privacy@nexuma.ca.\n\nLast updated: 2026-04-30',
    updated_at = NOW()
WHERE type = 'privacy_policy'
  AND (content IS NULL OR length(trim(content)) < 200 OR content ILIKE '%goes here%');

UPDATE legal_documents
SET content = E'TERMS OF SERVICE\n\nBy accessing or using this platform, you agree to be bound by these terms.\n\n1. ELIGIBILITY\nYou must be at least the age of majority in your province and able to enter into a binding contract.\n\n2. ACCOUNTS\nYou are responsible for safeguarding your account credentials.\n\n3. SERVICES\nWe provide marketing services for property owners, tenant matching, and SMB diagnosis. Service-specific pricing and terms are disclosed at the point of purchase.\n\n4. PAYMENTS\nFees are due according to the plan you select. Refunds are governed by our refund policy.\n\n5. PROHIBITED CONDUCT\nNo unlawful, deceptive, or abusive use of the platform.\n\n6. LIMITATION OF LIABILITY\nTo the extent permitted by law, our liability is limited to the fees you paid in the prior 12 months.\n\n7. GOVERNING LAW\nThese terms are governed by the laws of British Columbia, Canada.\n\nLast updated: 2026-04-30',
    updated_at = NOW()
WHERE type = 'terms_of_service'
  AND (content IS NULL OR length(trim(content)) < 200 OR content ILIKE '%goes here%');

-- Cookie policy may not exist yet — UPSERT
INSERT INTO legal_documents (type, content, version) VALUES
  ('cookie_policy',
   E'COOKIE POLICY\n\nWe use cookies and similar technologies to keep you signed in, remember your preferences, and analyze usage.\n\n1. STRICTLY NECESSARY COOKIES\nRequired for authentication and security.\n\n2. ANALYTICS COOKIES\nHelp us understand how visitors interact with the site so we can improve it.\n\n3. MARKETING COOKIES\nUsed only with your consent to deliver relevant offers.\n\n4. CONTROL\nYou can manage cookie preferences in your browser settings or in your account profile.\n\nLast updated: 2026-04-30',
   '1.0')
ON CONFLICT (type) DO UPDATE SET
  content = CASE
    WHEN legal_documents.content IS NULL OR length(trim(legal_documents.content)) < 200 OR legal_documents.content ILIKE '%goes here%'
    THEN EXCLUDED.content
    ELSE legal_documents.content
  END,
  updated_at = NOW();

-- ------------------------------------------------------------
-- 4. app_config founders_plan + plan_features + plan_timing — re-seed
--    with EXACT user-facing text so admin starts from live copy.
--    Uses ON CONFLICT DO NOTHING (admin edits stay).
-- ------------------------------------------------------------
INSERT INTO app_config (category, key, value) VALUES
  ('founders_plan', 'taken', '0'),
  ('founders_plan', 'limit', '20'),
  ('plan_features:owner_basic', 'tagline',
   'Marketing that maximizes your profitability — your property, your money'),
  ('plan_features:owner_basic', 'features',
   E'Marketing campaign per property until tenant found (~16 days avg.)\nClient-uploaded photos with validation\nVisual recommendations prior to listing\nUnit verification (on-site visit)\nTenant credit screening\nRTB-1 (BC) contract drafting & signing'),
  ('plan_features:owner_preferred', 'tagline',
   E'Enhanced services for growing property portfolios (2–3 properties)'),
  ('plan_features:owner_preferred', 'features',
   E'Marketing campaign per property until tenant found (~15 days avg.)\nClient-uploaded photos\nWeekly interested-parties report\nPriority credit analysis of best applicants\nFull credit screening of tenants\nUnit handover with inventory checklist\nRTB-1 (BC) contract drafting & signing'),
  ('plan_features:owner_elite', 'tagline',
   'Full-service management for investment portfolios (4+ properties)'),
  ('plan_features:owner_elite', 'features',
   E'Targeted marketing campaign per property (~15 days avg.)\nProfessional 3D photography & virtual tour\nInterior design recommendations\n360° tenant verification (credit + behavioral references)\nPriority search positioning\nOn-site unit verification & showing\nHandover with detailed checklist\nRTB-1 (BC) contract drafting & signing\nFree rent price optimization\nFree event packages (concerts, sports, seasonal)\nKPI performance report per property\nLocal vendor alliances for repairs & maintenance\nPremium portal listing + targeted campaigns\nExpansion & wealth growth analysis\nPremium tenant welcome program\nSatisfaction surveys to reduce turnover'),
  ('plan_timing:owner_basic', 'time_to_tenant', '~16 days avg.'),
  ('plan_timing:owner_preferred', 'time_to_tenant', '~15 days avg.'),
  ('plan_timing:owner_elite', 'time_to_tenant', '~15 days avg.')
ON CONFLICT (category, key) DO NOTHING;

-- ------------------------------------------------------------
-- 5. site_content branding — adds cover/logo image keys so admin
--    can replace them from the Content Manager.
-- ------------------------------------------------------------
INSERT INTO site_content (section, key, value) VALUES
  ('branding', 'site_brand_name', 'WebMarketing'),
  ('branding', 'site_short_name', 'WebMarketing'),
  ('branding', 'site_tagline', 'Residential & Business Marketing'),
  ('branding', 'site_logo_url', ''),
  ('branding', 'site_cover_image_url',
   'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80'),
  ('branding', 'site_favicon_url', '')
ON CONFLICT (section, key) DO NOTHING;

-- ------------------------------------------------------------
-- 6. Forms — REPLACE pymes_diagnosis questions with the 7 Likert
--    questions used on the actual /forms/pymes page so admin edits
--    stay in sync with what tenants see.
--    Seed lead_sales_calculator and business_acquisition WITHOUT a
--    DO block this time so any error is visible at apply-time.
-- ------------------------------------------------------------

-- 6a. Update display name + description of the existing
--     pymes_diagnosis row (the slug stays the same so referencing
--     code keeps working).
UPDATE forms_dynamic
SET name = 'PYMES Sales-Leak Calculator',
    description = '7-question Likert calculator (1–5) plus revenue/sector that classifies an SMB into Rescue / Growth / Scale plans. Mirrors the form at /forms/pymes.',
    target_role = 'pymes',
    updated_at = NOW()
WHERE slug = 'pymes_diagnosis';

-- 6b. Wipe the misaligned questions seeded by v10 and rebuild with
--     the actual Likert + supporting fields used on the site.
DELETE FROM form_questions
WHERE form_id IN (SELECT id FROM forms_dynamic WHERE slug = 'pymes_diagnosis');

INSERT INTO form_questions (form_id, position, field_key, label, question_type, options, required, is_active, helper_text)
SELECT f.id, q.position, q.field_key, q.label, q.question_type, q.options::jsonb, q.required, true, q.helper_text
FROM forms_dynamic f
CROSS JOIN (VALUES
  (0,  'business_name',     'Company name',
   'text',   NULL, true,  NULL),
  (1,  'sector',             'Industry sector',
   'select',
   '[{"value":"retail","label":"Retail / Commerce"},{"value":"services","label":"Services"},{"value":"technology","label":"Technology"},{"value":"food_beverage","label":"Food & Beverage"},{"value":"health","label":"Health & Wellness"},{"value":"education","label":"Education"},{"value":"construction","label":"Construction"},{"value":"other","label":"Other"}]',
   true,  NULL),
  (2,  'monthly_revenue',    'Average monthly revenue (CAD)',
   'number', NULL, true,
   'Used to estimate the annual sales-leak loss (~30%/yr × 12 months).'),
  (3,  'q1_online_presence', 'Is your flow of new clients constant and predictable month to month?',
   'select',
   '[{"value":"1","label":"1 - No / Very poor"},{"value":"2","label":"2 - Weak"},{"value":"3","label":"3 - Average"},{"value":"4","label":"4 - Good"},{"value":"5","label":"5 - Excellent / Yes"}]',
   true, '1 = No, very irregular / 5 = Yes, constant and predictable. Block: SALES.'),
  (4,  'q2_seo_positioning', 'Do you have an automated system to follow up with prospects?',
   'select',
   '[{"value":"1","label":"1 - No / Very poor"},{"value":"2","label":"2 - Weak"},{"value":"3","label":"3 - Average"},{"value":"4","label":"4 - Good"},{"value":"5","label":"5 - Excellent / Yes"}]',
   true, '1 = No system at all / 5 = Yes, fully automated follow-up. Block: SALES.'),
  (5,  'q3_lead_generation', 'Is your value proposition so clear that a child would understand it in 10 seconds?',
   'select',
   '[{"value":"1","label":"1 - No / Very poor"},{"value":"2","label":"2 - Weak"},{"value":"3","label":"3 - Average"},{"value":"4","label":"4 - Good"},{"value":"5","label":"5 - Excellent / Yes"}]',
   true, '1 = Not clear at all / 5 = Absolutely clear and compelling. Block: BRAND.'),
  (6,  'q4_lead_conversion', 'Does your visual identity look more professional than your direct competition?',
   'select',
   '[{"value":"1","label":"1 - No / Very poor"},{"value":"2","label":"2 - Weak"},{"value":"3","label":"3 - Average"},{"value":"4","label":"4 - Good"},{"value":"5","label":"5 - Excellent / Yes"}]',
   true, '1 = No, it looks amateur / 5 = Yes, clearly more professional. Block: BRAND.'),
  (7,  'q5_client_retention', 'Can your business operate for a week without you intervening operationally?',
   'select',
   '[{"value":"1","label":"1 - No / Very poor"},{"value":"2","label":"2 - Weak"},{"value":"3","label":"3 - Average"},{"value":"4","label":"4 - Good"},{"value":"5","label":"5 - Excellent / Yes"}]',
   true, '1 = No, it depends on me entirely / 5 = Yes, it runs on its own. Block: SYSTEMS.'),
  (8,  'q6_repeat_purchases', 'Do you measure the exact cost of acquiring each new client?',
   'select',
   '[{"value":"1","label":"1 - No / Very poor"},{"value":"2","label":"2 - Weak"},{"value":"3","label":"3 - Average"},{"value":"4","label":"4 - Good"},{"value":"5","label":"5 - Excellent / Yes"}]',
   true, '1 = No idea what it costs / 5 = Yes, I know the exact CAC. Block: SYSTEMS.'),
  (9,  'q7_marketing_strategy', 'Cost of inaction: How serious would it be to continue the same way for 12 months?',
   'select',
   '[{"value":"1","label":"1 - No / Very poor"},{"value":"2","label":"2 - Weak"},{"value":"3","label":"3 - Average"},{"value":"4","label":"4 - Good"},{"value":"5","label":"5 - Excellent / Yes"}]',
   true, '1 = Not critical at all / 5 = Extremely critical, could threaten the business. Block: FUTURE.')
) AS q(position, field_key, label, question_type, options, required, helper_text)
WHERE f.slug = 'pymes_diagnosis';

-- 6c. lead_sales_calculator (alias / public name kept distinct from
--     the diagnosis form so admin can offer separate flows). If v11
--     never inserted it, do it now.
INSERT INTO forms_dynamic (slug, name, description, target_role, is_active) VALUES
  ('lead_sales_calculator',
   'Sales Leak Calculator (homepage)',
   'Public Sales Leak calculator embedded on the homepage. Edits here drive the questions visitors see when they click "Calculate your sales leak".',
   'pymes', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO form_questions (form_id, position, field_key, label, question_type, options, required, is_active, helper_text)
SELECT f.id, q.position, q.field_key, q.label, q.question_type, q.options::jsonb, q.required, true, q.helper_text
FROM forms_dynamic f
CROSS JOIN (VALUES
  (0,  'business_name',     'Company name',                                   'text',   NULL, true,  NULL),
  (1,  'sector',             'Industry sector',
   'select',
   '[{"value":"retail","label":"Retail / Commerce"},{"value":"services","label":"Services"},{"value":"technology","label":"Technology"},{"value":"food_beverage","label":"Food & Beverage"},{"value":"health","label":"Health & Wellness"},{"value":"education","label":"Education"},{"value":"construction","label":"Construction"},{"value":"other","label":"Other"}]',
   true,  NULL),
  (2,  'monthly_revenue',    'Monthly revenue (CAD)',                          'number', NULL, true, NULL),
  (3,  'q1',                 'Is your flow of new clients constant and predictable month to month?',
   'select',
   '[{"value":"1","label":"1 - No / Very poor"},{"value":"2","label":"2 - Weak"},{"value":"3","label":"3 - Average"},{"value":"4","label":"4 - Good"},{"value":"5","label":"5 - Excellent / Yes"}]',
   true, NULL),
  (4,  'q2',                 'Do you have an automated system to follow up with prospects?',
   'select',
   '[{"value":"1","label":"1 - No / Very poor"},{"value":"2","label":"2 - Weak"},{"value":"3","label":"3 - Average"},{"value":"4","label":"4 - Good"},{"value":"5","label":"5 - Excellent / Yes"}]',
   true, NULL),
  (5,  'q3',                 'Is your value proposition clear in 10 seconds?',
   'select',
   '[{"value":"1","label":"1 - No / Very poor"},{"value":"2","label":"2 - Weak"},{"value":"3","label":"3 - Average"},{"value":"4","label":"4 - Good"},{"value":"5","label":"5 - Excellent / Yes"}]',
   true, NULL),
  (6,  'q4',                 'Does your visual identity look more professional than competition?',
   'select',
   '[{"value":"1","label":"1 - No / Very poor"},{"value":"2","label":"2 - Weak"},{"value":"3","label":"3 - Average"},{"value":"4","label":"4 - Good"},{"value":"5","label":"5 - Excellent / Yes"}]',
   true, NULL),
  (7,  'q5',                 'Can your business operate a week without you?',
   'select',
   '[{"value":"1","label":"1 - No / Very poor"},{"value":"2","label":"2 - Weak"},{"value":"3","label":"3 - Average"},{"value":"4","label":"4 - Good"},{"value":"5","label":"5 - Excellent / Yes"}]',
   true, NULL),
  (8,  'q6',                 'Do you measure the cost of acquiring each new client?',
   'select',
   '[{"value":"1","label":"1 - No / Very poor"},{"value":"2","label":"2 - Weak"},{"value":"3","label":"3 - Average"},{"value":"4","label":"4 - Good"},{"value":"5","label":"5 - Excellent / Yes"}]',
   true, NULL),
  (9,  'q7',                 'Cost of inaction: how serious would it be to continue 12 months?',
   'select',
   '[{"value":"1","label":"1 - No / Very poor"},{"value":"2","label":"2 - Weak"},{"value":"3","label":"3 - Average"},{"value":"4","label":"4 - Good"},{"value":"5","label":"5 - Excellent / Yes"}]',
   true, NULL)
) AS q(position, field_key, label, question_type, options, required, helper_text)
WHERE f.slug = 'lead_sales_calculator'
ON CONFLICT (form_id, field_key) DO NOTHING;

-- 6d. business_acquisition — Empresas / B2B lead acquisition form.
INSERT INTO forms_dynamic (slug, name, description, target_role, is_active) VALUES
  ('business_acquisition',
   'Client Acquisition (Empresas)',
   'Lead-acquisition form for the Empresas / B2B funnel. Captures qualified business leads who do not need the full sales-leak diagnosis.',
   'pymes', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO form_questions (form_id, position, field_key, label, question_type, options, required, is_active, helper_text)
SELECT f.id, q.position, q.field_key, q.label, q.question_type, q.options::jsonb, q.required, true, q.helper_text
FROM forms_dynamic f
CROSS JOIN (VALUES
  (0, 'business_name',     'Company name',                              'text',   NULL, true,  NULL),
  (1, 'website',           'Website',                                    'text',   NULL, false, NULL),
  (2, 'company_size',      'Company size',                               'select',
   '[{"value":"1_5","label":"1–5 employees"},{"value":"6_20","label":"6–20 employees"},{"value":"21_50","label":"21–50 employees"},{"value":"51_plus","label":"51+ employees"}]',
   true, NULL),
  (3, 'industry',          'Industry sector',
   'select',
   '[{"value":"retail","label":"Retail / Commerce"},{"value":"services","label":"Services"},{"value":"technology","label":"Technology"},{"value":"food_beverage","label":"Food & Beverage"},{"value":"health","label":"Health & Wellness"},{"value":"education","label":"Education"},{"value":"construction","label":"Construction"},{"value":"other","label":"Other"}]',
   true, NULL),
  (4, 'annual_revenue',    'Annual revenue (CAD)',                       'number', NULL, false, NULL),
  (5, 'goal',              'Primary acquisition goal',
   'select',
   '[{"value":"more_leads","label":"More qualified leads"},{"value":"better_conversion","label":"Better conversion"},{"value":"brand_growth","label":"Brand growth"},{"value":"new_market","label":"Enter a new market"}]',
   true, NULL),
  (6, 'budget_range',      'Marketing budget range (CAD/mo)',
   'select',
   '[{"value":"under_1k","label":"Under $1,000"},{"value":"1k_3k","label":"$1,000–$3,000"},{"value":"3k_10k","label":"$3,000–$10,000"},{"value":"10k_plus","label":"$10,000+"}]',
   false, NULL),
  (7, 'timeline',          'Decision timeline',
   'select',
   '[{"value":"immediate","label":"Immediate"},{"value":"30_days","label":"Within 30 days"},{"value":"90_days","label":"Within 90 days"},{"value":"exploring","label":"Just exploring"}]',
   false, NULL),
  (8, 'consent_marketing', 'Consent: marketing communications',          'checkbox', NULL, false, NULL)
) AS q(position, field_key, label, question_type, options, required, helper_text)
WHERE f.slug = 'business_acquisition'
ON CONFLICT (form_id, field_key) DO NOTHING;

-- ------------------------------------------------------------
-- 7. Plan-level service rows for the Reassign dropdown.
--    Re-applied to ensure they exist regardless of v11 status.
-- ------------------------------------------------------------
INSERT INTO services (name, description, category, price, currency, is_active, target_roles, status)
SELECT * FROM (VALUES
  ('Plan: Founder Package — Visionary Owners',
   'Owner Basic plan with the founders rate (30% lifetime). Limited to the first 20 owners.',
   'plan', 0::numeric, 'CAD', true,
   ARRAY['propietario','propietario_preferido']::text[], 'active'),
  ('Plan: Owner Preferred — Support Tier',
   'Owner plan tier for portfolios of 2–3 properties.',
   'plan', 0::numeric, 'CAD', true,
   ARRAY['propietario','propietario_preferido']::text[], 'active'),
  ('Plan: Owner Preferred — Premier Tier',
   'Owner plan tier for portfolios of 2–3 properties (1.5+ year commitment).',
   'plan', 0::numeric, 'CAD', true,
   ARRAY['propietario','propietario_preferido']::text[], 'active'),
  ('Plan: Elite — Essentials',
   'Investor portfolio plan for rents in the $2,500–$3,999 CAD range.',
   'plan', 900::numeric, 'CAD', true,
   ARRAY['inversionista']::text[], 'active'),
  ('Plan: Elite — Signature',
   'Investor portfolio plan for rents in the $4,000–$7,000 CAD range.',
   'plan', 1410::numeric, 'CAD', true,
   ARRAY['inversionista']::text[], 'active'),
  ('Plan: Elite — Lujo',
   'Investor portfolio plan for rents above $7,001 CAD.',
   'plan', 1650::numeric, 'CAD', true,
   ARRAY['inversionista']::text[], 'active'),
  ('Plan: PYMES — Rescue',
   'Intensive intervention plan to exit critical mode.',
   'plan', 1500::numeric, 'CAD', true,
   ARRAY['pymes']::text[], 'active'),
  ('Plan: PYMES — Growth',
   'Plan to overcome stagnation and start growing.',
   'plan', 2500::numeric, 'CAD', true,
   ARRAY['pymes']::text[], 'active'),
  ('Plan: PYMES — Scale',
   'Plan to scale and maximize revenue.',
   'plan', 3800::numeric, 'CAD', true,
   ARRAY['pymes']::text[], 'active')
) AS v(name, description, category, price, currency, is_active, target_roles, status)
WHERE NOT EXISTS (
  SELECT 1 FROM services s WHERE s.name = v.name
);

-- ------------------------------------------------------------
-- 8. Backfill leads.role for older rows. Re-applied here for any
--    rows that came in between v11 and v12.
-- ------------------------------------------------------------
UPDATE leads l
SET role = p.role
FROM profiles p
WHERE l.user_id = p.id
  AND l.role IS NULL
  AND p.role IS NOT NULL;

UPDATE leads
SET role = CASE
  WHEN role IS NOT NULL THEN role
  WHEN source = 'pymes_schedule_rescue' THEN 'pymes'
  WHEN source = 'tenant_apply' THEN 'inquilino'
  WHEN source = 'owner_form'   THEN 'propietario'
  WHEN source = 'pymes_diagnosis' THEN 'pymes'
  WHEN source = 'pymes_captacion' THEN 'pymes'
  ELSE role
END
WHERE role IS NULL;

-- Heuristic backfill from `notes` for contact_form leads. The
-- contact form doesn't take a role today (Steve 4/30: leads from the
-- "Schedule" / contact button save no role), but the subject often
-- mentions tenant / owner / business / property — useful enough to
-- reduce the "no role" count without false positives.
UPDATE leads
SET role = CASE
  WHEN role IS NOT NULL THEN role
  WHEN notes ILIKE '%inquilino%' OR notes ILIKE '%tenant%'
       OR notes ILIKE '%apartment%' OR notes ILIKE '%rent a%'
    THEN 'inquilino'
  WHEN notes ILIKE '%propietario%' OR notes ILIKE '%landlord%'
       OR notes ILIKE '%my property%' OR notes ILIKE '%my unit%'
    THEN 'propietario'
  WHEN notes ILIKE '%empresa%' OR notes ILIKE '%business%'
       OR notes ILIKE '%pyme%' OR notes ILIKE '%my company%'
       OR notes ILIKE '%small business%'
    THEN 'pymes'
  WHEN notes ILIKE '%inversion%' OR notes ILIKE '%investor%'
       OR notes ILIKE '%portfolio%'
    THEN 'inversionista'
  ELSE role
END
WHERE role IS NULL
  AND source = 'contact_form'
  AND notes IS NOT NULL;
