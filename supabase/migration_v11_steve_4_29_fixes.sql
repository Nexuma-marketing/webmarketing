-- ============================================================
-- Migration v11 — Steve 4/29 Observations: complete fixes
-- ============================================================
-- Each block is idempotent so this can be re-run safely. v11 also
-- re-applies the v10 policies in case v10 was never executed against
-- the live DB (Steve's 4/29 PDF strongly suggests it was not — the
-- founders counter, plan overrides and pymes form remained Pendiente).
-- ============================================================

-- ------------------------------------------------------------
-- 1. app_config: ensure public read of founders_plan + plan_features
--    + plan_timing categories. Re-applied here (drop-and-create).
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can read public app_config" ON app_config;
CREATE POLICY "Authenticated can read public app_config" ON app_config
  FOR SELECT
  USING (
    category = 'founders_plan'
    OR category LIKE 'plan_features:%'
    OR category LIKE 'plan_timing:%'
  );

-- ------------------------------------------------------------
-- 2. consent_logs: admin must be able to read every user's logs.
--    The existing v2 policy only allowed self-reads, so the Legal
--    page's table was always empty even when logs existed.
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
-- 3. legal_documents: seed the three core docs with starter content
--    so the Edit dialog opens with text instead of an empty field.
--    ON CONFLICT DO NOTHING preserves any text the admin has saved.
-- ------------------------------------------------------------
INSERT INTO legal_documents (type, content, version) VALUES
  ('privacy_policy',
   E'PRIVACY POLICY\n\nWe respect your privacy and are committed to protecting it through compliance with this policy.\n\n1. INFORMATION WE COLLECT\nWe collect information you provide directly (name, email, phone) and information about how you use our services.\n\n2. HOW WE USE INFORMATION\nWe use your information to provide our services, communicate with you, and improve the platform.\n\n3. SHARING\nWe do not sell your personal data. We share information only with service providers acting on our behalf, or as required by law.\n\n4. SECURITY\nWe protect your data with secure connections and access controls aligned with PIPEDA / British Columbia PIPA.\n\n5. YOUR RIGHTS\nYou can request access, correction, or deletion of your data at any time by contacting privacy@nexuma.ca.\n\nLast updated: 2026-04-30',
   '1.0'),
  ('terms_of_service',
   E'TERMS OF SERVICE\n\nBy accessing or using this platform, you agree to be bound by these terms.\n\n1. ELIGIBILITY\nYou must be at least the age of majority in your province and able to enter into a binding contract.\n\n2. ACCOUNTS\nYou are responsible for safeguarding your account credentials.\n\n3. SERVICES\nWe provide marketing services for property owners, tenant matching, and SMB diagnosis. Service-specific pricing and terms are disclosed at the point of purchase.\n\n4. PAYMENTS\nFees are due according to the plan you select. Refunds are governed by our refund policy.\n\n5. PROHIBITED CONDUCT\nNo unlawful, deceptive, or abusive use of the platform.\n\n6. LIMITATION OF LIABILITY\nTo the extent permitted by law, our liability is limited to the fees you paid in the prior 12 months.\n\n7. GOVERNING LAW\nThese terms are governed by the laws of British Columbia, Canada.\n\nLast updated: 2026-04-30',
   '1.0'),
  ('cookie_policy',
   E'COOKIE POLICY\n\nWe use cookies and similar technologies to keep you signed in, remember your preferences, and analyze usage.\n\n1. STRICTLY NECESSARY COOKIES\nRequired for authentication and security.\n\n2. ANALYTICS COOKIES\nHelp us understand how visitors interact with the site so we can improve it.\n\n3. MARKETING COOKIES\nUsed only with your consent to deliver relevant offers.\n\n4. CONTROL\nYou can manage cookie preferences in your browser settings or in your account profile.\n\nLast updated: 2026-04-30',
   '1.0')
ON CONFLICT (type) DO NOTHING;

-- ------------------------------------------------------------
-- 4. app_config plan_features:* — seed with the EXACT text the
--    user sees on /dashboard/services so admin and client are
--    aligned. ON CONFLICT DO NOTHING preserves admin edits.
-- ------------------------------------------------------------
INSERT INTO app_config (category, key, value) VALUES
  -- Owner Basic
  ('plan_features:owner_basic', 'tagline',
   'Marketing that maximizes your profitability — your property, your money'),
  ('plan_features:owner_basic', 'features',
   E'Marketing campaign per property until tenant found (~16 days avg.)\nClient-uploaded photos with validation\nVisual recommendations prior to listing\nUnit verification (on-site visit)\nTenant credit screening\nRTB-1 (BC) contract drafting & signing'),

  -- Owner Preferred
  ('plan_features:owner_preferred', 'tagline',
   E'Enhanced services for growing property portfolios (2–3 properties)'),
  ('plan_features:owner_preferred', 'features',
   E'Marketing campaign per property until tenant found (~15 days avg.)\nClient-uploaded photos\nWeekly interested-parties report\nPriority credit analysis of best applicants\nFull credit screening of tenants\nUnit handover with inventory checklist\nRTB-1 (BC) contract drafting & signing'),

  -- Owner Elite
  ('plan_features:owner_elite', 'tagline',
   'Full-service management for investment portfolios (4+ properties)'),
  ('plan_features:owner_elite', 'features',
   E'Targeted marketing campaign per property (~15 days avg.)\nProfessional 3D photography & virtual tour\nInterior design recommendations\n360° tenant verification (credit + behavioral references)\nPriority search positioning\nOn-site unit verification & showing\nHandover with detailed checklist\nRTB-1 (BC) contract drafting & signing\nFree rent price optimization\nFree event packages (concerts, sports, seasonal)\nKPI performance report per property\nLocal vendor alliances for repairs & maintenance\nPremium portal listing + targeted campaigns\nExpansion & wealth growth analysis\nPremium tenant welcome program\nSatisfaction surveys to reduce turnover'),

  -- PYMES Rescue
  ('plan_features:pymes_rescue', 'tagline',
   'Intensive intervention plan to exit critical mode and move to growth'),
  ('plan_features:pymes_rescue', 'features',
   E'Complete business diagnosis & sales leak analysis\nDigital presence emergency recovery\nBasic optimization (Google Business, Social Media, SEO)\nLead capture structure & funnel setup\nDirect 1-on-1 advisory sessions\nMonthly KPI performance report'),

  -- PYMES Growth
  ('plan_features:pymes_growth', 'tagline',
   'Plan to overcome stagnation, correct weaknesses and start growing'),
  ('plan_features:pymes_growth', 'features',
   E'Complete business diagnosis & sales leak analysis\nMarketing strategy development & execution\nConversion rate optimization\nCampaign structure & ad management\nLead tracking system implementation\nMarket positioning analysis\nBi-weekly KPI performance reports'),

  -- PYMES Scale
  ('plan_features:pymes_scale', 'tagline',
   'Plan to scale and maximize revenue with advanced strategies'),
  ('plan_features:pymes_scale', 'features',
   E'Complete business diagnosis & sales leak analysis\nAdvanced multi-channel optimization\nChannel expansion & new market entry\nGrowth strategy & scaling roadmap\nOpportunity & competitor analysis\nWeekly KPI performance reports')
ON CONFLICT (category, key) DO NOTHING;

-- ------------------------------------------------------------
-- 5. app_config plan_timing:* — admin-editable "tiempo objetivo"
--    per tier. The string lands directly inside the bullet copy on
--    the Services page (e.g., "(~16 days avg.)").
-- ------------------------------------------------------------
INSERT INTO app_config (category, key, value) VALUES
  ('plan_timing:owner_basic', 'time_to_tenant', '~16 days avg.'),
  ('plan_timing:owner_preferred', 'time_to_tenant', '~15 days avg.'),
  ('plan_timing:owner_elite', 'time_to_tenant', '~15 days avg.')
ON CONFLICT (category, key) DO NOTHING;

-- ------------------------------------------------------------
-- 6. app_config founders_plan — re-seed defaults if missing.
-- ------------------------------------------------------------
INSERT INTO app_config (category, key, value) VALUES
  ('founders_plan', 'taken', '0'),
  ('founders_plan', 'limit', '20')
ON CONFLICT (category, key) DO NOTHING;

-- ------------------------------------------------------------
-- 7. site_content branding — admin can rename "WebMarketing" to
--    "Nexuma Marketing" or anything else from /admin/content.
-- ------------------------------------------------------------
INSERT INTO site_content (section, key, value) VALUES
  ('branding', 'site_brand_name', 'WebMarketing'),
  ('branding', 'site_tagline', 'Residential & Business Marketing'),
  ('branding', 'site_short_name', 'WebMarketing')
ON CONFLICT (section, key) DO NOTHING;

-- ------------------------------------------------------------
-- 8. forms_dynamic — seed empresas / lead_sales_calculator and
--    business_acquisition forms so admin can edit their questions
--    without going into code. Guarded to skip when v9 has not run.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'forms_dynamic'
  ) THEN
    RAISE NOTICE 'Skipped empresas form seed — forms_dynamic missing.';
    RETURN;
  END IF;

INSERT INTO forms_dynamic (slug, name, description, target_role, is_active) VALUES
  ('lead_sales_calculator',
   'Sales Leak Calculator (Empresas)',
   'Public Sales Leak calculator that captures business leads from the homepage. Edits here change the questions shown on the calculator widget.',
   'pymes', true),
  ('business_acquisition',
   'Business Acquisition Form (Empresas)',
   'Lead-acquisition form for the Empresas / B2B funnel.',
   'pymes', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO form_questions (form_id, position, field_key, label, question_type, options, required, is_active, helper_text)
SELECT f.id, q.position, q.field_key, q.label, q.question_type, q.options::jsonb, q.required, true, q.helper_text
FROM forms_dynamic f
CROSS JOIN (VALUES
  (0, 'business_name',     'Company name',                                  'text',   NULL, true,  NULL),
  (1, 'industry',          'Industry sector',                                'select', NULL, true,  NULL),
  (2, 'monthly_revenue',   'Monthly revenue (CAD)',                          'number', NULL, true,
   'Used to estimate annual sales loss caused by inefficiencies.'),
  (3, 'lead_volume',       'Approximate monthly lead volume',                'number', NULL, false, NULL),
  (4, 'conversion_rate',   'Estimated conversion rate (%)',                  'number', NULL, false, NULL),
  (5, 'biggest_pain',      'Biggest pain point right now',                   'select',
   '[{"value":"low_leads","label":"Not enough leads"},{"value":"low_conversion","label":"Leads do not convert"},{"value":"churn","label":"High customer churn"},{"value":"brand","label":"Weak brand presence"}]',
   true,  NULL),
  (6, 'preferred_contact', 'Preferred contact channel',                      'select',
   '[{"value":"email","label":"Email"},{"value":"phone","label":"Phone"},{"value":"whatsapp","label":"WhatsApp"}]',
   false, NULL)
) AS q(position, field_key, label, question_type, options, required, helper_text)
WHERE f.slug = 'lead_sales_calculator'
ON CONFLICT (form_id, field_key) DO NOTHING;

INSERT INTO form_questions (form_id, position, field_key, label, question_type, options, required, is_active, helper_text)
SELECT f.id, q.position, q.field_key, q.label, q.question_type, q.options::jsonb, q.required, true, q.helper_text
FROM forms_dynamic f
CROSS JOIN (VALUES
  (0, 'business_name',     'Company name',                                  'text',   NULL, true,  NULL),
  (1, 'website',           'Website',                                        'text',   NULL, false, NULL),
  (2, 'company_size',      'Company size',                                   'select',
   '[{"value":"1_5","label":"1–5 employees"},{"value":"6_20","label":"6–20 employees"},{"value":"21_50","label":"21–50 employees"},{"value":"51_plus","label":"51+ employees"}]',
   true, NULL),
  (3, 'industry',          'Industry sector',                                'select', NULL, true,  NULL),
  (4, 'annual_revenue',    'Annual revenue (CAD)',                           'number', NULL, false, NULL),
  (5, 'goal',              'Primary acquisition goal',                       'select',
   '[{"value":"more_leads","label":"More qualified leads"},{"value":"better_conversion","label":"Better conversion"},{"value":"brand_growth","label":"Brand growth"},{"value":"new_market","label":"Enter a new market"}]',
   true, NULL),
  (6, 'budget_range',      'Marketing budget range (CAD/mo)',                'select',
   '[{"value":"under_1k","label":"Under $1,000"},{"value":"1k_3k","label":"$1,000–$3,000"},{"value":"3k_10k","label":"$3,000–$10,000"},{"value":"10k_plus","label":"$10,000+"}]',
   false, NULL),
  (7, 'timeline',          'Decision timeline',                              'select',
   '[{"value":"immediate","label":"Immediate"},{"value":"30_days","label":"Within 30 days"},{"value":"90_days","label":"Within 90 days"},{"value":"exploring","label":"Just exploring"}]',
   false, NULL),
  (8, 'consent_marketing', 'Consent: marketing communications',              'checkbox', NULL, false, NULL)
) AS q(position, field_key, label, question_type, options, required, helper_text)
WHERE f.slug = 'business_acquisition'
ON CONFLICT (form_id, field_key) DO NOTHING;

END $$;

-- ------------------------------------------------------------
-- 9. leads.role backfill — re-applied for any rows that came in
--    after v10 ran but still missed a role.
-- ------------------------------------------------------------
UPDATE leads l
SET role = p.role
FROM profiles p
WHERE l.user_id = p.id
  AND l.role IS NULL
  AND p.role IS NOT NULL;

-- Steve 4/29: also derive role from source for legacy rows that
-- have no user_id but a recognizable submission type.
UPDATE leads
SET role = CASE
  WHEN role IS NOT NULL THEN role
  WHEN source = 'pymes_schedule_rescue' THEN 'pymes'
  WHEN source = 'tenant_apply' THEN 'inquilino'
  WHEN source = 'owner_form'   THEN 'propietario'
  ELSE role
END
WHERE role IS NULL;

-- ------------------------------------------------------------
-- 10. Plan-level entries in services so admin Reassign dropdown
--     can assign full plans (Founder Package, Essentials, Signature,
--     PYMES Rescue/Growth/Scale) — Steve 4/29 #9.
--     We mark them with category='plan' so they group together.
--     Uses NOT EXISTS guards because services has no unique on name.
-- ------------------------------------------------------------
INSERT INTO services (name, description, category, price, currency, is_active, target_roles, status)
SELECT * FROM (VALUES
  ('Plan: Founder Package — Visionary Owners',
   'Owner Basic plan with the founders rate (30% lifetime). Limited to the first 20 owners.',
   'plan', 0::numeric, 'CAD', true,
   ARRAY['propietario','propietario_preferido']::text[], 'active'),
  ('Plan: Owner Preferred',
   'Owner plan tier for portfolios of 2–3 properties.',
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
