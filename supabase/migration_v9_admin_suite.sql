-- ============================================================
-- WebMarketing v9 — Admin Configuration Suite (Steve 4/28 PDF)
-- Run this in Supabase Dashboard → SQL Editor → New query
--
-- Adds:
--  1. profiles.role_locked         (block auto re-promotion)
--  2. profiles role check expanded (marketing/sales/support)
--  3. services lifecycle/visibility (status, target_time, visible_on_web,
--     media_urls, recurring_interval)
--  4. promotions targeting         (target_zones, target_roles)
--  5. articles                     (blog/resource posts)
--  6. matching_rules               (admin-editable scoring weights)
--  7. forms_dynamic + form_questions (form builder)
--  8. handle_new_user trigger updated for role_locked default
-- ============================================================

-- ============================================================
-- 1. PROFILES — role_locked + extended role enum
-- ============================================================
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS role_locked BOOLEAN NOT NULL DEFAULT false;

-- Drop the old role check constraint (the most recent is from migration_v2_mvp);
-- recreate it with the four internal roles added.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'propietario', 'propietario_preferido', 'inversionista',
    'inquilino', 'inquilino_premium',
    'pymes',
    'admin', 'marketing', 'sales', 'support'
  ));

-- ============================================================
-- 2. SERVICES — lifecycle, visibility, media, target time
-- ============================================================
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'archived')),
  ADD COLUMN IF NOT EXISTS visible_on_web BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS target_time TEXT,
  ADD COLUMN IF NOT EXISTS recurring_interval TEXT
    CHECK (recurring_interval IN ('one_time', 'monthly', 'yearly')),
  ADD COLUMN IF NOT EXISTS media_urls TEXT[] NOT NULL DEFAULT '{}';

-- Backfill: any service flagged is_active=false moves to status='paused'
UPDATE services SET status = 'paused' WHERE is_active = false AND status = 'active';

-- ============================================================
-- 3. PROMOTIONS — zone + role targeting
-- ============================================================
ALTER TABLE promotions
  ADD COLUMN IF NOT EXISTS target_zones TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS target_roles TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS description TEXT;

-- ============================================================
-- 4. ARTICLES — blog/resource publishing
-- ============================================================
CREATE TABLE IF NOT EXISTS articles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  excerpt TEXT,
  body TEXT NOT NULL DEFAULT '',
  cover_image_url TEXT,
  author_name TEXT,
  category TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  is_published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read published articles" ON articles;
CREATE POLICY "Anyone can read published articles" ON articles
  FOR SELECT USING (is_published = true OR EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'marketing')
  ));

DROP POLICY IF EXISTS "Admins can manage articles" ON articles;
CREATE POLICY "Admins can manage articles" ON articles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'marketing'))
  );

-- ============================================================
-- 5. MATCHING RULES — admin-editable scoring config
-- ============================================================
CREATE TABLE IF NOT EXISTS matching_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_key TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  weight NUMERIC NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE matching_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage matching_rules" ON matching_rules;
CREATE POLICY "Admins can manage matching_rules" ON matching_rules
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'marketing'))
  );

-- Seed the 8 premium-tenant criteria + property scoring weights
INSERT INTO matching_rules (rule_key, description, weight) VALUES
  ('tenant_premium.stable_employment', 'Tenant has stable (full_time / self_employed) employment', 1),
  ('tenant_premium.budget_2500',       'Tenant max budget >= $2,500 CAD/month', 1),
  ('tenant_premium.premium_amenities', 'Tenant seeks premium amenities (gym/pool/etc.)', 1),
  ('tenant_premium.urban_zone',        'Tenant prefers urban zones', 1),
  ('tenant_premium.bedrooms_2_4',      'Tenant needs 2-4 bedrooms', 1),
  ('tenant_premium.smart_home',        'Tenant interested in smart home features', 1),
  ('tenant_premium.modern_style',      'Tenant prefers modern/elegant style', 1),
  ('tenant_premium.long_contract',     'Tenant willing to sign 12-24 month contract', 1),
  ('tenant_premium.threshold',         'Number of criteria required to be classified Premium', 3),
  ('property_match.elite_premium_bonus', 'Elite-tier property bonus for Premium tenants', 5),
  ('property_match.budget_match',        'Property monthly_rent within budget bonus', 3),
  ('property_match.bedrooms_match',      'Property bedrooms exactly matching tenant request', 3),
  ('property_match.city_match',          'Property city matches tenant preferred city', 4),
  ('property_match.amenities_overlap',   'Per amenity overlap between property and tenant preferences', 1)
ON CONFLICT (rule_key) DO NOTHING;

-- ============================================================
-- 6. DYNAMIC FORMS — form builder
-- ============================================================
CREATE TABLE IF NOT EXISTS forms_dynamic (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  target_role TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS form_questions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  form_id UUID NOT NULL REFERENCES forms_dynamic(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  field_key TEXT NOT NULL,
  label TEXT NOT NULL,
  question_type TEXT NOT NULL
    CHECK (question_type IN ('text','textarea','number','email','phone','select','multiselect','radio','checkbox','date','yesno')),
  options JSONB,                   -- [{ "value":"yes","label":"Yes" }, ...]
  required BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  conditional_on TEXT,             -- field_key of the controlling question
  conditional_value TEXT,          -- show this question only when controller has this value
  helper_text TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(form_id, field_key)
);

CREATE INDEX IF NOT EXISTS form_questions_form_id_position_idx
  ON form_questions(form_id, position);

ALTER TABLE forms_dynamic ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read active forms" ON forms_dynamic;
CREATE POLICY "Anyone can read active forms" ON forms_dynamic
  FOR SELECT USING (is_active = true OR EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','marketing')
  ));

DROP POLICY IF EXISTS "Admins can manage forms" ON forms_dynamic;
CREATE POLICY "Admins can manage forms" ON forms_dynamic
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','marketing'))
  );

DROP POLICY IF EXISTS "Anyone can read questions for active forms" ON form_questions;
CREATE POLICY "Anyone can read questions for active forms" ON form_questions
  FOR SELECT USING (is_active = true OR EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','marketing')
  ));

DROP POLICY IF EXISTS "Admins can manage questions" ON form_questions;
CREATE POLICY "Admins can manage questions" ON form_questions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','marketing'))
  );

-- ============================================================
-- 7. STORAGE BUCKET FOR SERVICE MEDIA
-- ============================================================
-- The bucket creation cannot be done via SQL directly; do this in the Supabase
-- Dashboard → Storage → New bucket "service-media" (public, file-size limit 10 MB)
-- and then run the policies below.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'service-media') THEN
    -- Public read
    DROP POLICY IF EXISTS "Public read service media" ON storage.objects;
    CREATE POLICY "Public read service media" ON storage.objects
      FOR SELECT USING (bucket_id = 'service-media');

    -- Admin/marketing write
    DROP POLICY IF EXISTS "Admin write service media" ON storage.objects;
    CREATE POLICY "Admin write service media" ON storage.objects
      FOR INSERT WITH CHECK (
        bucket_id = 'service-media' AND EXISTS (
          SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','marketing')
        )
      );
  END IF;
END $$;

-- ============================================================
-- 8. UPDATE handle_new_user TRIGGER for role_locked default + new fields
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, phone, role, company_name,
                               property_count, is_premium_tenant, premium_criteria_met,
                               role_locked)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'phone',
    COALESCE(NEW.raw_user_meta_data->>'role', 'inquilino'),
    NEW.raw_user_meta_data->>'company_name',
    0,
    FALSE,
    0,
    -- if admin/marketing/sales/support is being created via admin tooling, lock the role
    COALESCE(NEW.raw_user_meta_data->>'role', 'inquilino') IN ('admin','marketing','sales','support')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- DONE. Verify with:
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'services';
--   SELECT rule_key, weight FROM matching_rules;
-- ============================================================
