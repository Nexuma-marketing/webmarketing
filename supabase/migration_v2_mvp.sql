-- ============================================================
-- WebMarketing MVP v2 - Migration Script
-- Run this in Supabase Dashboard → SQL Editor → New query
--
-- IMPORTANT: This migration updates existing tables and adds
-- new tables required by the MVP. Run AFTER the initial
-- migration.sql has been executed.
-- ============================================================

-- ============================================================
-- 1. UPDATE PROFILES TABLE
-- Add new columns for MVP (property_count, premium tenant)
-- Expand role CHECK constraint to support new roles
-- ============================================================

-- Drop the old role CHECK constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Add new columns
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS property_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_premium_tenant BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS premium_criteria_met INTEGER DEFAULT 0;

-- Add updated role constraint (includes new roles)
ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'propietario',
    'propietario_preferido',
    'inversionista',
    'inquilino',
    'inquilino_premium',
    'pymes',
    'admin'
  ));

-- ============================================================
-- 2. UPDATE PROPERTIES TABLE
-- Add new columns for MVP (service tier, elite tier, CFP, etc.)
-- Change from Colombia/USD defaults to Canada/CAD
-- ============================================================

-- Add new columns
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS province TEXT DEFAULT 'Quebec',
  ADD COLUMN IF NOT EXISTS postal_code TEXT,
  ADD COLUMN IF NOT EXISTS monthly_rent NUMERIC,
  ADD COLUMN IF NOT EXISTS area_sqft NUMERIC,
  ADD COLUMN IF NOT EXISTS service_tier TEXT CHECK (service_tier IN ('basic', 'preferred_owners', 'elite')),
  ADD COLUMN IF NOT EXISTS elite_tier TEXT CHECK (elite_tier IN ('essentials', 'signature', 'lujo')),
  ADD COLUMN IF NOT EXISTS cfp_monthly NUMERIC;

-- Update defaults for Canada
ALTER TABLE properties
  ALTER COLUMN country SET DEFAULT 'Canada',
  ALTER COLUMN currency SET DEFAULT 'CAD';

-- Update existing rows to Canada (if any)
UPDATE properties SET country = 'Canada', currency = 'CAD' WHERE country = 'Colombia';

-- ============================================================
-- 3. UPDATE TENANT_PREFERENCES TABLE
-- Add premium classification criteria fields
-- ============================================================

ALTER TABLE tenant_preferences
  ADD COLUMN IF NOT EXISTS preferred_zones TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS bathrooms_needed INTEGER,
  ADD COLUMN IF NOT EXISTS employment_type TEXT,
  ADD COLUMN IF NOT EXISTS employment_verifiable BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS seeks_premium_amenities BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS preferred_amenities TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS prefers_urban_zone BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS smart_home_interest BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS style_preference TEXT,
  ADD COLUMN IF NOT EXISTS contract_duration TEXT,
  ADD COLUMN IF NOT EXISTS premium_criteria_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS consent_data_processing BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS consent_marketing BOOLEAN DEFAULT FALSE;

-- ============================================================
-- 4. UPDATE PYMES_DIAGNOSIS TABLE
-- Replace old structure with Sales Leak Calculator fields
-- ============================================================

-- Drop old constraint
ALTER TABLE pymes_diagnosis DROP CONSTRAINT IF EXISTS pymes_diagnosis_urgency_level_check;

-- Change monthly_revenue from TEXT to NUMERIC
ALTER TABLE pymes_diagnosis
  ALTER COLUMN monthly_revenue TYPE NUMERIC USING monthly_revenue::NUMERIC;

-- Add new Sales Leak Calculator columns
ALTER TABLE pymes_diagnosis
  ADD COLUMN IF NOT EXISTS q1_online_presence INTEGER CHECK (q1_online_presence BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS q2_seo_positioning INTEGER CHECK (q2_seo_positioning BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS q3_lead_generation INTEGER CHECK (q3_lead_generation BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS q4_lead_conversion INTEGER CHECK (q4_lead_conversion BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS q5_client_retention INTEGER CHECK (q5_client_retention BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS q6_repeat_purchases INTEGER CHECK (q6_repeat_purchases BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS q7_marketing_strategy INTEGER CHECK (q7_marketing_strategy BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS total_score INTEGER,
  ADD COLUMN IF NOT EXISTS estimated_loss NUMERIC,
  ADD COLUMN IF NOT EXISTS recommended_plan TEXT CHECK (recommended_plan IN ('rescue', 'growth', 'scale'));

-- Add new urgency level constraint (moderate/high/critical instead of bajo/medio/alto/critico)
ALTER TABLE pymes_diagnosis
  ADD CONSTRAINT pymes_diagnosis_urgency_level_check_v2
  CHECK (urgency_level IN ('moderate', 'high', 'critical', 'bajo', 'medio', 'alto', 'critico'));

-- ============================================================
-- 5. UPDATE SERVICES TABLE
-- Add tier and features columns, change currency default
-- ============================================================

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS tier TEXT,
  ADD COLUMN IF NOT EXISTS features TEXT[] DEFAULT '{}';

ALTER TABLE services
  ALTER COLUMN currency SET DEFAULT 'CAD';

-- ============================================================
-- 6. UPDATE PAYMENTS TABLE
-- Add installment fields, plan reference, change currency
-- ============================================================

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS pymes_plan_id UUID,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_type TEXT,
  ADD COLUMN IF NOT EXISTS installment_number INTEGER;

ALTER TABLE payments
  ALTER COLUMN currency SET DEFAULT 'CAD';

-- ============================================================
-- 7. UPDATE LEADS TABLE
-- Expand role constraint to support new roles
-- ============================================================

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_role_check;

ALTER TABLE leads
  ADD CONSTRAINT leads_role_check
  CHECK (role IN (
    'propietario',
    'propietario_preferido',
    'inversionista',
    'inquilino',
    'inquilino_premium',
    'pymes',
    'admin'
  ));

-- ============================================================
-- 8. NEW TABLE: PROPERTY_IMAGES (Room-by-room with validation)
-- ============================================================

CREATE TABLE IF NOT EXISTS property_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  room_category TEXT NOT NULL,
  image_url TEXT NOT NULL,
  thumbnail_url TEXT,
  original_filename TEXT,
  file_size_bytes INTEGER,
  width INTEGER,
  height INTEGER,
  orientation TEXT,
  resolution_ok BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  validation_notes TEXT,
  sort_order INTEGER DEFAULT 0,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE property_images ENABLE ROW LEVEL SECURITY;

-- Property owners can manage images for their own properties
CREATE POLICY "Owners can manage own property images"
  ON property_images FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = property_images.property_id
      AND properties.owner_id = auth.uid()
    )
  );

-- Anyone can view property images (public)
CREATE POLICY "Anyone can view property images table"
  ON property_images FOR SELECT
  USING (TRUE);

-- Admins can manage all property images
CREATE POLICY "Admins can manage all property images"
  ON property_images FOR ALL
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
  );

-- ============================================================
-- 9. NEW TABLE: DISCOVERY_BRIEFS (Owner Typeform-style form)
-- ============================================================

CREATE TABLE IF NOT EXISTS discovery_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  property_objective TEXT NOT NULL,
  property_type TEXT NOT NULL,
  current_state TEXT NOT NULL,
  monthly_rent NUMERIC,
  main_challenge TEXT NOT NULL,
  property_count INTEGER NOT NULL,
  has_professional_photos BOOLEAN DEFAULT FALSE,
  current_listings TEXT[] DEFAULT '{}',
  marketing_budget TEXT,
  timeline TEXT,
  additional_comments TEXT,
  assigned_path TEXT,
  consent_data_processing BOOLEAN DEFAULT FALSE,
  consent_image_usage BOOLEAN DEFAULT FALSE,
  consent_marketing BOOLEAN DEFAULT FALSE,
  consent_third_party BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE discovery_briefs ENABLE ROW LEVEL SECURITY;

-- Users can manage their own discovery briefs
CREATE POLICY "Users can view own discovery briefs"
  ON discovery_briefs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own discovery briefs"
  ON discovery_briefs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own discovery briefs"
  ON discovery_briefs FOR UPDATE
  USING (auth.uid() = user_id);

-- Admins can view all discovery briefs
CREATE POLICY "Admins can view all discovery briefs"
  ON discovery_briefs FOR ALL
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
  );

-- ============================================================
-- 10. NEW TABLE: PYMES_PLANS (Fixed pricing structure)
-- ============================================================

CREATE TABLE IF NOT EXISTS pymes_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_type TEXT NOT NULL CHECK (plan_type IN ('rescue', 'growth', 'scale')),
  name TEXT NOT NULL,
  price NUMERIC NOT NULL,
  upfront_amount NUMERIC,
  installment_amount NUMERIC,
  installment_months INTEGER,
  features TEXT[] NOT NULL DEFAULT '{}',
  urgency_levels TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pymes_plans ENABLE ROW LEVEL SECURITY;

-- Anyone can view active plans
CREATE POLICY "Anyone can view active pymes plans"
  ON pymes_plans FOR SELECT
  USING (is_active = TRUE);

-- Admins can manage all plans
CREATE POLICY "Admins can manage pymes plans"
  ON pymes_plans FOR ALL
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
  );

-- Add foreign key from payments to pymes_plans
ALTER TABLE payments
  ADD CONSTRAINT payments_pymes_plan_id_fkey
  FOREIGN KEY (pymes_plan_id) REFERENCES pymes_plans(id) ON DELETE SET NULL;

-- ============================================================
-- 11. NEW TABLE: CONSENT_LOGS (Legal consent tracking)
-- ============================================================

CREATE TABLE IF NOT EXISTS consent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL CHECK (consent_type IN ('data_processing', 'image_usage', 'marketing', 'third_party')),
  granted BOOLEAN NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  granted_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE consent_logs ENABLE ROW LEVEL SECURITY;

-- Users can view their own consent logs
CREATE POLICY "Users can view own consent logs"
  ON consent_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own consent logs
CREATE POLICY "Users can insert own consent logs"
  ON consent_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admins can view all consent logs
CREATE POLICY "Admins can view all consent logs"
  ON consent_logs FOR ALL
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
  );

-- ============================================================
-- 12. NEW TABLE: EMAIL_LOGS (Notification tracking)
-- ============================================================

CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email TEXT NOT NULL,
  recipient_type TEXT,
  template TEXT NOT NULL,
  subject TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'sent'
);

ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view email logs
CREATE POLICY "Admins can manage email logs"
  ON email_logs FOR ALL
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
  );

-- Service role can insert email logs (from API routes)
CREATE POLICY "Service role can insert email logs"
  ON email_logs FOR INSERT
  WITH CHECK (TRUE);

-- ============================================================
-- 13. INDEXES for new tables
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_property_images_property ON property_images(property_id);
CREATE INDEX IF NOT EXISTS idx_property_images_room ON property_images(room_category);
CREATE INDEX IF NOT EXISTS idx_discovery_briefs_user ON discovery_briefs(user_id);
CREATE INDEX IF NOT EXISTS idx_consent_logs_user ON consent_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_template ON email_logs(template);
CREATE INDEX IF NOT EXISTS idx_pymes_plans_type ON pymes_plans(plan_type);

-- ============================================================
-- 14. TRIGGERS for new tables (auto-update updated_at)
-- ============================================================

CREATE TRIGGER update_discovery_briefs_updated_at
  BEFORE UPDATE ON discovery_briefs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- 15. SEED DATA: PYMES Plans (3 tiers)
-- ============================================================

INSERT INTO pymes_plans (plan_type, name, price, upfront_amount, installment_amount, installment_months, features, urgency_levels) VALUES
(
  'rescue',
  'Plan Rescue',
  1500.00,
  750.00,
  250.00,
  3,
  ARRAY[
    'Emergency digital audit',
    'Google Business Profile optimization',
    'Basic SEO correction',
    'Social media rescue (2 platforms)',
    '30-day action plan'
  ],
  ARRAY['critical']
),
(
  'growth',
  'Plan Growth',
  2500.00,
  1000.00,
  375.00,
  4,
  ARRAY[
    'Complete digital audit',
    'Website optimization or landing page',
    'SEO strategy (on-page + local)',
    'Social media management (3 platforms)',
    'Google Ads basic campaign',
    'Monthly performance reports',
    '90-day growth roadmap'
  ],
  ARRAY['high']
),
(
  'scale',
  'Plan Scale',
  3800.00,
  1500.00,
  460.00,
  5,
  ARRAY[
    'Full digital transformation audit',
    'Website redesign or new build',
    'Advanced SEO (on-page + off-page + technical)',
    'Social media management (all platforms)',
    'Google Ads + Meta Ads campaigns',
    'Email marketing automation',
    'CRM integration',
    'Conversion rate optimization',
    'Monthly strategy sessions',
    '6-month scaling roadmap'
  ],
  ARRAY['moderate']
);

-- ============================================================
-- 16. UPDATE SAMPLE SERVICES (English, CAD pricing)
-- ============================================================

-- Delete old Spanish service data
DELETE FROM services WHERE currency = 'USD';

-- Insert new English service data with CAD pricing
INSERT INTO services (name, description, category, tier, price, currency, target_roles, features) VALUES
(
  'Professional Photography',
  'Professional photo session for your property with editing included',
  'residential',
  'basic',
  250.00,
  'CAD',
  ARRAY['propietario', 'propietario_preferido', 'inversionista'],
  ARRAY['Up to 30 edited photos', 'HDR processing', '48-hour delivery']
),
(
  'Virtual Tour 360',
  'Interactive 360-degree virtual tour of your property',
  'residential',
  'preferred',
  500.00,
  'CAD',
  ARRAY['propietario_preferido', 'inversionista'],
  ARRAY['Full 360 walkthrough', 'Hosted on dedicated platform', 'Embeddable link', 'Floor plan included']
),
(
  'Property Listing Optimization',
  'Optimize your property listings across major platforms',
  'residential',
  'basic',
  350.00,
  'CAD',
  ARRAY['propietario', 'propietario_preferido', 'inversionista'],
  ARRAY['Centris optimization', 'Kijiji listing', 'Social media posts', 'SEO-optimized descriptions']
),
(
  'Tenant Screening Service',
  'Comprehensive tenant background and credit screening',
  'residential',
  'basic',
  150.00,
  'CAD',
  ARRAY['propietario', 'propietario_preferido', 'inversionista'],
  ARRAY['Credit check', 'Employment verification', 'Reference check', 'Rental history']
),
(
  'Portfolio Marketing Strategy',
  'Complete marketing strategy for multi-property portfolios',
  'residential',
  'preferred',
  1200.00,
  'CAD',
  ARRAY['propietario_preferido', 'inversionista'],
  ARRAY['Portfolio audit', 'Per-property marketing plan', 'Monthly reporting', 'Priority support']
),
(
  'Elite Property Management',
  'Premium marketing and management for luxury properties',
  'residential',
  'elite_signature',
  2500.00,
  'CAD',
  ARRAY['inversionista'],
  ARRAY['Dedicated account manager', 'Premium photography + staging', 'Full digital campaign', 'Concierge tenant screening', 'Monthly analytics']
),
(
  'Tenant Property Search',
  'Personalized property search and matching service',
  'residential',
  'basic',
  100.00,
  'CAD',
  ARRAY['inquilino', 'inquilino_premium'],
  ARRAY['Personalized search', 'Up to 10 matched properties', 'Viewing coordination']
),
(
  'Premium Tenant Concierge',
  'VIP property matching and relocation assistance for premium tenants',
  'residential',
  'preferred',
  300.00,
  'CAD',
  ARRAY['inquilino_premium'],
  ARRAY['Dedicated agent', 'Unlimited matched properties', 'Priority viewings', 'Lease negotiation support', 'Move-in coordination']
);

-- ============================================================
-- 17. UPDATE HANDLE_NEW_USER FUNCTION
-- Support new role values in the signup trigger
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, phone, role, company_name, property_count, is_premium_tenant, premium_criteria_met)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'phone',
    COALESCE(NEW.raw_user_meta_data->>'role', 'inquilino'),
    NEW.raw_user_meta_data->>'company_name',
    0,
    FALSE,
    0
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- DONE! All MVP tables, columns, and policies have been created.
--
-- Summary of changes:
-- - profiles: Added property_count, is_premium_tenant, premium_criteria_met; expanded role constraint
-- - properties: Added province, postal_code, monthly_rent, area_sqft, service_tier, elite_tier, cfp_monthly; changed defaults to Canada/CAD
-- - tenant_preferences: Added 13 new columns for premium criteria and consents
-- - pymes_diagnosis: Added 10 new columns for Sales Leak Calculator; changed monthly_revenue to NUMERIC
-- - services: Added tier, features columns; changed currency to CAD
-- - payments: Added pymes_plan_id, stripe_subscription_id, payment_type, installment_number
-- - leads: Expanded role constraint for new roles
-- - NEW: property_images (room-by-room image management)
-- - NEW: discovery_briefs (owner Typeform-style form)
-- - NEW: pymes_plans (3-tier pricing: Rescue/Growth/Scale)
-- - NEW: consent_logs (legal consent tracking)
-- - NEW: email_logs (notification tracking)
-- - Updated handle_new_user trigger for new columns
-- - Seeded 3 PYMES plans and 8 service catalog entries
-- ============================================================
