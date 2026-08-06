-- ============================================================
-- WebMarketing - Supabase Full Migration Script
-- Run this in Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- ============================================================
-- 1. PROFILES (User profiles)
-- ============================================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('propietario', 'inquilino', 'pymes', 'admin')),
  company_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Users can insert their own profile (via trigger or server)
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================
-- 2. PROPERTIES (Real estate listings)
-- ============================================================
CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  property_type TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT,
  country TEXT DEFAULT 'Colombia',
  price NUMERIC,
  currency TEXT DEFAULT 'USD',
  bedrooms INTEGER,
  bathrooms INTEGER,
  area_sqm NUMERIC,
  amenities TEXT[] DEFAULT '{}',
  images TEXT[] DEFAULT '{}',
  is_available BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

-- Anyone can view available properties
CREATE POLICY "Anyone can view available properties"
  ON properties FOR SELECT
  USING (is_available = TRUE);

-- Owners can view all their own properties
CREATE POLICY "Owners can view own properties"
  ON properties FOR SELECT
  USING (auth.uid() = owner_id);

-- Owners can insert properties
CREATE POLICY "Owners can insert properties"
  ON properties FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

-- Owners can update their own properties
CREATE POLICY "Owners can update own properties"
  ON properties FOR UPDATE
  USING (auth.uid() = owner_id);

-- Owners can delete their own properties
CREATE POLICY "Owners can delete own properties"
  ON properties FOR DELETE
  USING (auth.uid() = owner_id);

-- Admins can manage all properties
CREATE POLICY "Admins can manage all properties"
  ON properties FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================
-- 3. TENANT_PREFERENCES (Tenant search preferences)
-- ============================================================
CREATE TABLE tenant_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  preferred_city TEXT,
  preferred_zone TEXT,
  min_budget NUMERIC,
  max_budget NUMERIC,
  bedrooms_needed INTEGER,
  move_in_date DATE,
  pet_friendly BOOLEAN DEFAULT FALSE,
  parking_needed BOOLEAN DEFAULT FALSE,
  additional_requirements TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tenant_preferences ENABLE ROW LEVEL SECURITY;

-- Users can view their own preferences
CREATE POLICY "Users can view own preferences"
  ON tenant_preferences FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own preferences
CREATE POLICY "Users can insert own preferences"
  ON tenant_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own preferences
CREATE POLICY "Users can update own preferences"
  ON tenant_preferences FOR UPDATE
  USING (auth.uid() = user_id);

-- Admins can view all preferences
CREATE POLICY "Admins can view all preferences"
  ON tenant_preferences FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================
-- 4. PYMES_DIAGNOSIS (Business diagnostic results)
-- ============================================================
CREATE TABLE pymes_diagnosis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  sector TEXT NOT NULL,
  employee_count TEXT NOT NULL,
  monthly_revenue TEXT NOT NULL,
  has_website BOOLEAN DEFAULT FALSE,
  has_social_media BOOLEAN DEFAULT FALSE,
  social_media_platforms TEXT[] DEFAULT '{}',
  current_marketing_channels TEXT[] DEFAULT '{}',
  marketing_budget TEXT,
  main_challenge TEXT NOT NULL,
  business_goals TEXT[] DEFAULT '{}',
  urgency_level TEXT CHECK (urgency_level IN ('bajo', 'medio', 'alto', 'critico')),
  urgency_score INTEGER,
  recommendation_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pymes_diagnosis ENABLE ROW LEVEL SECURITY;

-- Users can view their own diagnosis
CREATE POLICY "Users can view own diagnosis"
  ON pymes_diagnosis FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own diagnosis
CREATE POLICY "Users can insert own diagnosis"
  ON pymes_diagnosis FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own diagnosis
CREATE POLICY "Users can update own diagnosis"
  ON pymes_diagnosis FOR UPDATE
  USING (auth.uid() = user_id);

-- Admins can view all diagnoses
CREATE POLICY "Admins can view all diagnoses"
  ON pymes_diagnosis FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================
-- 5. SERVICES (Service catalog)
-- ============================================================
CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  subcategory TEXT,
  price NUMERIC NOT NULL,
  currency TEXT DEFAULT 'USD',
  is_active BOOLEAN DEFAULT TRUE,
  target_roles TEXT[] DEFAULT '{}',
  target_urgency TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE services ENABLE ROW LEVEL SECURITY;

-- Anyone can view active services
CREATE POLICY "Anyone can view active services"
  ON services FOR SELECT
  USING (is_active = TRUE);

-- Admins can manage all services
CREATE POLICY "Admins can manage services"
  ON services FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================
-- 6. SERVICE_RECOMMENDATIONS (Personalized recommendations)
-- ============================================================
CREATE TABLE service_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  reason TEXT,
  is_purchased BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE service_recommendations ENABLE ROW LEVEL SECURITY;

-- Users can view their own recommendations
CREATE POLICY "Users can view own recommendations"
  ON service_recommendations FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can manage all recommendations
CREATE POLICY "Admins can manage recommendations"
  ON service_recommendations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================
-- 7. LEADS (Sales leads)
-- ============================================================
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  role TEXT CHECK (role IN ('propietario', 'inquilino', 'pymes', 'admin')),
  source TEXT,
  status TEXT NOT NULL DEFAULT 'nuevo' CHECK (status IN ('nuevo', 'contactado', 'en_proceso', 'cerrado')),
  notes TEXT,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Admins can manage all leads
CREATE POLICY "Admins can manage all leads"
  ON leads FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Allow lead creation from API routes (using supabaseAdmin / service role)
CREATE POLICY "Service role can insert leads"
  ON leads FOR INSERT
  WITH CHECK (TRUE);

-- ============================================================
-- 8. PAYMENTS (Payment records)
-- ============================================================
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  service_id UUID REFERENCES services(id) ON DELETE SET NULL,
  stripe_session_id TEXT NOT NULL,
  stripe_payment_intent_id TEXT,
  amount NUMERIC NOT NULL,
  currency TEXT DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Users can view their own payments
CREATE POLICY "Users can view own payments"
  ON payments FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can manage all payments
CREATE POLICY "Admins can manage all payments"
  ON payments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================
-- 9. AUTO-CREATE PROFILE ON SIGNUP
-- Trigger: when a new user signs up in auth.users,
-- automatically create a row in profiles
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, phone, role, company_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'phone',
    COALESCE(NEW.raw_user_meta_data->>'role', 'inquilino'),
    NEW.raw_user_meta_data->>'company_name'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 10. AUTO-UPDATE updated_at TIMESTAMP
-- Trigger: automatically set updated_at on row update
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_properties_updated_at
  BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_tenant_preferences_updated_at
  BEFORE UPDATE ON tenant_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_pymes_diagnosis_updated_at
  BEFORE UPDATE ON pymes_diagnosis
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_services_updated_at
  BEFORE UPDATE ON services
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- 11. STORAGE POLICIES (for property-images bucket)
-- Note: Create the bucket manually in Dashboard → Storage
-- ============================================================

-- Authenticated users can upload images
CREATE POLICY "Authenticated users can upload images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'property-images'
    AND auth.role() = 'authenticated'
  );

-- Anyone can view property images (public bucket)
CREATE POLICY "Anyone can view property images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'property-images');

-- Users can delete their own images
CREATE POLICY "Users can delete own images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'property-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================
-- 12. SAMPLE SERVICE DATA
-- ============================================================
INSERT INTO services (name, description, category, price, target_roles, target_urgency) VALUES
  ('Fotografía Profesional', 'Sesión fotográfica profesional para su propiedad con edición incluida', 'inmobiliaria', 150, ARRAY['propietario'], ARRAY['medio', 'alto']),
  ('Tour Virtual 360°', 'Recorrido virtual interactivo de su propiedad', 'inmobiliaria', 300, ARRAY['propietario'], ARRAY['alto', 'critico']),
  ('Gestión de Redes Sociales', 'Manejo completo de redes sociales por 1 mes', 'marketing_digital', 500, ARRAY['pymes'], ARRAY['medio', 'alto', 'critico']),
  ('Diseño de Sitio Web', 'Sitio web profesional responsive con SEO básico', 'marketing_digital', 1200, ARRAY['pymes'], ARRAY['alto', 'critico']),
  ('Campaña Google Ads', 'Configuración y manejo de campaña Google Ads por 1 mes', 'publicidad', 400, ARRAY['pymes'], ARRAY['medio', 'alto']),
  ('Asesoría de Mudanza', 'Servicio de asesoría para encontrar su vivienda ideal', 'inmobiliaria', 50, ARRAY['inquilino'], ARRAY['medio', 'alto']),
  ('SEO Básico', 'Optimización SEO on-page para mejorar posicionamiento', 'marketing_digital', 350, ARRAY['pymes'], ARRAY['medio', 'alto']),
  ('Branding Empresarial', 'Diseño de logo, paleta de colores e identidad visual', 'marketing_digital', 800, ARRAY['pymes'], ARRAY['alto', 'critico']);

-- ============================================================
-- DONE! All tables, policies, and triggers have been created.
-- ============================================================
