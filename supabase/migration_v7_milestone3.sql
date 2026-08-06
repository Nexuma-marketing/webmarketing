-- ============================================================
-- WebMarketing v7 - Milestone 3: Admin Panel + User Dashboard
-- Run this in Supabase Dashboard → SQL Editor → New query
--
-- Changes:
-- 1. app_config: Key-value store for matching configuration
-- 2. promotions: Discount codes and promotional offers
-- 3. site_content: CMS key-value content store
-- 4. legal_documents: Privacy policy & terms storage
-- 5. RPC functions for admin dashboard KPI aggregations
-- ============================================================

-- ============================================================
-- 1. APP_CONFIG: Matching rules & system configuration
-- ============================================================
CREATE TABLE IF NOT EXISTS app_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(category, key)
);

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage app_config" ON app_config;
CREATE POLICY "Admins can manage app_config" ON app_config
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- ============================================================
-- 2. PROMOTIONS: Discount codes
-- ============================================================
CREATE TABLE IF NOT EXISTS promotions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value NUMERIC NOT NULL DEFAULT 0,
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE,
  is_active BOOLEAN DEFAULT true,
  max_uses INTEGER,
  used_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage promotions" ON promotions;
CREATE POLICY "Admins can manage promotions" ON promotions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- ============================================================
-- 3. SITE_CONTENT: CMS key-value content store
-- ============================================================
CREATE TABLE IF NOT EXISTS site_content (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  section TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(section, key)
);

ALTER TABLE site_content ENABLE ROW LEVEL SECURITY;

-- Public read for landing page content
DROP POLICY IF EXISTS "Anyone can read site_content" ON site_content;
CREATE POLICY "Anyone can read site_content" ON site_content
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage site_content" ON site_content;
CREATE POLICY "Admins can manage site_content" ON site_content
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- ============================================================
-- 4. LEGAL_DOCUMENTS: Privacy policy, ToS, etc.
-- ============================================================
CREATE TABLE IF NOT EXISTS legal_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL DEFAULT '1.0',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE legal_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read legal_documents" ON legal_documents;
CREATE POLICY "Anyone can read legal_documents" ON legal_documents
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage legal_documents" ON legal_documents;
CREATE POLICY "Admins can manage legal_documents" ON legal_documents
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Seed default legal documents
INSERT INTO legal_documents (type, content, version) VALUES
  ('privacy_policy', 'Privacy policy content goes here...', '1.0'),
  ('terms_of_service', 'Terms of service content goes here...', '1.0')
ON CONFLICT (type) DO NOTHING;

-- ============================================================
-- 5. RPC FUNCTIONS for Admin Dashboard
-- ============================================================

-- Count users by role
CREATE OR REPLACE FUNCTION count_by_role()
RETURNS TABLE(role TEXT, count BIGINT)
LANGUAGE sql STABLE
AS $$
  SELECT role::TEXT, COUNT(*) as count
  FROM profiles
  GROUP BY role
  ORDER BY count DESC;
$$;

-- Count leads by status
CREATE OR REPLACE FUNCTION count_by_lead_status()
RETURNS TABLE(status TEXT, count BIGINT)
LANGUAGE sql STABLE
AS $$
  SELECT status::TEXT, COUNT(*) as count
  FROM leads
  GROUP BY status
  ORDER BY count DESC;
$$;

-- ============================================================
-- 6. Ensure properties.furnished column exists (for tenant form)
-- ============================================================
ALTER TABLE tenant_preferences
  ADD COLUMN IF NOT EXISTS furnished BOOLEAN DEFAULT false;

-- ============================================================
-- DONE! Run this after migration_v6_cfp_payback.sql
-- ============================================================
