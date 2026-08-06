# MVP Plataforma Web de Marketing Residencial y Empresarial
# Implementation Guide

## Tech Stack

| Area | Technology | Purpose |
|------|-----------|---------|
| Framework | Next.js 14 (App Router) | Full-stack framework |
| Database + Auth + Storage | Supabase | PostgreSQL, Auth, S3-compatible storage, REST API |
| Payments | Stripe | Checkout Session + Webhooks |
| Styling | Tailwind CSS + shadcn/ui | Rapid UI development |
| Deployment | Vercel | Hosting |
| Language | TypeScript | Type safety |

---

## Project Structure

```
webmarketing/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   ├── register/page.tsx
│   │   │   └── layout.tsx
│   │   ├── (dashboard)/
│   │   │   ├── dashboard/
│   │   │   │   ├── page.tsx                  # User dashboard home
│   │   │   │   ├── properties/
│   │   │   │   │   ├── page.tsx              # List my properties
│   │   │   │   │   ├── new/page.tsx          # Register new property
│   │   │   │   │   └── [id]/page.tsx         # Property detail/edit
│   │   │   │   ├── profile/page.tsx          # My profile & data
│   │   │   │   ├── services/page.tsx         # Recommended services
│   │   │   │   └── payments/page.tsx         # Payment history
│   │   │   ├── admin/
│   │   │   │   ├── page.tsx                  # Admin dashboard home
│   │   │   │   ├── users/page.tsx            # Manage users
│   │   │   │   ├── properties/page.tsx       # Manage properties
│   │   │   │   ├── leads/page.tsx            # Manage leads
│   │   │   │   └── services/page.tsx         # Manage service catalog
│   │   │   └── layout.tsx                    # Sidebar + auth check
│   │   ├── forms/
│   │   │   ├── propietario/page.tsx          # Owner form
│   │   │   ├── inquilino/page.tsx            # Tenant form
│   │   │   └── pymes/page.tsx               # PYMES diagnosis form
│   │   ├── results/
│   │   │   └── pymes/[id]/page.tsx           # PYMES diagnosis result
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   └── callback/route.ts         # Supabase auth callback
│   │   │   ├── profiling/
│   │   │   │   └── route.ts                  # Profiling + recommendation logic
│   │   │   ├── stripe/
│   │   │   │   ├── checkout/route.ts         # Create Checkout Session
│   │   │   │   └── webhook/route.ts          # Stripe webhook handler
│   │   │   └── webhooks/
│   │   │       └── route.ts                  # Generic webhook endpoint (Make/Zapier)
│   │   ├── layout.tsx                        # Root layout
│   │   └── page.tsx                          # Landing page
│   ├── components/
│   │   ├── ui/                               # shadcn/ui components
│   │   ├── forms/
│   │   │   ├── owner-form.tsx
│   │   │   ├── tenant-form.tsx
│   │   │   ├── pymes-form.tsx
│   │   │   └── form-field.tsx                # Reusable dynamic field
│   │   ├── dashboard/
│   │   │   ├── sidebar.tsx
│   │   │   ├── stats-card.tsx
│   │   │   └── data-table.tsx
│   │   ├── properties/
│   │   │   ├── property-card.tsx
│   │   │   └── image-upload.tsx
│   │   └── layout/
│   │       ├── header.tsx
│   │       └── footer.tsx
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts                     # Browser client
│   │   │   ├── server.ts                     # Server client
│   │   │   └── admin.ts                      # Service role client (admin ops)
│   │   ├── stripe.ts                         # Stripe instance
│   │   ├── profiling/
│   │   │   ├── rules.ts                      # Classification rules
│   │   │   ├── residential.ts                # Residential profiling logic
│   │   │   └── pymes.ts                      # PYMES profiling logic
│   │   └── utils.ts                          # Utility functions
│   ├── types/
│   │   ├── database.ts                       # Supabase generated types
│   │   ├── forms.ts                          # Form data types
│   │   └── profiling.ts                      # Profiling result types
│   └── middleware.ts                         # Auth middleware (protect routes)
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql            # Database schema
├── public/
├── .env.local
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## Database Schema (Supabase PostgreSQL)

```sql
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
    company_name TEXT,                    -- Only for PYMES
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- PROPERTIES (Owner registrations)
-- ===========================================
CREATE TABLE properties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    property_type TEXT NOT NULL,          -- 'apartamento', 'casa', 'oficina', 'local', etc.
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT,
    country TEXT DEFAULT 'Colombia',
    price DECIMAL(12,2),
    currency TEXT DEFAULT 'USD',
    bedrooms INTEGER,
    bathrooms INTEGER,
    area_sqm DECIMAL(10,2),
    amenities TEXT[],                     -- Array of amenities
    images TEXT[],                        -- Array of Supabase Storage URLs
    is_available BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- TENANT PREFERENCES (Tenant form data)
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
-- PYMES DIAGNOSIS (PYMES form data)
-- ===========================================
CREATE TABLE pymes_diagnosis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    company_name TEXT NOT NULL,
    sector TEXT NOT NULL,                 -- 'retail', 'servicios', 'tecnologia', etc.
    employee_count TEXT NOT NULL,         -- '1-5', '6-20', '21-50', '51+'
    monthly_revenue TEXT NOT NULL,        -- Range brackets
    has_website BOOLEAN DEFAULT FALSE,
    has_social_media BOOLEAN DEFAULT FALSE,
    social_media_platforms TEXT[],
    current_marketing_channels TEXT[],    -- 'ninguno', 'redes_sociales', 'email', 'google_ads', etc.
    marketing_budget TEXT,               -- Range brackets
    main_challenge TEXT NOT NULL,         -- 'atraer_clientes', 'retener_clientes', 'presencia_digital', etc.
    business_goals TEXT[],               -- Array of goals
    urgency_level urgency_level,         -- Calculated by profiling logic
    urgency_score INTEGER,               -- Numeric score (0-100)
    recommendation_message TEXT,         -- Generated recommendation
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- SERVICES CATALOG (Admin managed)
-- ===========================================
CREATE TABLE services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,              -- 'residencial', 'empresarial'
    subcategory TEXT,                    -- More specific classification
    price DECIMAL(12,2) NOT NULL,
    currency TEXT DEFAULT 'USD',
    is_active BOOLEAN DEFAULT TRUE,
    target_roles user_role[],           -- Which user roles this service targets
    target_urgency urgency_level[],     -- For PYMES: recommended at which urgency levels
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- SERVICE RECOMMENDATIONS (Profiling results)
-- ===========================================
CREATE TABLE service_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    reason TEXT,                         -- Why this service was recommended
    score INTEGER,                       -- Relevance score
    is_purchased BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- LEADS (Contact management)
-- ===========================================
CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    role user_role,
    source TEXT,                         -- 'formulario_propietario', 'formulario_inquilino', 'formulario_pymes'
    status lead_status DEFAULT 'nuevo',
    notes TEXT,
    assigned_to UUID REFERENCES profiles(id),  -- Admin who manages this lead
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- PAYMENTS (Stripe records)
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
-- ROW LEVEL SECURITY (RLS)
-- ===========================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE pymes_diagnosis ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read/update their own profile, admins can read all
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admin can view all profiles" ON profiles FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Properties: owners can CRUD their own, admins can read all
CREATE POLICY "Owners can manage own properties" ON properties FOR ALL USING (auth.uid() = owner_id);
CREATE POLICY "Admin can manage all properties" ON properties FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Anyone can view available properties" ON properties FOR SELECT USING (is_available = TRUE);

-- Tenant preferences: users can CRUD their own
CREATE POLICY "Tenants can manage own preferences" ON tenant_preferences FOR ALL USING (auth.uid() = user_id);

-- PYMES diagnosis: users can CRUD their own, admins can read all
CREATE POLICY "PYMES can manage own diagnosis" ON pymes_diagnosis FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Admin can view all diagnosis" ON pymes_diagnosis FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Services: anyone can read active services, admins can CRUD
CREATE POLICY "Anyone can view active services" ON services FOR SELECT USING (is_active = TRUE);
CREATE POLICY "Admin can manage services" ON services FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Service recommendations: users can read their own
CREATE POLICY "Users can view own recommendations" ON service_recommendations FOR SELECT USING (auth.uid() = user_id);

-- Leads: admins only
CREATE POLICY "Admin can manage leads" ON leads FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Payments: users can view their own, admins can view all
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
-- FUNCTIONS
-- ===========================================

-- Auto-create profile on user signup
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

-- Auto-update updated_at timestamp
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
```

---

## Environment Variables (.env.local)

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Stripe
STRIPE_SECRET_KEY=sk_test_xxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

# MILESTONE 1: Dynamic Forms + Property Registration
**Deliverable:** 3 functional forms + property registration with images
**Payment:** 25%

## 1.1 Project Setup

### Initialize project
```bash
npx create-next-app@latest webmarketing --typescript --tailwind --eslint --app --src-dir
cd webmarketing
```

### Install dependencies
```bash
# Supabase
npm install @supabase/supabase-js @supabase/ssr

# UI
npm install tailwindcss @tailwindcss/forms
npx shadcn@latest init
npx shadcn@latest add button input label select textarea card table badge dialog tabs toast separator dropdown-menu sheet avatar

# Form handling
npm install react-hook-form @hookform/resolvers zod

# Image handling
npm install react-dropzone

# Icons
npm install lucide-react
```

### Configure Supabase clients

**lib/supabase/client.ts** — Browser client for client components:
```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
    return createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
}
```

**lib/supabase/server.ts** — Server client for Server Components and Route Handlers:
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
    const cookieStore = await cookies()
    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() { return cookieStore.getAll() },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) =>
                        cookieStore.set(name, value, options)
                    )
                },
            },
        }
    )
}
```

**lib/supabase/admin.ts** — Admin client (service role, bypasses RLS):
```typescript
import { createClient } from '@supabase/supabase-js'

export const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)
```

### Setup auth middleware

**middleware.ts** — Protect dashboard/admin routes, redirect unauthenticated users:
```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
    let supabaseResponse = NextResponse.next({ request })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() { return request.cookies.getAll() },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => {
                        request.cookies.set(name, value)
                        supabaseResponse.cookies.set(name, value, options)
                    })
                },
            },
        }
    )

    const { data: { user } } = await supabase.auth.getUser()

    // Protect dashboard routes
    if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
        return NextResponse.redirect(new URL('/login', request.url))
    }

    // Protect admin routes
    if (request.nextUrl.pathname.startsWith('/admin')) {
        if (!user) {
            return NextResponse.redirect(new URL('/login', request.url))
        }
        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()

        if (profile?.role !== 'admin') {
            return NextResponse.redirect(new URL('/dashboard', request.url))
        }
    }

    return supabaseResponse
}

export const config = {
    matcher: ['/dashboard/:path*', '/admin/:path*'],
}
```

## 1.2 Auth Pages (Login / Register)

### Registration flow
- User selects role: propietario, inquilino, or pymes
- Supabase Auth signup with email + password
- Role stored in user_metadata → trigger creates profile row
- After signup, redirect to the corresponding form based on role

### Login flow
- Email + password login via Supabase Auth
- After login, redirect to /dashboard
- Admin users redirect to /admin

### Implementation details
- Use `supabase.auth.signUp()` with metadata: `{ data: { full_name, role } }`
- Use `supabase.auth.signInWithPassword()` for login
- Auth callback route handles the code exchange for session

## 1.3 Owner Form (Propietario)

### Form fields (react-hook-form + zod validation)
```typescript
const ownerFormSchema = z.object({
    // Property basic info
    title: z.string().min(5),
    description: z.string().min(20),
    property_type: z.enum(['apartamento', 'casa', 'oficina', 'local', 'terreno', 'bodega']),

    // Location
    address: z.string().min(5),
    city: z.string().min(2),
    state: z.string().optional(),

    // Details
    price: z.number().positive(),
    bedrooms: z.number().int().min(0).optional(),
    bathrooms: z.number().int().min(0).optional(),
    area_sqm: z.number().positive().optional(),

    // Amenities (checkboxes)
    amenities: z.array(z.string()),

    // Images (handled separately via upload)
})
```

### Form behavior
- Multi-step form with progress indicator: Basic Info → Location → Details → Photos
- Conditional fields: bedrooms/bathrooms only show for 'apartamento' and 'casa'
- Image upload section with drag-and-drop (react-dropzone)
- On submit: save property to DB + upload images to Supabase Storage + create lead entry

### Image upload flow
1. User drops/selects images (max 10, max 5MB each, jpg/png/webp)
2. Preview thumbnails with delete option
3. On form submit, upload each image to Supabase Storage bucket `property-images`
4. Store returned public URLs in property.images array
5. Upload path: `properties/{property_id}/{filename}`

```typescript
// Image upload to Supabase Storage
async function uploadPropertyImage(file: File, propertyId: string) {
    const fileExt = file.name.split('.').pop()
    const fileName = `${propertyId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`

    const { data, error } = await supabase.storage
        .from('property-images')
        .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false,
        })

    if (error) throw error

    const { data: { publicUrl } } = supabase.storage
        .from('property-images')
        .getPublicUrl(fileName)

    return publicUrl
}
```

## 1.4 Tenant Form (Inquilino)

### Form fields
```typescript
const tenantFormSchema = z.object({
    preferred_city: z.string().min(2),
    preferred_zone: z.string().optional(),
    min_budget: z.number().positive(),
    max_budget: z.number().positive(),
    bedrooms_needed: z.number().int().min(1),
    move_in_date: z.date(),
    pet_friendly: z.boolean(),
    parking_needed: z.boolean(),
    additional_requirements: z.string().optional(),
})
```

### Form behavior
- Single page form with clear sections
- Budget range with min/max validation (max must be > min)
- Date picker for move_in_date
- On submit: save preferences to DB + create lead entry

## 1.5 PYMES Diagnosis Form

### Form fields
```typescript
const pymesFormSchema = z.object({
    company_name: z.string().min(2),
    sector: z.enum(['retail', 'servicios', 'tecnologia', 'gastronomia', 'salud', 'educacion', 'construccion', 'otro']),
    employee_count: z.enum(['1-5', '6-20', '21-50', '51+']),
    monthly_revenue: z.enum(['menos_5k', '5k_20k', '20k_50k', '50k_100k', 'mas_100k']),

    // Digital presence
    has_website: z.boolean(),
    has_social_media: z.boolean(),
    social_media_platforms: z.array(z.string()),     // conditional: if has_social_media
    current_marketing_channels: z.array(z.string()),
    marketing_budget: z.enum(['ninguno', 'menos_500', '500_2000', '2000_5000', 'mas_5000']),

    // Needs
    main_challenge: z.enum([
        'atraer_clientes',
        'retener_clientes',
        'presencia_digital',
        'automatizar_procesos',
        'aumentar_ventas',
        'branding'
    ]),
    business_goals: z.array(z.string()),
})
```

### Form behavior
- Multi-step form: Company Info → Digital Presence → Marketing → Goals
- Conditional fields:
  - social_media_platforms appears only if has_social_media === true
  - marketing_budget options may change based on monthly_revenue
- Each answer contributes to urgency scoring (implemented in Milestone 2)
- On submit: save diagnosis to DB + create lead entry + trigger profiling API

## 1.6 Lead Auto-Creation

Every form submission automatically creates a lead entry:

```typescript
async function createLead(userId: string, role: user_role, source: string) {
    const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, email, phone')
        .eq('id', userId)
        .single()

    await supabase.from('leads').insert({
        user_id: userId,
        full_name: profile.full_name,
        email: profile.email,
        phone: profile.phone,
        role: role,
        source: source,        // 'formulario_propietario' | 'formulario_inquilino' | 'formulario_pymes'
        status: 'nuevo',
    })
}
```

## 1.7 Supabase Storage Setup

Create storage bucket for property images:
- Bucket name: `property-images`
- Public bucket: true (images need public URLs)
- File size limit: 5MB
- Allowed MIME types: image/jpeg, image/png, image/webp
- RLS policies:
  - INSERT: authenticated users can upload to their own property folder
  - SELECT: anyone can view (public)
  - DELETE: owner of the property or admin

---

# MILESTONE 2: Profiling Logic + PYMES Results
**Deliverable:** User classification + service recommendation + PYMES urgency display
**Payment:** 25%

## 2.1 PYMES Profiling Logic

### Urgency Score Calculation

**lib/profiling/pymes.ts** — Rule-based scoring system:

```typescript
interface DiagnosisInput {
    has_website: boolean
    has_social_media: boolean
    social_media_platforms: string[]
    current_marketing_channels: string[]
    marketing_budget: string
    main_challenge: string
    employee_count: string
    monthly_revenue: string
}

interface ProfilingResult {
    urgency_score: number          // 0-100
    urgency_level: 'bajo' | 'medio' | 'alto' | 'critico'
    recommendation_message: string
    recommended_service_ids: string[]
}

function calculatePymesProfile(input: DiagnosisInput): ProfilingResult {
    let score = 0

    // === Digital Presence (max 30 points) ===
    if (!input.has_website) score += 15
    if (!input.has_social_media) score += 10
    if (input.social_media_platforms.length <= 1) score += 5

    // === Marketing Maturity (max 30 points) ===
    if (input.current_marketing_channels.includes('ninguno')) score += 15
    else if (input.current_marketing_channels.length <= 1) score += 10

    if (input.marketing_budget === 'ninguno') score += 15
    else if (input.marketing_budget === 'menos_500') score += 10

    // === Business Size vs Effort (max 20 points) ===
    // Larger companies with less marketing = more urgent
    const sizeMultiplier = {
        '1-5': 0.5, '6-20': 0.75, '21-50': 1.0, '51+': 1.25
    }
    const revenueWeight = {
        'menos_5k': 5, '5k_20k': 10, '20k_50k': 15, '50k_100k': 18, 'mas_100k': 20
    }
    score += (revenueWeight[input.monthly_revenue] || 10) * (sizeMultiplier[input.employee_count] || 1)

    // === Challenge Weight (max 20 points) ===
    const challengeScores = {
        'atraer_clientes': 18,
        'presencia_digital': 20,
        'aumentar_ventas': 16,
        'retener_clientes': 12,
        'automatizar_procesos': 10,
        'branding': 14,
    }
    score += challengeScores[input.main_challenge] || 10

    // Normalize to 0-100
    score = Math.min(100, Math.round(score))

    // Determine level
    let urgency_level: ProfilingResult['urgency_level']
    if (score >= 75) urgency_level = 'critico'
    else if (score >= 50) urgency_level = 'alto'
    else if (score >= 25) urgency_level = 'medio'
    else urgency_level = 'bajo'

    // Generate recommendation message
    const recommendation_message = generateRecommendation(urgency_level, input)

    return { urgency_score: score, urgency_level, recommendation_message, recommended_service_ids: [] }
}
```

### Recommendation Message Generation

```typescript
function generateRecommendation(level: string, input: DiagnosisInput): string {
    const messages = {
        critico: `Su empresa necesita atención inmediata en marketing digital. ${
            !input.has_website ? 'No contar con un sitio web limita significativamente su alcance. ' : ''
        }${
            !input.has_social_media ? 'La ausencia en redes sociales reduce su visibilidad ante clientes potenciales. ' : ''
        }Le recomendamos comenzar con nuestros servicios de presencia digital básica y estrategia de captación de clientes.`,

        alto: `Su empresa tiene oportunidades importantes de crecimiento a través del marketing digital. ${
            input.marketing_budget === 'ninguno' ? 'Invertir en marketing puede generar un retorno significativo para su negocio. ' : ''
        }Le sugerimos fortalecer su estrategia actual con servicios enfocados en ${input.main_challenge.replace(/_/g, ' ')}.`,

        medio: `Su empresa tiene una base de marketing establecida, pero hay áreas de mejora. Le recomendamos optimizar sus canales actuales y considerar expandir su presencia digital para alcanzar sus objetivos de ${input.main_challenge.replace(/_/g, ' ')}.`,

        bajo: `Su empresa tiene una presencia de marketing sólida. Le sugerimos servicios de optimización y automatización para maximizar el retorno de su inversión actual.`,
    }
    return messages[level] || messages.medio
}
```

## 2.2 Residential Profiling Logic

### Owner profiling

**lib/profiling/residential.ts**:
- Classify property type and price range
- Recommend services based on property characteristics:
  - Vacant properties → marketing/listing services
  - High-value properties → premium photography, virtual tours
  - Multiple properties → portfolio management services

```typescript
function profileOwner(properties: Property[]): ServiceRecommendation[] {
    const recommendations: ServiceRecommendation[] = []

    for (const property of properties) {
        // Rule: No images → photography service
        if (!property.images || property.images.length === 0) {
            recommendations.push({
                service_category: 'fotografia_profesional',
                reason: 'Su propiedad no tiene imágenes. Fotos profesionales aumentan el interés en un 80%.'
            })
        }

        // Rule: High value → premium marketing
        if (property.price > 200000) {
            recommendations.push({
                service_category: 'marketing_premium',
                reason: 'Para propiedades de alto valor, una estrategia de marketing premium maximiza el alcance a compradores calificados.'
            })
        }

        // Rule: Available for rent → tenant matching
        if (property.is_available) {
            recommendations.push({
                service_category: 'busqueda_inquilinos',
                reason: 'Su propiedad está disponible. Nuestro servicio de matching conecta su propiedad con inquilinos perfilados.'
            })
        }
    }

    // Rule: Multiple properties → portfolio management
    if (properties.length > 2) {
        recommendations.push({
            service_category: 'gestion_portafolio',
            reason: `Usted gestiona ${properties.length} propiedades. Un servicio de gestión de portafolio optimiza su administración.`
        })
    }

    return recommendations
}
```

### Tenant profiling
- Match preferences with available property categories
- Recommend services based on needs:
  - Tight budget → negotiation assistance
  - Urgent move-in date → express search
  - Pets → pet-friendly property search

## 2.3 Profiling API Route

**api/profiling/route.ts**:

```typescript
export async function POST(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { type } = await request.json()  // 'pymes' | 'propietario' | 'inquilino'

    let result

    if (type === 'pymes') {
        // Fetch diagnosis data
        const { data: diagnosis } = await supabase
            .from('pymes_diagnosis')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single()

        result = calculatePymesProfile(diagnosis)

        // Update diagnosis with calculated values
        await supabase
            .from('pymes_diagnosis')
            .update({
                urgency_level: result.urgency_level,
                urgency_score: result.urgency_score,
                recommendation_message: result.recommendation_message,
            })
            .eq('id', diagnosis.id)

    } else if (type === 'propietario') {
        const { data: properties } = await supabase
            .from('properties')
            .select('*')
            .eq('owner_id', user.id)

        result = profileOwner(properties || [])

    } else if (type === 'inquilino') {
        const { data: preferences } = await supabase
            .from('tenant_preferences')
            .select('*')
            .eq('user_id', user.id)
            .single()

        result = profileTenant(preferences)
    }

    // Save service recommendations
    if (result?.recommended_service_ids) {
        for (const serviceId of result.recommended_service_ids) {
            await supabase.from('service_recommendations').upsert({
                user_id: user.id,
                service_id: serviceId,
                reason: result.recommendation_message,
                score: result.urgency_score || 0,
            })
        }
    }

    return NextResponse.json(result)
}
```

## 2.4 Service Matching Logic

After profiling, match user classification with services in the catalog:

```typescript
async function matchServices(
    supabase: SupabaseClient,
    userRole: user_role,
    urgencyLevel?: urgency_level
): Promise<Service[]> {
    let query = supabase
        .from('services')
        .select('*')
        .eq('is_active', true)
        .contains('target_roles', [userRole])

    if (urgencyLevel) {
        query = query.contains('target_urgency', [urgencyLevel])
    }

    const { data } = await query
    return data || []
}
```

## 2.5 PYMES Result Page

**results/pymes/[id]/page.tsx** — Display after diagnosis form submission:

### Visual layout
- Urgency level displayed with color-coded badge:
  - bajo → green
  - medio → yellow
  - alto → orange
  - critico → red
- Urgency score shown as progress bar (0-100)
- Recommendation message in a highlighted card
- List of recommended services with prices and "Contratar" button
- Each recommendation shows the reason (transparency)

### Data flow
1. PYMES form submitted → data saved to DB
2. Profiling API called → score calculated, recommendations generated
3. Redirect to results page with diagnosis ID
4. Results page fetches diagnosis + matched services
5. User sees urgency level, message, and recommended services

---

# MILESTONE 3: User Panel + Admin Panel + Lead Management
**Deliverable:** User dashboard, admin dashboard, lead state management
**Payment:** 25%

## 3.1 User Dashboard

### Dashboard home (/dashboard)
- Welcome message with user name and role
- Summary cards:
  - Propietario: number of properties, active leads, recommended services count
  - Inquilino: preference status, matched properties, recommended services count
  - PYMES: diagnosis status, urgency level, recommended services count
- Quick action buttons based on role

### My Properties (/dashboard/properties) — Propietario only
- Grid/list view of registered properties
- Each card shows: thumbnail, title, city, price, availability status
- Click to view/edit property details
- "Add new property" button → redirects to owner form
- Delete property (with confirmation dialog)

### My Profile (/dashboard/profile)
- View and edit personal information
- Change password
- View registration date and role

### Recommended Services (/dashboard/services)
- List of recommended services with reason for recommendation
- Each service: name, description, price, recommendation reason
- "Contratar" button → triggers Stripe checkout (Milestone 4)
- Show urgency level for PYMES users

### Payment History (/dashboard/payments)
- Table of past payments: date, service, amount, status
- Status badges: pending (yellow), completed (green), failed (red), refunded (gray)

## 3.2 Admin Dashboard

### Admin Home (/admin)
- Summary statistics cards:
  - Total users (by role)
  - Total properties registered
  - Total leads (by status)
  - Total payments (amount + count)
- Recent activity: latest 10 leads, latest registrations

### User Management (/admin/users)
- Data table with columns: name, email, role, registration date, status
- Filters: by role, by date range
- Search by name or email
- Click row to view user detail (profile + their properties/diagnosis/preferences)
- Cannot delete users (only view/edit role)

### Property Management (/admin/properties)
- Data table with columns: title, owner, city, price, availability, date
- Filters: by city, by availability, by price range
- Search by title or owner name
- Click row to view full property details with images
- Toggle availability status

### Lead Management (/admin/leads)
- Data table with columns: name, email, role, source, status, date, assigned to
- Filters: by status, by role, by source, by date range
- Search by name or email

#### Lead status flow implementation
```typescript
const LEAD_STATUS_TRANSITIONS: Record<lead_status, lead_status[]> = {
    'nuevo': ['contactado'],
    'contactado': ['en_proceso', 'cerrado'],
    'en_proceso': ['cerrado'],
    'cerrado': [],
}

// Status update with validation
async function updateLeadStatus(leadId: string, newStatus: lead_status) {
    const { data: lead } = await supabase
        .from('leads')
        .select('status')
        .eq('id', leadId)
        .single()

    const allowedTransitions = LEAD_STATUS_TRANSITIONS[lead.status]
    if (!allowedTransitions.includes(newStatus)) {
        throw new Error(`Cannot transition from ${lead.status} to ${newStatus}`)
    }

    await supabase
        .from('leads')
        .update({ status: newStatus })
        .eq('id', leadId)
}
```

- Status change via dropdown in the table row
- Status badges color-coded:
  - nuevo → blue
  - contactado → yellow
  - en_proceso → orange
  - cerrado → green
- Notes field: admin can add notes to each lead
- Assign lead to an admin user

### Service Catalog Management (/admin/services)
- Data table with columns: name, category, price, status (active/inactive), target roles
- CRUD operations:
  - Add new service: name, description, category (residencial/empresarial), subcategory, price, target roles, target urgency levels
  - Edit existing service
  - Toggle active/inactive (soft delete)
  - Cannot hard delete if service has payment records

## 3.3 Shared Components

### Data Table Component
Reusable table with:
- Sorting (click column header)
- Pagination (10/25/50 per page)
- Search (debounced, 300ms)
- Filter dropdowns
- Row actions (view, edit, delete)
- Loading skeleton
- Empty state message

### Sidebar Navigation
- Role-based menu items
- Active state highlighting
- Collapse on mobile (sheet component)
- User info at bottom (name, role, logout)

### Stats Card Component
- Icon, label, value, trend indicator
- Skeleton loading state

---

# MILESTONE 4: Stripe Payment + Webhooks + Final Integration
**Deliverable:** Working payment flow, webhook structure, full MVP integration
**Payment:** 25%

## 4.1 Stripe Setup

### Install Stripe
```bash
npm install stripe @stripe/stripe-js
```

### Stripe client

**lib/stripe.ts**:
```typescript
import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2024-12-18.acacia',
})
```

## 4.2 Checkout Flow

### Create Checkout Session

**api/stripe/checkout/route.ts**:
```typescript
export async function POST(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { serviceId } = await request.json()

    // Fetch service details
    const { data: service } = await supabase
        .from('services')
        .select('*')
        .eq('id', serviceId)
        .single()

    if (!service) return NextResponse.json({ error: 'Service not found' }, { status: 404 })

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
            price_data: {
                currency: service.currency.toLowerCase(),
                product_data: {
                    name: service.name,
                    description: service.description || undefined,
                },
                unit_amount: Math.round(service.price * 100), // Stripe uses cents
            },
            quantity: 1,
        }],
        mode: 'payment',
        success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/payments?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/services?cancelled=true`,
        metadata: {
            user_id: user.id,
            service_id: serviceId,
        },
    })

    // Create pending payment record
    await supabase.from('payments').insert({
        user_id: user.id,
        service_id: serviceId,
        stripe_session_id: session.id,
        amount: service.price,
        currency: service.currency,
        status: 'pending',
    })

    return NextResponse.json({ url: session.url })
}
```

### Client-side checkout trigger

```typescript
async function handleCheckout(serviceId: string) {
    const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceId }),
    })
    const { url } = await response.json()
    window.location.href = url  // Redirect to Stripe Checkout
}
```

## 4.3 Stripe Webhook Handler

**api/stripe/webhook/route.ts**:

```typescript
import { headers } from 'next/headers'

export async function POST(request: Request) {
    const body = await request.text()
    const headersList = await headers()
    const signature = headersList.get('stripe-signature')!

    let event: Stripe.Event

    try {
        event = stripe.webhooks.constructEvent(
            body,
            signature,
            process.env.STRIPE_WEBHOOK_SECRET!
        )
    } catch (err) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }

    switch (event.type) {
        case 'checkout.session.completed': {
            const session = event.data.object as Stripe.Checkout.Session

            // Update payment record
            await supabaseAdmin
                .from('payments')
                .update({
                    status: 'completed',
                    stripe_payment_intent_id: session.payment_intent as string,
                })
                .eq('stripe_session_id', session.id)

            // Mark service recommendation as purchased
            if (session.metadata?.service_id && session.metadata?.user_id) {
                await supabaseAdmin
                    .from('service_recommendations')
                    .update({ is_purchased: true })
                    .eq('user_id', session.metadata.user_id)
                    .eq('service_id', session.metadata.service_id)
            }

            // Update lead status to 'en_proceso' if exists
            if (session.metadata?.user_id) {
                await supabaseAdmin
                    .from('leads')
                    .update({ status: 'en_proceso' })
                    .eq('user_id', session.metadata.user_id)
                    .eq('status', 'nuevo')
            }

            break
        }

        case 'payment_intent.payment_failed': {
            const paymentIntent = event.data.object as Stripe.PaymentIntent
            await supabaseAdmin
                .from('payments')
                .update({ status: 'failed' })
                .eq('stripe_payment_intent_id', paymentIntent.id)
            break
        }
    }

    return NextResponse.json({ received: true })
}

// Disable body parsing for webhook signature verification
export const config = {
    api: { bodyParser: false },
}
```

## 4.4 Payment Success/Failure Pages

### Success flow
1. Stripe redirects to `/dashboard/payments?success=true&session_id=xxx`
2. Show success message with checkmark animation
3. Display purchased service details
4. Link to return to dashboard

### Cancel flow
1. Stripe redirects to `/dashboard/services?cancelled=true`
2. Show info message: "El pago fue cancelado. Puedes intentar de nuevo cuando quieras."
3. Services list remains visible for retry

## 4.5 Webhook Endpoint for Future Integrations (Make/Zapier)

**api/webhooks/route.ts** — Generic webhook endpoint:

```typescript
export async function POST(request: Request) {
    const apiKey = request.headers.get('x-api-key')

    // Basic API key validation (stored in environment)
    if (apiKey !== process.env.WEBHOOK_API_KEY) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { event, data } = body

    // Log webhook event for debugging
    console.log(`Webhook received: ${event}`, data)

    // Event handling structure ready for future implementation
    switch (event) {
        case 'lead.created':
        case 'lead.updated':
        case 'payment.completed':
        case 'user.registered':
            // Future: forward to Make/Zapier or process internally
            break
        default:
            return NextResponse.json({ error: 'Unknown event' }, { status: 400 })
    }

    return NextResponse.json({ received: true, event })
}
```

### Outgoing webhook dispatcher (for future use)

```typescript
// lib/webhooks.ts
// Ready to use when Make/Zapier integration is needed

async function dispatchWebhook(event: string, data: any) {
    const webhookUrl = process.env.EXTERNAL_WEBHOOK_URL
    if (!webhookUrl) return

    await fetch(webhookUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.WEBHOOK_API_KEY || '',
        },
        body: JSON.stringify({ event, data, timestamp: new Date().toISOString() }),
    })
}
```

## 4.6 Final Integration & Testing Checklist

### End-to-end flows to verify

**Flow 1: Owner Registration → Property → Payment**
1. Register as propietario
2. Fill owner form with property + images
3. Verify property appears in dashboard
4. Verify lead created in admin panel
5. View recommended services
6. Complete Stripe payment
7. Verify payment recorded in system
8. Verify payment appears in admin panel

**Flow 2: Tenant Registration → Preferences → Recommendations**
1. Register as inquilino
2. Fill tenant preference form
3. Verify preferences saved in dashboard
4. Verify lead created in admin panel
5. View recommended services based on preferences

**Flow 3: PYMES Registration → Diagnosis → Results → Payment**
1. Register as pymes
2. Fill diagnosis form
3. Verify urgency score and level displayed
4. Verify recommendation message is clear and relevant
5. Verify recommended services match urgency level
6. Complete Stripe payment for a service
7. Verify payment recorded

**Flow 4: Admin Operations**
1. Login as admin
2. View dashboard statistics
3. View and filter users by role
4. View and manage properties
5. View leads, change status through full flow (nuevo → contactado → en_proceso → cerrado)
6. Add/edit/deactivate services in catalog
7. View all payments

**Flow 5: Stripe Verification**
1. Test successful payment with test card 4242 4242 4242 4242
2. Test failed payment with test card 4000 0000 0000 0002
3. Verify webhook receives events
4. Test refund via Stripe Dashboard → verify no system errors
5. Verify payment status updates correctly in DB

### Stripe test mode configuration
- Use Stripe test mode keys throughout development
- Test webhook locally with Stripe CLI: `stripe listen --forward-to localhost:3000/api/stripe/webhook`
- Switch to live keys only for production deployment

### Deployment checklist
- [ ] Environment variables set in Vercel
- [ ] Supabase project configured (tables, RLS, storage bucket)
- [ ] Stripe webhook endpoint registered in Stripe Dashboard
- [ ] Stripe live keys configured (when ready for production)
- [ ] Domain configured in Vercel
- [ ] Supabase Auth redirect URLs updated for production domain
- [ ] Storage bucket CORS configured for production domain
- [ ] Test all 5 flows in production environment
