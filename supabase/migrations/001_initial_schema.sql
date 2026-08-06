-- ===========================================
-- ENUMS
-- ===========================================
CREATE TYPE user_role AS ENUM ('propietario', 'inquilino', 'pymes', 'admin');
CREATE TYPE lead_status AS ENUM ('nuevo', 'contactado', 'en_proceso', 'cerrado');
CREATE TYPE urgency_level AS ENUM ('bajo', 'medio', 'alto', 'critico');
CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'failed', 'refunded');

-- ===========================================
-- PROFILES (extends Supabase auth.users)
-- ===========================================
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT,
    role user_role NOT NULL,
    company_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- PROPERTIES
-- ===========================================
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
    price DECIMAL(12,2),
    currency TEXT DEFAULT 'USD',
    bedrooms INTEGER,
    bathrooms INTEGER,
    area_sqm DECIMAL(10,2),
    amenities TEXT[],
    images TEXT[],
    is_available BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- TENANT PREFERENCES
-- ===========================================
CREATE TABLE tenant_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    preferred_city TEXT,
    preferred_zone TEXT,
    min_budget DECIMAL(12,2),
    max_budget DECIMAL(12,2),
    bedrooms_needed INTEGER,
    move_in_date DATE,
    pet_friendly BOOLEAN DEFAULT FALSE,
    parking_needed BOOLEAN DEFAULT FALSE,
    additional_requirements TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- PYMES DIAGNOSIS
-- ===========================================
CREATE TABLE pymes_diagnosis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    company_name TEXT NOT NULL,
    sector TEXT NOT NULL,
    employee_count TEXT NOT NULL,
    monthly_revenue TEXT NOT NULL,
    has_website BOOLEAN DEFAULT FALSE,
    has_social_media BOOLEAN DEFAULT FALSE,
    social_media_platforms TEXT[],
    current_marketing_channels TEXT[],
    marketing_budget TEXT,
    main_challenge TEXT NOT NULL,
    business_goals TEXT[],
    urgency_level urgency_level,
    urgency_score INTEGER,
    recommendation_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- SERVICES CATALOG
-- ===========================================
CREATE TABLE services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    subcategory TEXT,
    price DECIMAL(12,2) NOT NULL,
    currency TEXT DEFAULT 'USD',
    is_active BOOLEAN DEFAULT TRUE,
    target_roles user_role[],
    target_urgency urgency_level[],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- SERVICE RECOMMENDATIONS
-- ===========================================
CREATE TABLE service_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    reason TEXT,
    score INTEGER,
    is_purchased BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- LEADS
-- ===========================================
CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    role user_role,
    source TEXT,
    status lead_status DEFAULT 'nuevo',
    notes TEXT,
    assigned_to UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- PAYMENTS
-- ===========================================
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    service_id UUID REFERENCES services(id),
    stripe_session_id TEXT NOT NULL,
    stripe_payment_intent_id TEXT,
    amount DECIMAL(12,2) NOT NULL,
    currency TEXT DEFAULT 'USD',
    status payment_status DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- ROW LEVEL SECURITY
-- ===========================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE pymes_diagnosis ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admin can view all profiles" ON profiles FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Admin can update all profiles" ON profiles FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Properties
CREATE POLICY "Owners can manage own properties" ON properties FOR ALL USING (auth.uid() = owner_id);
CREATE POLICY "Admin can manage all properties" ON properties FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Anyone can view available properties" ON properties FOR SELECT USING (is_available = TRUE);

-- Tenant preferences
CREATE POLICY "Tenants can manage own preferences" ON tenant_preferences FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Admin can view tenant preferences" ON tenant_preferences FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- PYMES diagnosis
CREATE POLICY "PYMES can manage own diagnosis" ON pymes_diagnosis FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Admin can view all diagnosis" ON pymes_diagnosis FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Services
CREATE POLICY "Anyone can view active services" ON services FOR SELECT USING (is_active = TRUE);
CREATE POLICY "Admin can manage services" ON services FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Service recommendations
CREATE POLICY "Users can view own recommendations" ON service_recommendations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admin can manage recommendations" ON service_recommendations FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Leads
CREATE POLICY "Admin can manage leads" ON leads FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Service role can insert leads" ON leads FOR INSERT WITH CHECK (true);

-- Payments
CREATE POLICY "Users can view own payments" ON payments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admin can view all payments" ON payments FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ===========================================
-- INDEXES
-- ===========================================
CREATE INDEX idx_properties_owner ON properties(owner_id);
CREATE INDEX idx_properties_city ON properties(city);
CREATE INDEX idx_tenant_prefs_user ON tenant_preferences(user_id);
CREATE INDEX idx_pymes_diagnosis_user ON pymes_diagnosis(user_id);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_payments_user ON payments(user_id);
CREATE INDEX idx_service_recommendations_user ON service_recommendations(user_id);

-- ===========================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ===========================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'inquilino')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ===========================================
-- AUTO-UPDATE updated_at
-- ===========================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_properties_updated_at BEFORE UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_tenant_prefs_updated_at BEFORE UPDATE ON tenant_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_pymes_updated_at BEFORE UPDATE ON pymes_diagnosis FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ===========================================
-- STORAGE BUCKET (run in Supabase Dashboard)
-- ===========================================
-- Create a public bucket named 'property-images'
-- Set max file size: 5MB
-- Allowed MIME types: image/jpeg, image/png, image/webp
