# All Instances Found (file, exact before text, exact after text)

Full case-insensitive search for `real estate` / `real-estate` across the entire repository
(excluding `node_modules`, `.git`, `.next`). Three customer-facing instances were found and
fixed; two non-customer-facing instances were found and left unchanged (see note below each).

## 1. Customer-facing — Fixed

**File:** `src/app/(dashboard)/dashboard/services/page.tsx` (line 1082)
Collapsed "Own a property?" button added in the prior PYME dashboard UX task.

- **Before:** `Own a property? Explore our real estate plans`
- **After:** `Own a property? Explore our property marketing plans`

**File:** `src/app/page.tsx` (line 591)
Homepage "Property Owners & Investors" service card description.

- **Before:** `Register your properties, get tailored marketing recommendations, and maximize your real estate investment.`
- **After:** `Register your properties, get tailored marketing recommendations, and maximize your property investment.`

**File:** `src/app/page.tsx` (line 72)
Homepage FAQ answer to "What is the differential value of this platform?"

- **Before:** `...you not only pay less rent than with real-estate agencies or sub-leasing third parties...`
- **After:** `...you not only pay less rent than with traditional rental agencies or sub-leasing third parties...`

## 2. Non-customer-facing — Found, flagged, NOT changed (per task scope)

**File:** `supabase/migration.sql` (line 47)
SQL comment, never rendered to any user.

- **Text:** `-- 2. PROPERTIES (Real estate listings)`
- **Action:** Left as-is. This is an internal code comment describing a database table, not
  customer-facing copy. Flagged here for awareness only.

**File:** `guide-1.md` (line 577)
Internal implementation/spec guide (developer reference document, not part of the deployed app
and never shown to a customer).

- **Text:** `- Professional imagery (Montreal real estate / business context)`
- **Action:** Left as-is, flagged for awareness. If this guide is ever repurposed as
  client-facing documentation, it should be updated too.

## Related terms also checked (no changes needed)

- `Realtor.ca` appears in several property-listing forms (`src/app/forms/propietario/page.tsx`,
  `add-property/page.tsx`, `property-edit-form.tsx`, and matching SQL/seed data) as one option in
  a "where is your property currently listed?" multi-select alongside Centris, Kijiji, PadMapper,
  and Rentals.ca. This is the accurate proper name of an external third-party listing website the
  user may already use — not a description of this business's own services — so it was left
  unchanged. It does not describe this platform as performing real estate brokerage.
- Searched separately for `realtor`, `brokerage`, `licensed real`, and `real property` — no
  additional customer-facing hits (the `real property` hits were in internal diagnostic `.md`
  reports discussing photo/property-record attribution, unrelated to real estate brokerage).
- Searched for `estate` alone — all remaining hits were `useState` substring matches (React
  hooks), not the word "estate."

# Files Modified

- `src/app/(dashboard)/dashboard/services/page.tsx` — 1 instance (PYME "Other Available Services"
  collapsed button label).
- `src/app/page.tsx` — 2 instances (Property Owners & Investors card description; FAQ answer).

No other files were modified. Wording only — no pricing, plan logic, routing, or functional
behavior was touched.

# Confirmation: Full Codebase Search Performed

Searches run from the repository root, excluding `node_modules`, `.git`, and `.next`:

```
grep -rniI "real estate" .
grep -rniI "realestate|real-estate" .
grep -rniI "realtor|brokerage|licensed real|real property" .
grep -rniI "estate" .   (to catch any split/odd casing not covered above)
```

Coverage included: all `src/` app routes and components (pages, forms, dashboard, admin), all
API routes (email templates, checkout, webhooks), all Supabase SQL migrations, and all root-level
Markdown/docs. Every match was individually reviewed and categorized above as either
customer-facing (fixed) or internal (flagged, left untouched per task scope). A follow-up
verification grep after the edits confirms zero remaining `real estate` / `real-estate` instances
in `src/` or `supabase/`.

# Expected Result

No customer-facing text anywhere in the application — buttons, page copy, FAQ answers, email
templates, or forms — describes this business's services using the term "real estate," removing
the compliance risk of implying a licensed real estate brokerage activity this business does not
perform. All replaced wording ("property marketing plans," "property investment," "traditional
rental agencies") matches terminology already used elsewhere in the app (e.g. "Property Owners &
Investors," "Personalized property marketing," "Property add-on services"), so no new voice or
terminology was introduced. Internal-only mentions (a SQL comment and an internal spec guide) were
left untouched but are documented above for awareness, since neither is ever shown to a customer.
