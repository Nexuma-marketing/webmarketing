# Nexuma Marketing — Project Handover Manual

This document is the operating manual for the platform. Read top to bottom on first delivery; after that, use it as a reference when you need to change something.

Keep this file under version control. If you change how something works, update the section here in the same commit.

---

## 1. Technology Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | **Next.js 16 (App Router, Turbopack)** | Full-stack React; server + client components in one repo |
| Language | **TypeScript** | Compile-time safety on every API, DB row shape, form schema |
| UI | **React 19 + Tailwind CSS + shadcn/ui** | Production-ready accessible primitives, no design lock-in |
| Charts | **Recharts** | Used for `/admin/reports` revenue + funnel |
| Forms | **react-hook-form + Zod** | Schema-validated forms with typed values |
| Database | **Supabase Postgres** (project `nldnqvsbcyzcfbdpymsg`) | Managed Postgres + Auth + Storage + Row-Level Security |
| Auth | **Supabase Auth (cookie-based session)** | Native to the DB; admin policies enforced at the row level |
| Payments | **Stripe (Checkout Sessions + Webhooks)** | Cards, refunds, subscriptions, Stripe Tax for GST |
| Email | **Resend** (from `notifications@nexuma.ca`) | Transactional email; logs metrics in-process |
| Hosting | **Vercel** | Auto-deploy on push to `main`, edge functions for `/api/*` |
| DNS / CDN | **Cloudflare** | Domain `nexuma.ca` registered + DNS-managed by client |
| Storage | **Supabase Storage** (`property-images` bucket) | Image uploads from owner registration + dashboard |

Node version: **20.x** (Vercel default). Build command: `next build`.

---

## 2. Repository structure (top-level)

```
/
├── src/
│   ├── app/                         Next.js App Router routes
│   │   ├── (auth)/                  /login, /register
│   │   ├── (dashboard)/             Authenticated routes (user + admin)
│   │   │   ├── admin/               Admin section — sidebar nav lives here
│   │   │   │   ├── content/         Editable site copy (testimonials, FAQ, headlines)
│   │   │   │   ├── forms/           Edit form questions/options for propietario, inquilino, pymes
│   │   │   │   ├── images/          Property image moderation
│   │   │   │   ├── leads/           Lead pipeline
│   │   │   │   ├── legal/           Legal docs + consent log
│   │   │   │   ├── matching/        Property matching rules
│   │   │   │   ├── payments/        Transaction list + refund/cancel actions
│   │   │   │   ├── plans/           Plan checklists (Owner Basic, Founders, Elite, etc.)
│   │   │   │   ├── pricing/         Service prices, promotions, Founders counter
│   │   │   │   ├── properties/      Admin view of all properties
│   │   │   │   ├── reassign/        Move clients between services
│   │   │   │   ├── reports/         Sales analytics (revenue, funnel, promos)
│   │   │   │   ├── services/        Service catalog
│   │   │   │   ├── team/            Internal users (admin, marketing, sales, support)
│   │   │   │   └── users/           Customer profiles
│   │   │   ├── dashboard/           Customer dashboard (per-role)
│   │   │   └── layout.tsx           Sidebar + auth guard
│   │   ├── api/
│   │   │   ├── admin/stripe/        Admin actions: refund, cancel-subscription
│   │   │   ├── stripe/checkout/     Create Stripe Checkout Session
│   │   │   ├── stripe/webhook/      Stripe → our DB (the single writer)
│   │   │   ├── stripe/cancel-my-subscription/   Customer self-cancel
│   │   │   ├── health/              Public diagnostic (commit, DB state, Stripe config)
│   │   │   └── webhooks/            External webhook (Make/Zapier, secured by WEBHOOK_API_KEY)
│   │   ├── forms/                   Public form pages
│   │   │   ├── propietario/         Owner registration + add-property
│   │   │   ├── inquilino/           Tenant preferences
│   │   │   └── pymes/               Business diagnosis + acquisition
│   │   ├── legal/[type]/            Public legal document pages
│   │   ├── results/pymes/[id]/      Business diagnosis result
│   │   └── page.tsx                 Public landing page
│   ├── components/                  Reusable UI
│   │   ├── ui/                      shadcn/ui primitives
│   │   ├── forms/                   Form helpers (DynamicField, ImageUpload)
│   │   ├── dashboard/               Subscription cancel button, data table
│   │   ├── admin/                   Admin confirm banner
│   │   ├── checkout/                Stripe checkout button (with promo input + Final Sale notice)
│   │   └── tenant/                  Matched property card
│   ├── lib/                         Shared logic
│   │   ├── supabase/                Server + client + admin (service-role) Supabase clients
│   │   ├── stripe.ts                Stripe SDK lazy initializer
│   │   ├── email.ts                 Resend helpers + payment email templates
│   │   ├── form-meta.ts             Admin-form metadata overlay (useFormFieldMeta)
│   │   ├── legal-docs.ts            Admin-edited legal text overlay (useLegalDocsOverlay)
│   │   ├── branding.ts              Build site name/logo/cover from site_content
│   │   └── admin.ts                 CSV export, date/currency formatters
│   ├── types/                       TypeScript types (database row shapes, form schemas)
│   └── middleware.ts                Next.js edge middleware: auth + admin role gate
├── supabase/                        Migration history (v2 → v33)
│   ├── migration.sql                Original schema (profiles, properties, leads)
│   ├── migration_v*.sql             Incremental changes in version order
│   └── migrations/001_initial_schema.sql  Alternative entry point
├── feedback/                        Client feedback PDFs/DOCX + decision logs
│   ├── MILESTONE4_FINAL_DECISIONS.md  Canonical business decisions (READ THIS)
│   └── (PDFs / DOCX per dated client check-in)
├── public/                          Static assets
├── .env.local.example               (none — see Section 6 for required env vars)
├── package.json                     Dependencies + scripts
└── HANDOVER_MANUAL.md               This file
```

---

## 3. Changing plan prices (the most common ops question)

### Quick answer
**Both Stripe and the code matter, depending on what you change.**

| What you want to change | Where to do it | Effect |
|-------------------------|----------------|--------|
| The dollar amount Stripe charges at checkout | **`/admin/pricing`** → Service Prices → Edit Price | Updates `services.price` in DB; Stripe Checkout reads it at the moment of purchase. No code deploy needed. |
| The PERCENTAGE descriptions (35% / 30% / 28%) shown on plan cards | **`/admin/plans`** → click the plan → edit Tagline + Features | Updates `app_config` rows; visible on `/dashboard/services` immediately. No code deploy needed. |
| The list of plan FEATURES (bullets) | **`/admin/plans`** → Features textarea | Same as above. |
| Time-to-tenant ("~16 days avg.") | **`/admin/plans`** → "Tiempo objetivo" field | Splices into the marketing-campaign feature bullet automatically. |
| Stripe Tax (5% GST) configuration | **Stripe Dashboard** → Tax settings | Already configured to charge 5% on marketing services. Code already opts in via `automatic_tax: { enabled: true }`. |
| Add a new plan that didn't exist before | Code change required | Add it to the `OWNER_TIERS` (or PYMES_PLANS) constant in `src/app/(dashboard)/dashboard/services/page.tsx`, plus a row in the `services` table. Then add it to `/admin/plans` PLANS array. |
| Currency (CAD → other) | Code + DB | Update `services.currency` rows + Stripe account currency + all hardcoded `"CAD"` strings. Multi-step, not currently supported. |

### Worked example — raise Low Price from $200 to $250

1. Sign in as admin (`alexsanabria33@hotmail.com`)
2. Go to `/admin/pricing`
3. Find row **"Plan: Low Price"** (CAD $200)
4. Click **Edit Price** → change to `250` → Save
5. Done. Next customer who clicks Purchase pays $250 + 5% GST.

If you also want to update the description ("$200 system fee upfront" → "$250 system fee upfront"):

6. Go to `/admin/plans`
7. Find **"Owner — Low Price"** card
8. Edit Features textarea — replace `$200 system fee upfront` with `$250 system fee upfront`
9. Click Save
10. Done. The customer-facing card on `/dashboard/services` updates immediately.

### Important: the PERCENT collected after tenant signs is manual
Stripe only charges the upfront ($200, $900, $1,410, etc.). The 30–35% of first month's rent (Basic / Preferred) and the $100–$300/mo portfolio fee (Elite) are **collected manually by the team** outside of Stripe. There is no automated billing for those. If you need a place to track "remainder collected for property X on date Y", that's a future feature.

### Promotions (discount codes)
1. Go to `/admin/pricing` → Promotions section
2. Click **+ New Promotion**
3. Fill in code (e.g., `LAUNCH20`), discount type (percentage / fixed), discount value, validity dates
4. Optional targeting (in the amber panel):
   - **Zona** — comma-separated cities (`Vancouver, Burnaby`)
   - **Tipo de cliente** — toggle role chips
5. Save
6. Active promotions automatically appear on `/dashboard/services` as banners for matching users
7. Customers enter the code at checkout (the Stripe Checkout button has a "Have a promo code?" toggle)

---

## 4. Architecture map

### Request flow — customer makes a purchase

```
Customer clicks "Purchase"
  ↓
<CheckoutButton> (src/components/checkout/checkout-button.tsx)
  POSTs to /api/stripe/checkout
  ↓
api/stripe/checkout/route.ts
  - Validates user is logged in
  - Validates promo code (if provided) against `promotions` table
  - Computes unit_amount (cents)
  - Calls stripe.checkout.sessions.create({
      automatic_tax: { enabled: true },       // 5% GST added by Stripe Tax
      billing_address_collection: 'required',
      line_items: [{ tax_behavior: 'exclusive', ... }],
      metadata: { user_id, service_id, payment_type, ... }
    })
  - Returns session.url
  ↓
Browser redirects to Stripe-hosted checkout
  ↓
Customer pays → Stripe redirects back to /dashboard/payments/success
  ↓
Stripe also fires webhook → POST /api/stripe/webhook
  ↓
api/stripe/webhook/route.ts (the SINGLE writer to `payments` table)
  - Verifies Stripe signature (STRIPE_WEBHOOK_SECRET)
  - Inserts payments row (status: completed)
  - Sends customer receipt email via Resend
  - BCCs commercial team
  - Updates lead status to en_proceso
```

### Refund flow

```
Admin clicks Refund on /admin/payments row
  ↓
POSTs to /api/admin/stripe/refund (admin auth required)
  ↓
api/admin/stripe/refund/route.ts
  - Confirms caller is admin
  - Calls stripe.refunds.create({ payment_intent })
  - Returns success
  ↓
Stripe processes refund → fires charge.refunded webhook
  ↓
api/stripe/webhook/route.ts
  - Updates payments row: status='refunded', refunded_at=now()
  - Sends customer refund-confirmation email
  - BCCs commercial team
```

### Subscription cancellation flow (PYMES installments)

```
User clicks "Cancel installments" on /dashboard/payments
  ↓
POSTs to /api/stripe/cancel-my-subscription (must own a payment row)
  ↓
Calls stripe.subscriptions.update(id, { cancel_at_period_end: true })
  - Stripe schedules cancellation for cycle end
  - We immediately send "scheduled to cancel" email with the end date
  ↓
Service continues until cycle end (no prorated refund)
  ↓
Stripe fires customer.subscription.deleted at cycle end
  ↓
webhook handler:
  - Marks pending payments as 'canceled', stamps canceled_at
  - Sends final cancellation email
```

### Form field metadata flow (admin → public form)

```
Admin edits a question in /admin/forms
  ↓
INSERT/UPDATE row in form_questions table
  ↓
Public form (/forms/propietario, /forms/inquilino, /forms/pymes)
  - On mount, useFormFieldMeta(formSlug) fetches all rows for that form
  - For each field, DynamicField + fieldOptions read the admin metadata
  - Labels, helper text, options, required flag, is_active all honor admin edits
```

---

## 5. Supabase data dictionary

### Auth tables (managed by Supabase)
- **`auth.users`** — Supabase Auth identities. Each row has `id` (UUID), `email`, `last_sign_in_at`. We do NOT delete from here in normal migrations because there's no FK pointing back; instead see migration v33 for the explicit cleanup.

### Application tables

#### `profiles`
Mirror of `auth.users` with business fields. **PK `id` references `auth.users.id`.**
- `id` UUID — same as auth.users.id
- `email`, `full_name`, `phone`, `company_name` TEXT
- `role` TEXT, CHECK in (`propietario`, `propietario_preferido`, `inquilino`, `inquilino_premium`, `inversionista`, `pymes`, `admin`, `marketing`, `sales`, `support`)
- `stripe_customer_id` TEXT (added v8)
- `property_count` INTEGER
- `created_at`, `updated_at`

**RLS**: Users see their own row. Admin sees all (policy `Admins can view all profiles`).

#### `properties`
Owner-registered units. **FK `owner_id` → profiles.id ON DELETE CASCADE.**
- `id` UUID
- `owner_id` UUID
- `title`, `address`, `city`, `province`, `postal_code` TEXT
- `monthly_rent` NUMERIC, `bedrooms`, `bathrooms` INTEGER, `area_sqft` NUMERIC
- `property_type`, `occupancy_status`, `style`, `levels`, `social_life` TEXT
- `amenities`, `common_areas`, `smart_home_features`, `skytrain_lines`, `nearby_supermarkets`, `listing_platforms` TEXT[]
- `dishwasher`, `pet_friendly`, `smart_home`, `shared_unit`, `furnished`, `utilities_included`, `near_parks`, `near_churches`, `near_skytrain`, `near_bus`, `near_mall` BOOLEAN
- `service_tier` (basic / preferred_owners / elite), `elite_tier` (essentials / signature / lujo)
- `cfp_monthly`, `payback_months` NUMERIC
- `is_available` BOOLEAN
- `created_at`, `updated_at`

**RLS**: Owners see their own; admins see all.

#### `property_images`
- `id`, `property_id` (FK CASCADE), `room_category` TEXT, `image_url`, `original_filename`, `status` (pending / approved / rejected), `sort_order`, `resolution_ok`, `orientation`

**RLS**: Owners manage their own. Public SELECT for matching.

**Where the actual image binary lives**: not in this table. The `image_url` column points to **Supabase Storage** → bucket `property-images`. The table only stores metadata + the public URL.

##### How to view / manage uploaded property photos in Supabase Studio

1. Open the Supabase Dashboard for project `nldnqvsbcyzcfbdpymsg` → left sidebar → **Storage**.
2. Click the bucket named **`property-images`**.
3. You'll see a folder tree. Each owner's uploads land under `{user_id}/{property_id}/{room_category}/...` so you can drill in to see one owner's images.
4. Click any file to **preview**, **download**, or **delete** it.
5. To revoke a photo from the public website without deleting the binary: go to the `property_images` table → find the row → set `status = 'rejected'`. Tenants stop seeing it; the file stays in Storage for audit.

The corresponding admin UI at `/admin/images` (Image Library) does the same thing — it lists every `property_images` row, lets you Approve / Reject / Open in new tab. Use the Studio view above when you need raw file access (download originals, free up space).

#### `tenant_preferences`
Tenant's wishlist after filling `/forms/inquilino`.
- `user_id` (FK CASCADE), employment, income range, preferred zones (TEXT[]), bedrooms_needed, bathrooms_needed, budget range, move-in date, amenities preferences, lots of `near_*` booleans

#### `discovery_briefs`
Owner's brief after filling `/forms/propietario` (first time). One row per owner.

#### `leads`
All inbound interest — from contact form, registration, PYMES diagnosis, etc.
- `id`, `full_name`, `email`, `phone`, `source`, `status` (nuevo / contactado / en_proceso / ganado / perdido), `role`, `user_id` (FK SET NULL), `notes`
- Used by sales pipeline at `/admin/leads`

#### `services`
Master catalog of buyable items (plans).
- `id`, `name`, `description`, `category` (`plan`, `marketing`, etc.), `price` NUMERIC, `currency` TEXT, `is_active` BOOLEAN
- `tier`, `target_roles` TEXT[], `features` TEXT[], `features_basic`, `features_preferred`, `features_elite` (per-tier override arrays)
- `status` (active / hidden / archived)

#### `pymes_plans`
Business plans (Rescue / Growth / Scale) — separate from services because they have installments.
- `id`, `name`, `plan_type`, `price`, `upfront_amount`, `installment_amount`, `installment_months`

#### `payments`
The single source of truth for money movement. Only the Stripe webhook writes here (per design).
- `id`, `user_id` (FK CASCADE), `service_id` (FK SET NULL), `pymes_plan_id` (FK SET NULL)
- `stripe_session_id`, `stripe_payment_intent_id`, `stripe_subscription_id` TEXT
- `amount` NUMERIC, `currency` TEXT
- `payment_type` (`one_time`, `upfront`, `installment`, `subscription_canceled`)
- `installment_number`, `total_installments` INTEGER
- `status` CHECK in (`pending`, `completed`, `failed`, `refunded`, `canceled`) (extended in v30)
- `refunded_at`, `canceled_at` TIMESTAMPTZ (added v30)

**RLS**: Users see their own. Admins see all.

#### `promotions`
Discount codes for checkout.
- `code` TEXT (unique), `discount_type` (`percentage` / `fixed`), `discount_value` NUMERIC
- `valid_from`, `valid_until` DATE
- `max_uses`, `used_count` INTEGER
- `target_zones`, `target_roles` TEXT[]
- `is_active` BOOLEAN, `description`

#### `consent_logs`
PIPEDA / PIPA compliance — every checkbox the user ticks during registration/forms creates a row.
- `user_id` (FK CASCADE), `consent_type` TEXT, `granted` BOOLEAN, `granted_at`, `ip_address`, `user_agent`

#### `legal_documents`
Admin-editable legal text. Loaded by the public consent forms via `useLegalDocsOverlay`.
- `type` TEXT (unique) — e.g., `consent_image_usage`, `consent_marketing`, `terms_of_service`, `privacy_policy`, `refund_policy`
- `content` TEXT, `version` TEXT, `updated_at`

#### `forms_dynamic` + `form_questions`
Admin-editable form metadata. Each form has a slug; each question has field_key, label, helper_text, options (JSONB), required, is_active, conditional_on, conditional_value.

Slugs in use: `owner_property`, `tenant_preferences`, `pymes_diagnosis`, `business_acquisition`, `lead_sales_calculator`.

#### `app_config`
Generic key-value store keyed by `(category, key)`.
- `founders_plan` / `taken` and `/ limit` — drives the urgency banner
- `plan_features:<plan_key>` / `tagline` and `/ features` — admin-editable plan checklists
- `plan_timing:<plan_key>` / `time_to_tenant` — admin-editable target days

#### `site_content`
Generic key-value for landing-page copy. Keyed by `(section, key)`.
- `section = branding`: site name, tagline, logo URL, favicon URL
- `section = testimonials`, `section = faq`, `section = landing_headlines`, `section = landing_features`, `section = landing_cta`, `section = service_descriptions`, `section = articles`

#### Other notable tables
- `articles` — published blog posts (Articles admin page)
- `matching_rules` — admin-defined scoring weights for property ↔ tenant matching
- `service_recommendations` — per-user assigned services (set from admin/reassign)
- `email_logs` — outgoing email audit (Resend integration)
- `pymes_captacion`, `pymes_diagnosis` — separate business form submissions

### Row-Level Security overview

All authenticated tables have RLS enabled. The standard policy pattern:

1. **Owner self-access**: `auth.uid() = user_id` allows SELECT/UPDATE on rows you own
2. **Admin all-access**: `EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')` allows SELECT/INSERT/UPDATE/DELETE on every row
3. **Anonymous public-read** (where applicable): `USING (true)` for tables that need to render unauthenticated (e.g., `legal_documents`, `properties` for matching display)

To list every policy:

```sql
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

---

## 6. Environment variables

These must be set in **Vercel Settings → Environment Variables** for **Production, Preview, and Development**.

### Required to boot at all
| Variable | Where it comes from |
|----------|---------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API → `anon` `public` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API → `service_role` `secret` (used by server-only code) |

### Required for payments
| Variable | Where it comes from |
|----------|---------------------|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys → Secret key |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Same screen → Publishable key |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Developers → Webhooks → endpoint → Signing secret |

### Required for email
| Variable | Where it comes from |
|----------|---------------------|
| `RESEND_API_KEY` | Resend Dashboard → API Keys |
| `RESEND_FROM_EMAIL` | e.g., `WebMarketing <notifications@nexuma.ca>` |
| `CONTACT_NOTIFICATION_EMAIL` | Where contact-form notifications land (`partners@nexuma.ca`) |
| `COMMERCIAL_AREA_EMAIL` | BCC recipient for payment event emails (sales/commercial team) |

### Optional
| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_APP_URL` | Site base URL — used for Stripe success/cancel redirects and email links |
| `WEBHOOK_API_KEY` | Auth for Make/Zapier external webhook posts |

### Set automatically by Vercel
`VERCEL_GIT_COMMIT_SHA`, `VERCEL_GIT_COMMIT_REF`, `VERCEL_GIT_COMMIT_AUTHOR_DATE` — used by `/api/health` to confirm deployed version.

### Verifying the env is healthy

Hit `https://nexuma.ca/api/health` (or the current Vercel URL). Look at:
- `interpretation.buildOk: true`
- `interpretation.emailReady: true`
- `interpretation.stripeReady: true`
- `stripe.secretKeyMode` matches `stripe.publishableKeyMode` (both `test` or both `live`)
- `stripe.keysMatch: true`

If any of these are false, the corresponding feature won't work.

---

## 7. Deployment

Vercel watches the `main` branch on GitHub. Every push triggers a build + deploy.

### Deploying a code change

```bash
# locally
git checkout main
git pull
# ...make edits...
npm run build         # confirms it compiles
git add <files>
git commit -m "your message"
git push origin main
```

That's it. Vercel builds and deploys in ~2 minutes. Confirm by reloading `/api/health` and checking the commit hash matches.

### Running a database migration

Migrations live in `/supabase/migration_v*.sql`. They are **NOT automatically applied** — you run them manually:

1. Open Supabase Dashboard → SQL Editor
2. Open the migration file from this repo
3. Copy contents → paste into SQL Editor
4. Click Run
5. Confirm "Success" + run the verification queries at the bottom of the file

Idempotent migrations (most of them) can be run multiple times safely. Destructive ones (v32, v33) are clearly labeled and must be reviewed before running.

### Promoting Test Stripe to Live

1. Switch the toggle in Stripe Dashboard to Live mode
2. Go to API keys → copy the live `sk_live_...` and `pk_live_...`
3. Update both Vercel env vars (don't paste anywhere else):
   - `STRIPE_SECRET_KEY`
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
4. In Stripe Dashboard → Webhooks, create a new endpoint (Live mode endpoints are separate from Test mode). URL: `https://nexuma.ca/api/stripe/webhook`. Subscribe to:
   - `checkout.session.completed`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `payment_intent.payment_failed`
   - `charge.refunded`
   - `customer.subscription.deleted`
5. Copy the new live `whsec_...` → update `STRIPE_WEBHOOK_SECRET` in Vercel
6. Vercel redeploys automatically
7. Verify with `/api/health`: `stripe.secretKeyMode: 'live'`, `stripe.keysMatch: true`

---

## 8. Operations cookbook

### Creating an internal team user

1. Sign in as admin → `/admin/team`
2. Click **+ Add team member**
3. Fill name + email + role (admin / marketing / sales / support) and generate a password
4. Click **Create user** — they can sign in immediately and change their password from `/dashboard/profile`

To change someone's role later: same page, click the role pill on their row.

**Scope by role** (also enforced by RLS on the database side):

| Section | admin | marketing | sales | support |
|---------|:-:|:-:|:-:|:-:|
| `/admin/users` (list) | ✓ | read | read | read |
| `/admin/leads` | ✓ | read | ✓ | read |
| `/admin/properties` | ✓ |   | ✓ |   |
| `/admin/payments` | ✓ |   |   |   |
| `/admin/reports` | ✓ |   | ✓ |   |
| `/admin/services`, `/admin/plans` | ✓ | ✓ |   |   |
| `/admin/pricing` (promotions) | ✓ | ✓ |   |   |
| `/admin/content`, `/admin/articles`, `/admin/images` | ✓ | ✓ |   |   |
| `/admin/forms`, `/admin/matching` | ✓ | ✓ |   |   |
| `/admin/reassign` | ✓ |   | ✓ |   |
| `/admin/team` (role mgmt) | ✓ |   |   |   |
| `/admin/legal`, `/admin/export` | ✓ |   |   |   |

The sidebar hides what each role shouldn't see. Direct-URL access to a forbidden page redirects to `/dashboard` (middleware) or `/admin` (page guard). Saves are additionally rejected at the DB layer by RLS.

### Configuring a campaign by Zona + Tipo de cliente

1. `/admin/pricing` → Promotions → New Promotion
2. Code: `CHOOSE_A_CODE` (uppercase, no spaces, e.g., `VANCOUVER10`)
3. Discount: percentage 10% (or fixed $X)
4. Validity dates (start/end)
5. In the amber panel:
   - **Zona**: `Vancouver, Burnaby` (only those cities see the banner)
   - **Tipo de cliente**: click the role chips that apply (e.g., only Property Owner + Investor)
6. Save
7. Anyone matching both filters sees the banner on `/dashboard/services` and can enter the code at checkout

### Issuing a refund

1. Sign in as admin → `/admin/payments`
2. Find the row by user / date / service
3. Click **Refund**
4. Confirm in the dialog
5. Stripe processes; status flips to `refunded` within seconds (via webhook)
6. Customer + commercial team receive notification emails automatically

### Cancelling a customer's installment plan

1. `/admin/payments` → find a row with a `stripe_subscription_id`
2. Click **Cancel sub**
3. Confirm dialog
4. Stripe sets `cancel_at_period_end: true` — customer keeps service until cycle end
5. Customer + commercial team receive a "scheduled to cancel" email with the exact end date

### Cleaning up test data (post-launch periodic maintenance)

If real customers + test customers get mixed in over time, repeat the v32/v33 pattern:

```sql
-- Preview
SELECT id, email, role FROM profiles WHERE LOWER(email) IN ('test1@x.com', 'test2@y.com');

-- Delete from profiles (CASCADE handles related rows)
DELETE FROM profiles WHERE LOWER(email) IN ('test1@x.com', 'test2@y.com');

-- Delete from auth.users (frees the email for re-signup)
DELETE FROM auth.users WHERE LOWER(email) IN ('test1@x.com', 'test2@y.com');
```

---

## 9. Migration history (chronological summary)

| # | File | Purpose |
|---|------|---------|
| base | `migration.sql` | Initial schema: profiles, properties, leads, payments |
| v2 | `migration_v2_mvp.sql` | MVP additions: services, property_images, consent_logs, etc. |
| v3 | `migration_v3_forms.sql` | Added many property fields (smart_home_features, skytrain_lines, etc.) |
| v4 | `migration_v4_captacion.sql` | PYMES captacion form |
| v5 | `migration_v5_fixes.sql` | Misc fixes to early schema |
| v6 | `migration_v6_cfp_payback.sql` | CFP + payback months |
| v7 | `migration_v7_milestone3.sql` | Milestone 3: legal_documents, services seeds |
| v8 | `migration_v8_stripe.sql` | Stripe integration fields: stripe_customer_id, installment tracking |
| v8 | `migration_v8_phase3_polish.sql` | Phase 3 polish |
| v9 | `migration_v9_admin_suite.sql` | Admin tables |
| v10 | `migration_v10_per_tier_features.sql` | Per-tier feature arrays on services |
| v11-v15 | Bug fixes | Steve's iterative fixes for early reports |
| v16 | `migration_v16_form_options_sync.sql` | Seed select-field options for owner_property, tenant_preferences, pymes_diagnosis |
| v17 | `migration_v17_legal_consent_texts.sql` | Seed actual consent texts (image_usage, data_processing, marketing, third_party) |
| v18 | `migration_v18_consent_log_expansion.sql` | Allow new consent_type values |
| v19 | `migration_v19_low_price_plan.sql` | Add Plan: Low Price service row |
| v20 | `migration_v20_renormalize_room_categories.sql` | Re-normalize room_category casing |
| v21 | `migration_v21_form_options_alignment.sql` | Align form options |
| v22 | `migration_v22_restore_stage1_hero.sql` | Restore Stage 1 approved hero |
| v23 | `migration_v23_consent_text_cleanup.sql` | Clean up consent text + add consent_communications |
| v24 | `migration_v24_cities_backfill.sql` | Restore Victoria and missing BC cities |
| v25 | `migration_v25_consent_logs_backfill.sql` | Backfill consent_logs for existing profiles |
| v26 | `migration_v26_strip_empty_form_options.sql` | Strip empty rows from form_questions.options |
| v27 | `migration_v27_owner_consent_seed.sql` | Seed 3 missing owner consents (legal rep, liability, e-sig) |
| v28 | `migration_v28_plan_service_prices.sql` | Set Low Price + Founders to $200 |
| v29 | `migration_v29_owner_form_missing_questions.sql` | Seed 4 missing owner form fields |
| v30 | `migration_v30_payments_canceled_refunded.sql` | Add 'canceled' status + refunded_at + canceled_at |
| v31 | `migration_v31_milestone4_final_decisions.sql` | Founders counter = 0, refund policy text, plan descriptions |
| v32 | `migration_v32_purge_test_accounts.sql` | Delete 20 test accounts from profiles (CASCADE) |
| v33 | `migration_v33_purge_auth_users.sql` | Delete 20 test accounts from auth.users (frees email for re-signup) |

---

## 10. Where to get more help

- **Code questions**: read the file, the inline comments cover the "why" of every non-obvious decision
- **Business decisions**: see `feedback/MILESTONE4_FINAL_DECISIONS.md`
- **Stripe issues**: Stripe Dashboard logs every event under Developers → Events
- **Email delivery**: Resend Dashboard logs every send + bounces; also see `/api/health` `email.attempts/succeeded/failed`
- **Supabase issues**: SQL Editor + Dashboard logs; RLS policies are inspectable via `SELECT * FROM pg_policies`
- **Vercel issues**: Vercel Dashboard → Deployments → click a deployment → Build Logs / Function Logs

---

*Last updated: 2026-05-20. Update this file in the same PR as any behavior change.*
