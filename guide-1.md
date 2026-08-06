# MVP Web Marketing Platform - Implementation Guide v2
# Marketing Residencial y Empresarial (Canadian Market)

> **Language**: All UI text in Canadian English
> **Currency**: CAD (Canadian Dollars)
> **Target Market**: Canada (Montreal focus)

---

## Tech Stack

| Area | Technology | Purpose |
|------|-----------|---------|
| Framework | Next.js 16 (App Router) | Full-stack framework |
| Language | TypeScript 5 | Type safety |
| Database + Auth + Storage | Supabase | PostgreSQL, Auth, S3-compatible storage |
| Payments | Stripe | Checkout Sessions + Webhooks + Apple Pay/Google Pay |
| Styling | Tailwind CSS 4 + shadcn/ui | Rapid UI development |
| Forms | react-hook-form + Zod | Form handling and validation |
| Deployment | Vercel | Hosting |
| Email | Resend or Supabase Edge Functions | Transactional email notifications |

---

## Brand Colors

| Element | Color | Hex |
|---------|-------|-----|
| Header / Primary | Blue | `#0B38D9` |
| CTA Buttons | Emerald Green | `#0FA37F` |
| Background | White | `#FFFFFF` |
| Secondary Text | Gray | `#6E7A8A` |
| Accent / Highlights | Light Blue | `#E8EDFF` |

---

## User Roles

| Role | Key | Description |
|------|-----|-------------|
| Owner (Basic) | `propietario` | 1 property |
| Preferred Owner | `propietario_preferido` | 2-3 properties |
| Investor | `inversionista` | 4+ properties (Elite Assets & Legacy) |
| Tenant (Regular) | `inquilino` | Standard tenant |
| Tenant (Premium) | `inquilino_premium` | Auto-classified by 3+ of 8 criteria |
| PYMES | `pymes` | Small/medium business |
| Admin | `admin` | Platform administrator |

### Tenant Premium Auto-Classification (3+ of 8 criteria)
1. Stable employment (verifiable)
2. Budget >= $2,500 CAD/month
3. Seeks premium amenities (gym, pool, concierge, etc.)
4. Preferred urban zones (downtown, Griffintown, Old Montreal, etc.)
5. Needs 2-4 bedrooms
6. Interested in smart home features
7. Modern/contemporary style preference
8. Contract duration 12-24 months

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
│   │   │   │   ├── services/page.tsx         # Assigned/recommended services
│   │   │   │   ├── payments/page.tsx         # Payment history
│   │   │   │   └── images/page.tsx           # Image management (room-by-room)
│   │   │   ├── admin/
│   │   │   │   ├── page.tsx                  # Admin dashboard
│   │   │   │   ├── users/page.tsx            # User management (with roles)
│   │   │   │   ├── properties/page.tsx       # Property management
│   │   │   │   ├── leads/page.tsx            # Lead management
│   │   │   │   ├── services/page.tsx         # Service catalog CRUD
│   │   │   │   ├── forms/page.tsx            # Form management
│   │   │   │   ├── matching/page.tsx         # Matching rules config
│   │   │   │   ├── pricing/page.tsx          # Pricing & promotions
│   │   │   │   ├── payments/page.tsx         # Payment management
│   │   │   │   ├── content/page.tsx          # Content management
│   │   │   │   ├── legal/page.tsx            # Legal documents
│   │   │   │   └── export/page.tsx           # Data export
│   │   │   └── layout.tsx                    # Sidebar + auth check
│   │   ├── forms/
│   │   │   ├── propietario/page.tsx          # Owner discovery brief (Typeform-style)
│   │   │   ├── inquilino/page.tsx            # Tenant form
│   │   │   └── pymes/page.tsx                # PYMES "Sales Leak Calculator"
│   │   ├── results/
│   │   │   └── pymes/[id]/page.tsx           # PYMES diagnosis result
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   └── callback/route.ts
│   │   │   ├── profiling/
│   │   │   │   └── route.ts                  # Profiling + service assignment
│   │   │   ├── stripe/
│   │   │   │   ├── checkout/route.ts         # Create Checkout Session
│   │   │   │   └── webhook/route.ts          # Stripe webhook handler
│   │   │   ├── notifications/
│   │   │   │   └── route.ts                  # Email notification dispatcher
│   │   │   └── webhooks/
│   │   │       └── route.ts                  # External webhook endpoint
│   │   ├── layout.tsx
│   │   └── page.tsx                          # Landing page
│   ├── components/
│   │   ├── ui/                               # shadcn/ui components
│   │   ├── forms/
│   │   │   ├── discovery-brief.tsx           # Typeform-style owner form
│   │   │   ├── tenant-form.tsx
│   │   │   ├── pymes-calculator.tsx          # Sales Leak Calculator
│   │   │   ├── image-upload.tsx              # Room-by-room image upload
│   │   │   └── consent-checkboxes.tsx        # Legal consent components
│   │   ├── dashboard/
│   │   │   ├── sidebar.tsx
│   │   │   ├── stats-card.tsx
│   │   │   └── data-table.tsx
│   │   ├── landing/
│   │   │   ├── hero.tsx
│   │   │   ├── services-section.tsx
│   │   │   ├── testimonials.tsx
│   │   │   └── cta-section.tsx
│   │   └── layout/
│   │       ├── header.tsx
│   │       └── footer.tsx
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts
│   │   │   ├── server.ts
│   │   │   └── admin.ts
│   │   ├── stripe.ts
│   │   ├── profiling/
│   │   │   ├── rules.ts                      # Classification rules
│   │   │   ├── residential.ts                # Owner/Investor service assignment
│   │   │   ├── tenant.ts                     # Tenant profiling + Premium detection
│   │   │   └── pymes.ts                      # Sales Leak Calculator logic
│   │   ├── notifications/
│   │   │   └── email.ts                      # Email notification helpers
│   │   ├── images/
│   │   │   └── validation.ts                 # Image auto-validation (resolution, orientation, size)
│   │   └── utils.ts
│   ├── types/
│   │   ├── database.ts                       # Supabase DB types
│   │   ├── forms.ts                          # Form schemas (Zod)
│   │   └── profiling.ts                      # Profiling result types
│   └── middleware.ts                         # Auth middleware
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql
│       └── 002_mvp_update.sql                # Updated schema per MVP
├── public/
├── .env.local
├── next.config.ts
├── tsconfig.json
└── package.json
```

---

## Database Schema (Updated for MVP)

```sql
-- ===========================================
-- ENUMS
-- ===========================================
CREATE TYPE user_role AS ENUM (
  'propietario',           -- 1 property
  'propietario_preferido', -- 2-3 properties
  'inversionista',         -- 4+ properties
  'inquilino',             -- regular tenant
  'inquilino_premium',     -- auto-classified premium tenant
  'pymes',
  'admin'
);
CREATE TYPE lead_status AS ENUM ('nuevo', 'contactado', 'en_proceso', 'cerrado');
CREATE TYPE urgency_level AS ENUM ('moderate', 'high', 'critical');
CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'failed', 'refunded');
CREATE TYPE property_service_tier AS ENUM ('basic', 'preferred_owners', 'elite');
CREATE TYPE elite_tier AS ENUM ('essentials', 'signature', 'lujo');
CREATE TYPE pymes_plan AS ENUM ('rescue', 'growth', 'scale');
CREATE TYPE image_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE consent_type AS ENUM ('data_processing', 'image_usage', 'marketing', 'third_party');

-- ===========================================
-- PROFILES
-- ===========================================
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT,
    role user_role NOT NULL DEFAULT 'inquilino',
    company_name TEXT,                    -- PYMES only
    property_count INTEGER DEFAULT 0,     -- Auto-updated, drives role classification
    is_premium_tenant BOOLEAN DEFAULT FALSE,
    premium_criteria_met INTEGER DEFAULT 0,  -- Count of 8 criteria met
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- PROPERTIES
-- ===========================================
CREATE TABLE properties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    property_type TEXT NOT NULL,           -- 'apartment', 'condo', 'house', 'townhouse', 'duplex', 'commercial'
    address TEXT NOT NULL,
    city TEXT NOT NULL DEFAULT 'Montreal',
    province TEXT DEFAULT 'Quebec',
    country TEXT DEFAULT 'Canada',
    postal_code TEXT,
    monthly_rent DECIMAL(12,2),           -- CAD monthly rent
    bedrooms INTEGER,
    bathrooms INTEGER,
    area_sqft DECIMAL(10,2),
    amenities TEXT[],
    is_available BOOLEAN DEFAULT TRUE,
    service_tier property_service_tier,     -- Auto-assigned based on owner's property count
    elite_tier elite_tier,                 -- Only for inversionista (4+ properties)
    cfp_monthly DECIMAL(12,2),             -- Calculated: monthly_rent * 0.10
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- PROPERTY IMAGES (Room-by-room with validation)
-- ===========================================
CREATE TABLE property_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    room_category TEXT NOT NULL,           -- 'living_room', 'bedroom', 'kitchen', 'bathroom', 'exterior', 'common_areas', etc.
    image_url TEXT NOT NULL,
    thumbnail_url TEXT,
    original_filename TEXT,
    file_size_bytes INTEGER,
    width INTEGER,
    height INTEGER,
    orientation TEXT,                      -- 'landscape', 'portrait'
    resolution_ok BOOLEAN DEFAULT FALSE,
    status image_status DEFAULT 'pending', -- Traffic light feedback
    validation_notes TEXT,
    sort_order INTEGER DEFAULT 0,
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- DISCOVERY BRIEF (Owner Typeform-style form)
-- ===========================================
CREATE TABLE discovery_briefs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Q1: Property objective
    property_objective TEXT NOT NULL,      -- 'rent', 'sell', 'both', 'not_sure'

    -- Q2: Property type
    property_type TEXT NOT NULL,

    -- Q3: Current state
    current_state TEXT NOT NULL,           -- 'occupied', 'vacant', 'under_renovation', 'new_construction'

    -- Q4: Monthly rent (if applicable)
    monthly_rent DECIMAL(12,2),

    -- Q5: Main challenge
    main_challenge TEXT NOT NULL,          -- 'find_tenants', 'improve_visibility', 'increase_value', 'manage_portfolio', 'other'

    -- Q6: How many properties? (drives role classification)
    property_count INTEGER NOT NULL,

    -- Q7: Has professional photos?
    has_professional_photos BOOLEAN DEFAULT FALSE,

    -- Q8: Currently listed where?
    current_listings TEXT[],              -- 'centris', 'kijiji', 'facebook', 'realtor_com', 'none', 'other'

    -- Q9: Monthly marketing budget
    marketing_budget TEXT,                -- 'under_500', '500_1000', '1000_2500', '2500_5000', 'over_5000'

    -- Q10: Timeline
    timeline TEXT,                        -- 'immediate', '1_3_months', '3_6_months', 'no_rush'

    -- Q11: Additional comments
    additional_comments TEXT,

    -- Conditional branching results (based on Q6 property_count)
    -- 1 property → Basic path
    -- 2-3 properties → Preferred Owners path
    -- 4+ properties → Elite Assets & Legacy path
    assigned_path TEXT,                   -- 'basic', 'preferred_owners', 'elite'

    -- Legal consents (4 checkboxes)
    consent_data_processing BOOLEAN DEFAULT FALSE,
    consent_image_usage BOOLEAN DEFAULT FALSE,
    consent_marketing BOOLEAN DEFAULT FALSE,
    consent_third_party BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- TENANT PREFERENCES (Updated)
-- ===========================================
CREATE TABLE tenant_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Basic preferences
    preferred_city TEXT DEFAULT 'Montreal',
    preferred_zones TEXT[],                -- Array of preferred neighborhoods
    min_budget DECIMAL(12,2),
    max_budget DECIMAL(12,2),
    bedrooms_needed INTEGER,
    bathrooms_needed INTEGER,
    move_in_date DATE,

    -- Premium classification criteria
    employment_type TEXT,                  -- 'employed_stable', 'self_employed', 'student', 'retired', 'other'
    employment_verifiable BOOLEAN DEFAULT FALSE,
    seeks_premium_amenities BOOLEAN DEFAULT FALSE,
    preferred_amenities TEXT[],            -- 'gym', 'pool', 'concierge', 'parking', 'rooftop', etc.
    prefers_urban_zone BOOLEAN DEFAULT FALSE,
    smart_home_interest BOOLEAN DEFAULT FALSE,
    style_preference TEXT,                 -- 'modern', 'classic', 'minimalist', 'industrial', etc.
    contract_duration TEXT,                -- '6_months', '12_months', '18_months', '24_months'

    -- Calculated fields
    premium_criteria_count INTEGER DEFAULT 0,  -- How many of the 8 premium criteria are met
    is_premium BOOLEAN DEFAULT FALSE,          -- true if premium_criteria_count >= 3

    -- Consent
    consent_data_processing BOOLEAN DEFAULT FALSE,
    consent_marketing BOOLEAN DEFAULT FALSE,   -- Two-level consent for tenants

    pet_friendly BOOLEAN DEFAULT FALSE,
    parking_needed BOOLEAN DEFAULT FALSE,
    additional_requirements TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- PYMES DIAGNOSIS ("Sales Leak Calculator")
-- ===========================================
CREATE TABLE pymes_diagnosis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    company_name TEXT NOT NULL,
    sector TEXT NOT NULL,
    monthly_revenue DECIMAL(12,2) NOT NULL,  -- "Facturacion mensual" in CAD

    -- 7 diagnostic questions (1-5 scale each)
    -- Block 1: Digital Visibility (Q1 + Q2)
    q1_online_presence INTEGER NOT NULL CHECK (q1_online_presence BETWEEN 1 AND 5),
    q2_seo_positioning INTEGER NOT NULL CHECK (q2_seo_positioning BETWEEN 1 AND 5),

    -- Block 2: Lead Generation (Q3 + Q4)
    q3_lead_generation INTEGER NOT NULL CHECK (q3_lead_generation BETWEEN 1 AND 5),
    q4_lead_conversion INTEGER NOT NULL CHECK (q4_lead_conversion BETWEEN 1 AND 5),

    -- Block 3: Retention & Loyalty (Q5 + Q6)
    q5_client_retention INTEGER NOT NULL CHECK (q5_client_retention BETWEEN 1 AND 5),
    q6_repeat_purchases INTEGER NOT NULL CHECK (q6_repeat_purchases BETWEEN 1 AND 5),

    -- Block 4: Marketing Strategy (Q7)
    q7_marketing_strategy INTEGER NOT NULL CHECK (q7_marketing_strategy BETWEEN 1 AND 5),

    -- Calculated fields
    total_score INTEGER,                    -- Sum of Q1-Q7 (7-35)
    urgency_level urgency_level,            -- Based on total_score ranges
    estimated_loss DECIMAL(12,2),           -- PE = monthly_revenue * 0.30 * 12
    recommended_plan pymes_plan,            -- rescue / growth / scale
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
    category TEXT NOT NULL,               -- 'residential', 'commercial'
    subcategory TEXT,
    tier TEXT,                            -- 'basic', 'preferred', 'elite_essentials', 'elite_signature', 'elite_lujo'
    price DECIMAL(12,2) NOT NULL,
    currency TEXT DEFAULT 'CAD',
    is_active BOOLEAN DEFAULT TRUE,
    target_roles user_role[],
    features TEXT[],                      -- List of included features
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- PYMES PLANS (Fixed pricing structure)
-- ===========================================
CREATE TABLE pymes_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_type pymes_plan NOT NULL,         -- rescue / growth / scale
    name TEXT NOT NULL,
    price DECIMAL(12,2) NOT NULL,          -- CAD total price
    upfront_amount DECIMAL(12,2),          -- Initial payment
    installment_amount DECIMAL(12,2),      -- Monthly installment
    installment_months INTEGER,            -- Number of monthly payments
    features TEXT[] NOT NULL,              -- Array of included features
    urgency_levels urgency_level[],        -- Which urgency levels map to this plan
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
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
    source TEXT,                          -- 'discovery_brief', 'tenant_form', 'pymes_calculator', 'landing_page'
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
    pymes_plan_id UUID REFERENCES pymes_plans(id),
    stripe_session_id TEXT NOT NULL,
    stripe_payment_intent_id TEXT,
    stripe_subscription_id TEXT,           -- For installment plans
    amount DECIMAL(12,2) NOT NULL,
    currency TEXT DEFAULT 'CAD',
    payment_type TEXT,                     -- 'one_time', 'upfront', 'installment'
    installment_number INTEGER,            -- Which installment (1, 2, 3...)
    status payment_status DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- LEGAL CONSENTS LOG
-- ===========================================
CREATE TABLE consent_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    consent_type consent_type NOT NULL,
    granted BOOLEAN NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    granted_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- EMAIL NOTIFICATIONS LOG
-- ===========================================
CREATE TABLE email_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_email TEXT NOT NULL,
    recipient_type TEXT,                   -- 'client', 'commercial_team', 'admin'
    template TEXT NOT NULL,               -- 'discovery_brief_submitted', 'diagnosis_completed', 'payment_received', etc.
    subject TEXT NOT NULL,
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'sent'            -- 'sent', 'failed', 'bounced'
);
```

---

## Seed Data for PYMES Plans

```sql
INSERT INTO pymes_plans (plan_type, name, price, upfront_amount, installment_amount, installment_months, features, urgency_levels) VALUES
('rescue', 'Plan Rescue', 1500.00, 750.00, 250.00, 3, ARRAY[
  'Emergency digital audit',
  'Google Business Profile optimization',
  'Basic SEO correction',
  'Social media rescue (2 platforms)',
  '30-day action plan'
], ARRAY['critical']::urgency_level[]),

('growth', 'Plan Growth', 2500.00, 1000.00, 375.00, 4, ARRAY[
  'Complete digital audit',
  'Website optimization or landing page',
  'SEO strategy (on-page + local)',
  'Social media management (3 platforms)',
  'Google Ads basic campaign',
  'Monthly performance reports',
  '90-day growth roadmap'
], ARRAY['high']::urgency_level[]),

('scale', 'Plan Scale', 3800.00, 1500.00, 460.00, 5, ARRAY[
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
], ARRAY['moderate']::urgency_level[]);
```

---

# MILESTONE 1: Landing Page + Forms + Property Registration
**Deliverable:** Redesigned landing page, 3 functional forms (Discovery Brief, Tenant, PYMES Calculator), property registration with room-by-room image upload, legal consents, email notifications
**Payment:** 25%

## 1.1 Global Changes

### Language Change
- Convert ALL UI text from Spanish to Canadian English
- Update all database enum display labels to English
- Keep internal database enum values as-is (Spanish) for backward compatibility

### Color Theme Change
- Replace current rose/pink theme with new brand colors:
  - Primary: `#0B38D9` (blue) — header, navigation, primary elements
  - CTA: `#0FA37F` (emerald green) — all call-to-action buttons
  - Background: `#FFFFFF` (white)
  - Secondary text: `#6E7A8A` (gray)
- Update `globals.css` CSS variables accordingly
- Update `icon.svg` favicon colors

### Currency
- All monetary values displayed in CAD
- Stripe configured for CAD currency

## 1.2 Landing Page Redesign

### Hero Section
- Clear headline about dual services: Residential Marketing + Business Marketing
- Two prominent CTA paths:
  - "Property Owners & Investors" → Discovery Brief form
  - "Business Owners" → Sales Leak Calculator
- Professional imagery (Montreal real estate / business context)

### Services Overview
- Two columns: Residential Services | Business Services
- Brief descriptions with "Learn More" links

### Social Proof
- Testimonials section
- Key statistics (properties managed, businesses served)

### Footer
- Contact information
- Legal links (Privacy Policy, Terms of Service)
- Social media links

## 1.3 Owner Form — "Discovery Brief" (Brief de Descubrimiento)

### Form Style
- **Typeform-style**: one question per screen, smooth transitions
- Progress bar at top
- Back/Next navigation

### 11 Questions + Conditional Branching

| # | Question | Type | Options |
|---|----------|------|---------|
| Q1 | What is your property objective? | Single select | Rent, Sell, Both, Not sure |
| Q2 | What type of property? | Single select | Apartment, Condo, House, Townhouse, Duplex, Commercial |
| Q3 | Current state of the property? | Single select | Occupied, Vacant, Under renovation, New construction |
| Q4 | What is the monthly rent? (if rental) | Number input | CAD amount |
| Q5 | What is your main challenge? | Single select | Find tenants, Improve visibility, Increase property value, Manage portfolio, Other |
| Q6 | How many properties do you own? | Number input | Integer |
| Q7 | Do you have professional photos? | Yes/No | Boolean |
| Q8 | Where is the property currently listed? | Multi-select | Centris, Kijiji, Facebook Marketplace, Realtor.ca, None, Other |
| Q9 | Monthly marketing budget? | Single select | Under $500, $500-$1000, $1000-$2500, $2500-$5000, Over $5000 |
| Q10 | How soon do you need results? | Single select | Immediately, 1-3 months, 3-6 months, No rush |
| Q11 | Any additional comments? | Text area | Free text |

### Conditional Branching (based on Q6 — property count)

**Path A: Basic (1 property)**
- Show Basic service tier information
- Simple service recommendation

**Path B: Preferred Owners (2-3 properties)**
- Show Preferred Owners tier information
- Portfolio-oriented recommendations

**Path C: Elite Assets & Legacy (4+ properties)**
- Show Elite tier information
- Ask sub-classification question: monthly rent range per property
  - Essentials: $2,500 - $3,999 CAD
  - Signature: $4,000 - $7,000 CAD
  - Lujo (Luxury): $7,001 - $12,000 CAD
- Premium portfolio management recommendations

### Legal Consents (4 checkboxes — all required)
1. "I consent to the processing of my personal data as described in the Privacy Policy"
2. "I authorize the use of property images for marketing purposes"
3. "I agree to receive marketing communications"
4. "I consent to sharing data with authorized third-party partners"

### On Submit
1. Save discovery brief to database
2. Auto-classify user role based on property count
3. Assign service tier (basic / preferred_owners / elite)
4. Create lead entry
5. **Send email notification** to:
   - Client (confirmation with summary)
   - Commercial team (new lead alert with brief details)

## 1.4 Tenant Form

### Form Fields

```typescript
const tenantFormSchema = z.object({
  // Basic preferences
  preferred_city: z.string().default('Montreal'),
  preferred_zones: z.array(z.string()),
  min_budget: z.number().positive(),
  max_budget: z.number().positive(),
  bedrooms_needed: z.number().int().min(1),
  bathrooms_needed: z.number().int().min(1).optional(),
  move_in_date: z.date(),

  // Premium classification criteria (8 fields)
  employment_type: z.enum(['employed_stable', 'self_employed', 'student', 'retired', 'other']),
  employment_verifiable: z.boolean(),
  seeks_premium_amenities: z.boolean(),
  preferred_amenities: z.array(z.string()).optional(),
  prefers_urban_zone: z.boolean(),
  smart_home_interest: z.boolean(),
  style_preference: z.enum(['modern', 'classic', 'minimalist', 'industrial', 'other']).optional(),
  contract_duration: z.enum(['6_months', '12_months', '18_months', '24_months']),

  // Other
  pet_friendly: z.boolean(),
  parking_needed: z.boolean(),
  additional_requirements: z.string().optional(),

  // Consents (2-level)
  consent_data_processing: z.boolean().refine(v => v === true),
  consent_marketing: z.boolean(),  // Optional second level
})
```

### Premium Auto-Classification Logic
After form submission, count how many of the 8 criteria are met:
1. `employment_type === 'employed_stable' && employment_verifiable === true`
2. `max_budget >= 2500`
3. `seeks_premium_amenities === true`
4. `prefers_urban_zone === true`
5. `bedrooms_needed >= 2 && bedrooms_needed <= 4`
6. `smart_home_interest === true`
7. `style_preference === 'modern'` (or 'minimalist')
8. `contract_duration === '12_months' || contract_duration === '18_months' || contract_duration === '24_months'`

If **3 or more** criteria met → classify as `inquilino_premium`

### On Submit
1. Save preferences to database
2. Calculate premium criteria count
3. Auto-classify tenant (regular or premium)
4. Create lead entry
5. **Send email notification** to client + commercial team

## 1.5 PYMES Form — "Sales Leak Calculator" (Calculadora de Fugas de Ventas)

### Form Structure
- Company name and sector (intro fields)
- Monthly revenue input (numeric, CAD)
- **7 diagnostic questions** — each on a 1-5 Likert scale

### 7 Questions (4 Blocks)

**Block 1: Digital Visibility**
| Q# | Question | Scale |
|----|----------|-------|
| Q1 | How would you rate your business's online presence? | 1 (Non-existent) to 5 (Excellent) |
| Q2 | How well does your business rank on search engines? | 1 (Not at all) to 5 (Top positions) |

**Block 2: Lead Generation**
| Q# | Question | Scale |
|----|----------|-------|
| Q3 | How effective is your current lead generation? | 1 (No leads) to 5 (Steady flow) |
| Q4 | What percentage of leads convert to customers? | 1 (Under 5%) to 5 (Over 40%) |

**Block 3: Retention & Loyalty**
| Q# | Question | Scale |
|----|----------|-------|
| Q5 | How well do you retain existing clients? | 1 (High churn) to 5 (Excellent retention) |
| Q6 | How often do clients make repeat purchases? | 1 (Rarely) to 5 (Frequently) |

**Block 4: Marketing Strategy**
| Q# | Question | Scale |
|----|----------|-------|
| Q7 | How structured is your marketing strategy? | 1 (No strategy) to 5 (Fully planned & executed) |

### Scoring Logic

```typescript
interface SalesLeakResult {
  total_score: number           // 7-35 (sum of Q1-Q7)
  urgency_level: 'critical' | 'high' | 'moderate'
  estimated_loss: number        // PE = monthly_revenue * 0.30 * 12
  recommended_plan: 'rescue' | 'growth' | 'scale'
  recommendation_message: string
}

function calculateSalesLeak(input: DiagnosisInput): SalesLeakResult {
  const total_score = input.q1 + input.q2 + input.q3 + input.q4 + input.q5 + input.q6 + input.q7

  // Estimated annual loss: 30% of monthly revenue * 12 months
  const estimated_loss = input.monthly_revenue * 0.30 * 12

  // Urgency classification based on total score
  let urgency_level: 'critical' | 'high' | 'moderate'
  let recommended_plan: 'rescue' | 'growth' | 'scale'

  if (total_score <= 14) {
    urgency_level = 'critical'
    recommended_plan = 'rescue'
  } else if (total_score <= 24) {
    urgency_level = 'high'
    recommended_plan = 'growth'
  } else {
    urgency_level = 'moderate'
    recommended_plan = 'scale'
  }

  return { total_score, urgency_level, estimated_loss, recommended_plan, recommendation_message: '' }
}
```

### PYMES Plans (3 tiers)

| Plan | Price (CAD) | Upfront | Monthly Installments | Target |
|------|------------|---------|---------------------|--------|
| Rescue | $1,500 | $750 | $250 × 3 months | Critical urgency |
| Growth | $2,500 | $1,000 | $375 × 4 months | High urgency |
| Scale | $3,800 | $1,500 | $460 × 5 months | Moderate urgency |

### On Submit
1. Save diagnosis to database
2. Calculate total score, urgency level, and estimated loss
3. Assign recommended plan
4. Create lead entry
5. **Send email notification** to client + commercial team
6. Redirect to results page

## 1.6 Image Upload System (Room-by-Room)

### Room Categories
- Living Room
- Bedroom(s) — multiple allowed
- Kitchen
- Bathroom(s) — multiple allowed
- Dining Room
- Office/Study
- Balcony/Terrace
- Exterior/Facade
- Common Areas (lobby, gym, pool, etc.)
- Parking/Garage

### 5-Rule Image Checklist (displayed to user before upload)
1. Images must be well-lit (natural light preferred)
2. Rooms must be clean and staged
3. No personal items or people visible
4. Horizontal/landscape orientation preferred
5. Minimum resolution: 1920x1080 pixels

### Auto-Validation on Upload
```typescript
interface ImageValidation {
  resolution_ok: boolean      // >= 1920x1080
  orientation: 'landscape' | 'portrait'
  file_size_ok: boolean       // <= 10MB
  format_ok: boolean          // jpg, png, webp, heic
}

// Traffic light feedback:
// GREEN: All checks pass
// YELLOW: Orientation is portrait (warning, not blocking)
// RED: Resolution too low or file too large (blocked)
```

### Storage Structure
```
property-images/
  {property_id}/
    {room_category}/
      {timestamp}-{random}.{ext}
```

## 1.7 Email Notification System

### Notification Triggers

| Event | To Client | To Commercial Team |
|-------|----------|-------------------|
| Discovery Brief submitted | Confirmation email with summary | New lead alert with brief details |
| Tenant form submitted | Confirmation email | New tenant lead alert |
| PYMES diagnosis completed | Results summary + recommended plan | New diagnosis alert with urgency level |
| Payment received | Payment confirmation receipt | Payment notification |

### Email Template Structure
- Branded header with logo
- Clear subject line
- Body with relevant data summary
- CTA button (e.g., "View your dashboard", "View lead details")
- Footer with legal/unsubscribe links

## 1.8 Legal Consents System

### Owner Consents (4 checkboxes — all mandatory)
1. Data Processing — consent to store and process personal data
2. Image Usage — authorization to use uploaded images for marketing
3. Marketing Communications — consent to receive emails/notifications
4. Third-Party Sharing — consent to share data with partners

### Tenant Consents (2-level)
1. **Level 1 (required)**: Data processing consent
2. **Level 2 (optional)**: Marketing communications consent

### Image-Specific Consent
- Separate checkbox when uploading images
- "I confirm I have the right to share these images and authorize their use for property marketing"

### Consent Logging
- Every consent action logged to `consent_logs` table
- Records: user_id, consent_type, granted (boolean), IP address, user agent, timestamp
- Consents are immutable — new records created on change, never updated

## 1.9 Supabase Storage Setup

- Bucket: `property-images` (public)
- File size limit: 10MB
- Allowed MIME types: image/jpeg, image/png, image/webp, image/heic
- RLS: authenticated users upload to own property folders; public read; owner/admin delete

---

# MILESTONE 2: Profiling Logic + Service Assignment + Results Pages
**Deliverable:** Automated user classification, service tier assignment, PYMES results display, CFP/Payback calculations
**Payment:** 25%

## 2.1 Owner/Investor Service Assignment

### Property Count → Role → Service Tier

```typescript
function classifyOwner(propertyCount: number): {
  role: user_role
  serviceTier: property_service_tier
} {
  if (propertyCount === 1) {
    return { role: 'propietario', serviceTier: 'basic' }
  } else if (propertyCount >= 2 && propertyCount <= 3) {
    return { role: 'propietario_preferido', serviceTier: 'preferred_owners' }
  } else {
    return { role: 'inversionista', serviceTier: 'elite' }
  }
}
```

### Elite Sub-Classification (Investors with 4+ properties)

Based on average monthly rent across their portfolio:

```typescript
function classifyEliteTier(avgMonthlyRent: number): elite_tier {
  if (avgMonthlyRent >= 7001) return 'lujo'
  if (avgMonthlyRent >= 4000) return 'signature'
  return 'essentials'  // $2,500 - $3,999
}
```

### CFP Calculation (Contribution to Profitability)

```typescript
// CFP = Monthly Rent × 10%
function calculateCFP(monthlyRent: number): number {
  return monthlyRent * 0.10
}

// Payback = Plan Fee / CFP
function calculatePayback(planFee: number, cfpMonthly: number): number {
  return planFee / cfpMonthly  // Result in months
}
```

**Example:**
- Monthly rent: $3,500 CAD
- CFP = $3,500 × 0.10 = $350/month
- If Plan fee = $2,500 → Payback = $2,500 / $350 = 7.14 months

### Service Recommendations by Tier

**Basic (1 property):**
- Professional photography
- Property listing optimization
- Basic digital marketing
- Tenant screening

**Preferred Owners (2-3 properties):**
- All Basic services
- Portfolio marketing strategy
- Multi-property listing management
- Tenant matching service
- Monthly performance reports

**Elite (4+ properties):**
- All Preferred services
- Dedicated account manager
- Premium photography + virtual tours
- Full digital marketing campaign
- Advanced analytics dashboard
- Priority tenant screening
- Sub-tier specific features (Essentials/Signature/Lujo)

## 2.2 Tenant Profiling

### Premium Detection
After form submission, run the 8-criteria check (see Section 1.4).

### Service Matching for Tenants
- Regular tenants → standard property search, basic matching
- Premium tenants → premium property matching, concierge service, priority viewing schedules

## 2.3 PYMES Results Page

### Visual Layout (`/results/pymes/[id]`)

**Section 1: Urgency Indicator**
- Large color-coded banner:
  - Critical (red) — "Your business needs immediate attention"
  - High (orange) — "Significant opportunities for improvement"
  - Moderate (green) — "Your business is on track — time to scale"
- Total score display (X / 35)

**Section 2: Estimated Annual Loss**
- Large number display: "$XX,XXX CAD"
- Explanation: "Based on your monthly revenue of $X,XXX, we estimate your business may be losing up to $XX,XXX annually due to marketing inefficiencies"
- Formula shown: Monthly Revenue × 30% × 12 months

**Section 3: Block-by-Block Breakdown**
- 4 blocks with individual scores and color indicators
- Radar/spider chart visualization of the 4 blocks

**Section 4: Recommended Plan**
- Highlighted plan card (Rescue / Growth / Scale)
- Plan features list
- Price with payment breakdown (upfront + installments)
- CTA button: "Get Started with [Plan Name]" → Stripe checkout

**Section 5: All Plans Comparison**
- 3-column comparison table
- Feature checkmarks
- Pricing for each plan
- Recommended plan highlighted

## 2.4 Profiling API Route

**POST `/api/profiling`**

```typescript
export async function POST(request: Request) {
  const { type } = await request.json()
  // type: 'owner' | 'tenant' | 'pymes'

  switch (type) {
    case 'owner':
      // 1. Count properties
      // 2. Classify role + service tier
      // 3. If elite, classify sub-tier
      // 4. Calculate CFP for each property
      // 5. Calculate payback period
      // 6. Save recommendations
      break

    case 'tenant':
      // 1. Count premium criteria met
      // 2. Classify regular/premium
      // 3. Match with property listings
      // 4. Save recommendations
      break

    case 'pymes':
      // 1. Calculate total score
      // 2. Determine urgency level
      // 3. Calculate estimated loss (PE)
      // 4. Assign recommended plan
      // 5. Save results
      break
  }
}
```

---

# MILESTONE 3: User Panel + Admin Panel + Lead Management
**Deliverable:** User dashboard, admin panel with 12 functional areas, lead management with status workflow
**Payment:** 25%

## 3.1 User Dashboard

### Dashboard Home (`/dashboard`)
- Welcome message with user name and role badge
- Summary cards based on role:
  - **Owner/Investor**: properties count, service tier, CFP total, active leads
  - **Tenant**: preference status, matched properties, premium status badge
  - **PYMES**: diagnosis score, urgency level, recommended plan, estimated loss
- Quick action buttons

### My Properties (`/dashboard/properties`) — Owners/Investors
- Grid/list view of registered properties
- Each card: thumbnail, address, rent, availability, service tier
- Room-by-room image gallery per property
- CFP display per property
- "Add Property" button → Discovery Brief
- Edit/delete capabilities

### My Images (`/dashboard/images`) — Owners/Investors
- Room-by-room image management interface
- Upload new images per room category
- Traffic light validation status per image
- Drag-and-drop reordering
- 5-rule checklist reminder

### My Profile (`/dashboard/profile`)
- View/edit personal information
- Role and tier display (read-only)
- Premium tenant badge (if applicable)
- Consent management (view/update consents)

### Recommended Services (`/dashboard/services`)
- Services assigned based on profiling
- Each service: name, description, price, recommendation reason
- "Subscribe" or "Purchase" button → Stripe checkout
- For PYMES: recommended plan with full details

### Payment History (`/dashboard/payments`)
- Table: date, service/plan, amount, type (one-time/upfront/installment), status
- Installment payment tracking (e.g., "2 of 4 paid")
- Download receipt button

## 3.2 Admin Panel (12 Functional Areas)

### 1. Admin Dashboard (`/admin`)
- KPI cards: total users (by role), total properties, total leads (by status), total revenue
- Recent activity feed: latest leads, registrations, payments
- Charts: leads over time, revenue over time, user distribution by role

### 2. Service Catalog Management (`/admin/services`)
- CRUD for all services
- Fields: name, description, category, subcategory, tier, price, target roles, features
- Toggle active/inactive
- Separate PYMES plan management

### 3. Form Management (`/admin/forms`)
- View all form submissions (Discovery Briefs, Tenant forms, PYMES diagnoses)
- Filter by form type, date range, status
- Export form data as CSV
- View individual form responses

### 4. Matching Rules Configuration (`/admin/matching`)
- Configure tenant premium criteria thresholds
- Configure property tier boundaries (rent ranges for Elite sub-tiers)
- Configure PYMES score thresholds for urgency levels
- Preview matching results

### 5. Pricing & Promotions (`/admin/pricing`)
- Set and update service prices
- Create promotional discounts (percentage or fixed amount)
- Set promotion validity periods
- Manage PYMES plan pricing

### 6. Payment Management (`/admin/payments`)
- View all payments across all users
- Filter by status, date, user, service
- Track installment progress per user
- Refund capability (via Stripe API)
- Revenue reports

### 7. Content Management (`/admin/content`)
- Edit landing page text content
- Manage testimonials
- Update FAQ content
- Service descriptions

### 8. User Management (`/admin/users`)
- Data table: name, email, role, tier, registration date, last activity
- Filters: by role, by tier, by date range
- Search by name or email
- View user detail: profile + properties/diagnosis/preferences
- Role override capability (admin can manually change user role)

### 9. Property Management (`/admin/properties`)
- Data table: address, owner, city, rent, availability, tier, date
- Image review: approve/reject uploaded images
- Filter by tier, availability, price range
- Toggle availability

### 10. Lead Management (`/admin/leads`)
- Data table: name, email, role, source, status, date, assigned to
- Status workflow: `nuevo → contactado → en_proceso → cerrado`

```typescript
const LEAD_STATUS_TRANSITIONS: Record<string, string[]> = {
  'nuevo': ['contactado'],
  'contactado': ['en_proceso', 'cerrado'],
  'en_proceso': ['cerrado'],
  'cerrado': [],
}
```

- Status change via dropdown
- Color-coded badges (nuevo=blue, contactado=yellow, en_proceso=orange, cerrado=green)
- Notes field per lead
- Assign lead to admin user

### 11. Legal Document Management (`/admin/legal`)
- View consent logs per user
- Export consent records
- Update privacy policy / terms of service text
- GDPR/PIPEDA compliance tracking

### 12. Data Export (`/admin/export`)
- Export users, properties, leads, payments as CSV
- Filter by date range and role
- Scheduled export capability (future)

## 3.3 Shared Components

### Data Table
- Sorting, pagination (10/25/50/100), debounced search, filter dropdowns
- Row actions, loading skeletons, empty states
- Bulk selection for export

### Sidebar Navigation
- Role-based menu items
- Active state highlighting
- Collapsible on mobile
- User info + logout at bottom

---

# MILESTONE 4: Stripe Payments + Webhooks + Final Integration
**Deliverable:** Full payment flow (one-time + installments), Apple Pay/Google Pay, webhook handling, end-to-end testing
**Payment:** 25%

## 4.1 Stripe Configuration

### Setup
```bash
npm install stripe @stripe/stripe-js
```

### Payment Methods
- Credit/Debit cards
- Apple Pay (via Stripe Payment Request Button)
- Google Pay (via Stripe Payment Request Button)

### Currency
- All transactions in CAD (Canadian Dollars)

## 4.2 Payment Flows

### One-Time Payment (Residential Services)
1. User clicks "Subscribe" on a service
2. Create Stripe Checkout Session with `mode: 'payment'`
3. User completes payment on Stripe-hosted page
4. Webhook confirms payment → update DB

### PYMES Plan Payment (Upfront + Installments)

**Option A: Upfront + Subscription**
1. User selects a PYMES plan (Rescue/Growth/Scale)
2. Create Stripe Checkout Session with initial payment amount
3. After successful upfront payment, create a Stripe Subscription for remaining installments
4. Webhook handles both initial and recurring payments

```typescript
// Example: Growth Plan ($2,500 total)
// Upfront: $1,000
// Then: $375/month × 4 months

async function createPymesCheckout(userId: string, planId: string) {
  const plan = await getPymesPlan(planId)

  // Step 1: Create checkout for upfront payment
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'cad',
        product_data: {
          name: `${plan.name} - Initial Payment`,
          description: `Upfront payment for ${plan.name}`,
        },
        unit_amount: Math.round(plan.upfront_amount * 100),
      },
      quantity: 1,
    }],
    success_url: `${APP_URL}/dashboard/payments?success=true&plan=${plan.plan_type}`,
    cancel_url: `${APP_URL}/results/pymes/${diagnosisId}?cancelled=true`,
    metadata: {
      user_id: userId,
      pymes_plan_id: planId,
      payment_type: 'upfront',
      plan_type: plan.plan_type,
    },
  })

  return session
}

// Step 2: After upfront succeeds, create subscription for installments
async function createInstallmentSubscription(userId: string, plan: PymesPlan) {
  // Create a Stripe Price for the installment
  const price = await stripe.prices.create({
    currency: 'cad',
    unit_amount: Math.round(plan.installment_amount * 100),
    recurring: { interval: 'month', interval_count: 1 },
    product_data: {
      name: `${plan.name} - Monthly Installment`,
    },
  })

  // Create subscription
  const subscription = await stripe.subscriptions.create({
    customer: stripeCustomerId,
    items: [{ price: price.id }],
    cancel_at_period_end: false,
    // Auto-cancel after N months
    metadata: {
      user_id: userId,
      pymes_plan_id: plan.id,
      total_installments: plan.installment_months.toString(),
    },
  })

  return subscription
}
```

## 4.3 Stripe Webhook Handler

```typescript
// api/stripe/webhook/route.ts
export async function POST(request: Request) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')!

  const event = stripe.webhooks.constructEvent(
    body, signature, process.env.STRIPE_WEBHOOK_SECRET!
  )

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object
      const { user_id, pymes_plan_id, payment_type } = session.metadata

      // Record payment
      await supabaseAdmin.from('payments').insert({
        user_id,
        pymes_plan_id: pymes_plan_id || null,
        stripe_session_id: session.id,
        stripe_payment_intent_id: session.payment_intent,
        amount: session.amount_total / 100,
        currency: 'CAD',
        payment_type: payment_type || 'one_time',
        status: 'completed',
      })

      // If this was an upfront PYMES payment, create installment subscription
      if (payment_type === 'upfront' && pymes_plan_id) {
        await createInstallmentSubscription(user_id, pymes_plan_id)
      }

      // Send payment confirmation email
      await sendPaymentConfirmationEmail(user_id, session)

      // Update lead status
      await supabaseAdmin.from('leads')
        .update({ status: 'en_proceso' })
        .eq('user_id', user_id)
        .eq('status', 'nuevo')

      break
    }

    case 'invoice.payment_succeeded': {
      // Handle recurring installment payments
      const invoice = event.data.object
      const subscription = await stripe.subscriptions.retrieve(invoice.subscription)
      const { user_id, pymes_plan_id, total_installments } = subscription.metadata

      // Count existing installment payments
      const { count } = await supabaseAdmin.from('payments')
        .select('*', { count: 'exact' })
        .eq('user_id', user_id)
        .eq('pymes_plan_id', pymes_plan_id)
        .eq('payment_type', 'installment')

      const installmentNumber = (count || 0) + 1

      // Record installment payment
      await supabaseAdmin.from('payments').insert({
        user_id,
        pymes_plan_id,
        stripe_session_id: invoice.id,
        stripe_subscription_id: invoice.subscription,
        amount: invoice.amount_paid / 100,
        currency: 'CAD',
        payment_type: 'installment',
        installment_number: installmentNumber,
        status: 'completed',
      })

      // Cancel subscription after all installments paid
      if (installmentNumber >= parseInt(total_installments)) {
        await stripe.subscriptions.cancel(invoice.subscription)
      }

      break
    }

    case 'payment_intent.payment_failed': {
      // Handle failed payments
      const paymentIntent = event.data.object
      await supabaseAdmin.from('payments')
        .update({ status: 'failed' })
        .eq('stripe_payment_intent_id', paymentIntent.id)

      // Send failure notification email
      break
    }
  }

  return NextResponse.json({ received: true })
}
```

## 4.4 Apple Pay / Google Pay

Using Stripe's Payment Request Button API:

```typescript
// components/payment-request-button.tsx
'use client'
import { PaymentRequestButtonElement, useStripe } from '@stripe/react-stripe-js'
import { useEffect, useState } from 'react'

export function PaymentRequestButton({ amount, label }: { amount: number, label: string }) {
  const stripe = useStripe()
  const [paymentRequest, setPaymentRequest] = useState(null)

  useEffect(() => {
    if (!stripe) return

    const pr = stripe.paymentRequest({
      country: 'CA',
      currency: 'cad',
      total: { label, amount: Math.round(amount * 100) },
      requestPayerName: true,
      requestPayerEmail: true,
    })

    pr.canMakePayment().then(result => {
      if (result) setPaymentRequest(pr)
    })
  }, [stripe, amount, label])

  if (!paymentRequest) return null

  return <PaymentRequestButtonElement options={{ paymentRequest }} />
}
```

## 4.5 Payment Success/Failure Pages

### Success
- Checkmark animation
- "Payment successful!" message
- Service/plan details
- Next steps information
- "Go to Dashboard" button

### Cancel/Failure
- "Payment was not completed" message
- Option to retry
- "Return to Services" button

## 4.6 External Webhook Endpoint

**POST `/api/webhooks`** — for future Make/Zapier integration:

```typescript
export async function POST(request: Request) {
  const apiKey = request.headers.get('x-api-key')
  if (apiKey !== process.env.WEBHOOK_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { event, data } = await request.json()

  switch (event) {
    case 'lead.created':
    case 'lead.updated':
    case 'payment.completed':
    case 'user.registered':
    case 'diagnosis.completed':
      // Forward to external services
      break
  }

  return NextResponse.json({ received: true, event })
}
```

## 4.7 Final Integration & Testing Checklist

### End-to-End Flows

**Flow 1: Owner (Basic) — 1 Property**
1. Register as owner
2. Complete Discovery Brief (select 1 property)
3. System assigns Basic tier
4. Upload property images (room-by-room)
5. Verify image validation (traffic light feedback)
6. View recommended services in dashboard
7. Complete Stripe payment for a service
8. Verify payment in dashboard + admin panel
9. Verify email notifications sent (client + team)

**Flow 2: Investor (Elite) — 4+ Properties**
1. Register as owner
2. Complete Discovery Brief (select 4+ properties)
3. System assigns Elite tier
4. Select Elite sub-tier based on rent range
5. View CFP calculations per property
6. View payback period estimates
7. Complete Stripe payment

**Flow 3: Tenant (Regular & Premium)**
1. Register as tenant
2. Fill tenant form with preferences
3. System auto-classifies (check if 3+ premium criteria met)
4. Verify correct role assignment
5. View matched property recommendations
6. Verify email notifications

**Flow 4: PYMES Full Journey**
1. Register as PYMES
2. Enter company info + monthly revenue
3. Answer 7 diagnostic questions (1-5 scale)
4. System calculates: total score, urgency level, estimated loss
5. View results page with block-by-block breakdown
6. View recommended plan (Rescue/Growth/Scale)
7. Click "Get Started" → Stripe checkout (upfront payment)
8. Verify upfront payment recorded
9. Verify installment subscription created
10. Simulate monthly installment payments
11. Verify subscription auto-cancels after all installments
12. Verify all email notifications

**Flow 5: Admin Operations**
1. Login as admin
2. View dashboard KPIs
3. Manage users (view, filter, role override)
4. Review property images (approve/reject)
5. Manage leads through full status workflow
6. CRUD service catalog
7. Configure matching rules
8. Set pricing/promotions
9. View all payments + revenue reports
10. Manage legal documents/consents
11. Export data as CSV

**Flow 6: Payment Verification**
1. Test card payment: 4242 4242 4242 4242
2. Test failed payment: 4000 0000 0000 0002
3. Test Apple Pay / Google Pay (if available)
4. Test upfront + installment flow
5. Test webhook event processing
6. Test refund via Stripe Dashboard

### Deployment Checklist
- [ ] All UI text in Canadian English
- [ ] Brand colors applied (blue header, green CTA, white bg)
- [ ] Environment variables set in Vercel (Supabase + Stripe + Email)
- [ ] Supabase schema updated with new tables
- [ ] RLS policies configured for all new tables
- [ ] Storage bucket configured with new validation rules
- [ ] Stripe webhook endpoint registered in Stripe Dashboard
- [ ] Stripe configured for CAD currency
- [ ] Apple Pay / Google Pay domain verification in Stripe
- [ ] Email notification templates configured
- [ ] Consent logging active
- [ ] All 6 flows tested in production
- [ ] Domain configured in Vercel
- [ ] Supabase Auth redirect URLs updated for production
- [ ] CORS configured for production domain

---

## Key Formulas Reference

| Formula | Definition | Example |
|---------|-----------|---------|
| **Estimated Loss (PE)** | Monthly Revenue × 0.30 × 12 | $10,000/mo → $36,000/year |
| **CFP** | Monthly Rent × 10% | $3,500/mo → $350 CFP |
| **Payback** | Plan Fee / CFP | $2,500 / $350 = 7.14 months |
| **Premium Tenant** | 3+ of 8 criteria | Budget≥$2500 + Urban + Modern = Premium |

## Key Thresholds Reference

| Threshold | Value | Result |
|-----------|-------|--------|
| PYMES Score 7-14 | Critical | → Plan Rescue ($1,500) |
| PYMES Score 15-24 | High | → Plan Growth ($2,500) |
| PYMES Score 25-35 | Moderate | → Plan Scale ($3,800) |
| Properties = 1 | Basic | → Standard services |
| Properties 2-3 | Preferred | → Portfolio services |
| Properties 4+ | Elite | → Premium services |
| Elite Rent $2,500-$3,999 | Essentials | → Entry elite tier |
| Elite Rent $4,000-$7,000 | Signature | → Mid elite tier |
| Elite Rent $7,001-$12,000 | Lujo | → Top elite tier |
| Tenant 3+ of 8 criteria | Premium | → Priority matching |
