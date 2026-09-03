# Investor Portfolio Breakdown & Acquire Button Fix

Scope: Investor (`inversionista`) Elite Assets & Legacy experience only, on
Dashboard home (`/dashboard`) and Recommended Services
(`/dashboard/services`). No pricing, tier-classification, CFP/Payback,
Owner Basic/Preferred, Tenant, or PYMES logic was touched.

---

# Fix 1 — Asset Management Box Removed From Dashboard Home

**Root cause:** `OWNER_PRIMARY_PLAN.elite` in
[src/app/(dashboard)/dashboard/page.tsx](src/app/(dashboard)/dashboard/page.tsx)
hard-coded a generic "Asset Management" plan card ("Portfolio-based
pricing (Essentials / Signature / Luxury)") with a "Manage My Assets" CTA
that had no matching `services` row, so it always rendered as a `<Link>`
to `/dashboard/services#contact` instead of a real purchase action.

**Change:** removed the `elite` entry from `OWNER_PRIMARY_PLAN`. The
"Your Service Tier" card (badge, tagline, full feature list) still
renders for investors exactly as before — only the generic
plan/price/CTA sub-block, which was elite-specific and non-functional,
is gone.

**Confirmed unchanged:** the equivalent "Asset Management" card in the
"Available Plans" grid on `/dashboard/services` (driven by
`OWNER_TIERS.elite.plans`, `src/lib/constants.ts`) was left exactly as
it was — that is the "already exists on Recommended Services" instance
referenced in the task, and it is not part of this fix.

---

# Fix 2 — Per-Property Portfolio Breakdown Added To Dashboard Home

**New shared component:**
[src/components/dashboard/elite-portfolio-breakdown.tsx](src/components/dashboard/elite-portfolio-breakdown.tsx)
(`ElitePortfolioBreakdown`), styled after the onboarding form's Step 6
"Portfolio Assignment Summary"
([src/app/forms/propietario/page.tsx](src/app/forms/propietario/page.tsx)
lines ~2007-2043) — one row per property with a colored portfolio pill
(blue Essentials / amber Signature / purple Luxury, matching the
onboarding form's `getPortfolio()` color coding, not the single flat
amber badge the old Services-page block used).

Each row shows, per property:
- `#{n} {city} — ${rent}/mo` + address/type as a muted sub-line
- Portfolio badge (Essentials/Signature/Luxury)
- One-time fee and monthly maintenance fee, explicitly labeled per tier
  (e.g. *"$900 CAD one-time payment + $200 CAD/month maintenance fee,
  charged for this property only."*)
- CFP monthly (from the already-stored `cfp_monthly`) and Payback in
  months (from `payback_months`), read-only, untouched math
- An "Acquire {Tier}" button scoped to that property (Fix 3)

**Dashboard home wiring:** `src/app/(dashboard)/dashboard/page.tsx` now
selects `elite_tier`, `payback_months`, `property_type`, `address`,
`city` on the existing properties query (it previously only selected
`monthly_rent`/`cfp_monthly`), resolves the 3 Elite `services` rows
(Essentials/Signature/Lujo) alongside the existing owner-plan services
query, and renders a new "Your Portfolio" card containing
`ElitePortfolioBreakdown` when `isInvestor && ownerTier === "elite" &&
ownerProperties.length > 0`.

**Note on a pre-existing copy bug fixed while touching this code:** the
old Services-page block described the monthly fee as "shared across all
linked {Tier} properties." That directly contradicts the confirmed rule
that both fees are per-property, never shared. The new shared
component's copy says "charged for this property only" instead. This is
a wording correction to match the confirmed business rule, not a change
to any fee amount or classification logic — the numbers ($900/$200,
$1,410/$200, $1,650/$300) are identical to before.

---

# Fix 3 — Acquire Buttons Wired To Stripe Checkout (one-time fee); Monthly Fee Billing Status Reported

**Bug investigated:** in both the old Dashboard-home "Manage My Assets"
CTA and the old Services-page "Acquire {Tier} Portfolio" CTA
(`src/app/(dashboard)/dashboard/services/page.tsx`, previously lines
793-800), the button was a plain `next/link` `<Link href="/dashboard/services#contact">`
— **no `onClick`, no `CheckoutButton`, no fetch to `/api/stripe/checkout`
at all.** It wasn't failing silently; it simply wasn't wired to anything
beyond an in-page anchor scroll. Confirmed via `grep`: `ELITE`/`portfolio`/`essentials`/`signature`/`luxury`
never appeared anywhere in `src/app/api/stripe/checkout/route.ts` or the
webhook before this change.

**Fix — reused the existing, already-proven `CheckoutButton` pattern**
(same component used for Basic/Preferred Owner plans and Founders),
extended minimally to support per-property scoping:

1. `services` table already has priced rows from migration v11 for this
   exact purpose — `Plan: Elite — Essentials` ($900), `Plan: Elite —
   Signature` ($1,410), `Plan: Elite — Lujo` ($1,650) — previously never
   referenced by any checkout code. `ELITE_SUB_TIERS` in
   `src/lib/constants.ts` now carries a `dbServiceName` field mapping
   each tier key to its row, so both pages can resolve `{id, price,
   currency}` for the button exactly like the owner-plan cards already
   do via `servicesByDbName`.
2. `CheckoutButton` (`src/components/checkout/checkout-button.tsx`) gained
   an optional `propertyId` prop, forwarded in the POST body to
   `/api/stripe/checkout` — additive change, every existing call site
   that omits it is unaffected.
3. `/api/stripe/checkout` (`src/app/api/stripe/checkout/route.ts`,
   `"service"` case) now optionally accepts `propertyId`: when present,
   it looks up the property **scoped to `owner_id = user.id`** (same
   ownership-check pattern used throughout the app) so a user cannot
   charge a property they don't own, returns 404 if it doesn't match,
   and — if valid — appends the property's address/city to the Stripe
   line-item name and stamps `metadata.property_id` on the session. No
   other checkout logic (pricing, promo codes, tax, GST workaround) was
   touched.
4. Each property in `ElitePortfolioBreakdown` renders its own
   `CheckoutButton` with that property's `id` and its tier's resolved
   `serviceId` — never one button for the whole portfolio. Clicking
   "Acquire Essentials" (or Signature/Luxury) on property #2 now
   actually opens a real Stripe Checkout session for that property's
   one-time fee.
5. Both pages (`dashboard/page.tsx` and `dashboard/services/page.tsx`)
   render the same `ElitePortfolioBreakdown` component, so the fix
   applies identically in both places from one code path.

**Monthly maintenance fee billing — investigated, NOT wired, reported:**
- The `payment` created is `mode: "payment"` (one-time) for the
  one-time portfolio fee only, exactly as instructed.
- Stripe **subscription/recurring billing infrastructure already exists
  in this codebase** — the webhook
  (`src/app/api/stripe/webhook/route.ts`, `checkout.session.completed`
  handler) dynamically creates a `stripe.prices.create({ recurring: {
  interval: "month" } })` + `stripe.subscriptions.create(...)` today, but
  **only** for PYMES installment plans (triggered by
  `metadata.pymes_plan_id` + `metadata.installment_months`). There is no
  equivalent trigger for Elite monthly maintenance fees.
- I deliberately did **not** extend that subscription logic to Elite
  fees in this pass, because:
  - The `payments` table (`supabase/migration.sql`) has no `property_id`
    column, so a recurring-fee record couldn't be tied back to a
    specific property without a schema migration — out of scope per the
    task's "do not touch pricing/schema" constraint, and no migration
    was created or run.
  - Whether the $200/$300 monthly fee should become a genuine Stripe
    Subscription (auto-charged monthly) or continue to be collected
    manually by the commercial team (as the old copy implied) is a
    product decision, not something inferable from the code.
  - The new UI is transparent about this: each Acquire button is
    followed by a small note — *"The $X CAD/mo maintenance fee for this
    property is billed separately by our team; it is not yet collected
    automatically at checkout."*
- **Recommendation:** if recurring billing is wanted, add a
  `property_id` column to `payments` (new migration), extend the
  checkout route to also create a `stripe.subscriptions.create(...)` for
  the monthly fee (mirroring the PYMES pattern) when the one-time
  purchase succeeds, and store `property_id` + `elite_tier` in the
  subscription/session metadata so the webhook can attribute recurring
  invoices back to the right property.

---

# Files Modified

- `src/lib/constants.ts` — added exported `ELITE_SUB_TIERS` (fees,
  per-tier colors, `dbServiceName` mapping). No existing exports changed.
- `src/components/checkout/checkout-button.tsx` — added optional
  `propertyId` prop, forwarded to the checkout API.
- `src/app/api/stripe/checkout/route.ts` — `"service"` case now accepts
  optional `propertyId`, verifies ownership, enriches the Stripe line
  item name and session metadata. No pricing/tax/promo logic changed.
- `src/components/dashboard/elite-portfolio-breakdown.tsx` — **new**
  shared per-property breakdown + Acquire button component.
- `src/app/(dashboard)/dashboard/page.tsx` — removed the `elite` entry
  from `OWNER_PRIMARY_PLAN` (Fix 1); extended the properties query with
  the extra columns needed for the breakdown; resolved the 3 Elite
  service rows; added the new "Your Portfolio" card (Fix 2).
- `src/app/(dashboard)/dashboard/services/page.tsx` — removed the local
  (now centralized) `ELITE_SUB_TIERS` definition; replaced the inline,
  non-working per-property block with `ElitePortfolioBreakdown` (Fix 3).

# What Was Intentionally Not Changed

- CFP (`calculateCFP`) and Payback (`calculatePayback`) math in
  `src/lib/profiling.ts` — not touched, not imported into new code; the
  breakdown only reads the already-stored `cfp_monthly`/`payback_months`
  columns, same as the code it replaced.
- Portfolio tier thresholds/classification (`classifyEliteTier` in
  `profiling.ts`, and the duplicate `getPortfolio()` in
  `src/app/forms/propietario/page.tsx`) — untouched.
- All one-time fee amounts ($900/$1,410/$1,650) and monthly fee amounts
  ($200/$200/$300) — unchanged; only centralized into one exported
  constant instead of being duplicated locally in `services/page.tsx`.
- Basic/Preferred Owner flows, `OWNER_PRIMARY_PLAN.basic` /
  `.preferred_owners`, Founders Package, Premier Tier — untouched.
- Tenant and PYMES flows/pages — untouched.
- The "Available Plans" Elite "Asset Management" card on
  `/dashboard/services` — left as-is per the task's explicit instruction.
- No commit, push, or deploy was performed.
- The uncommitted `supabase/migration_v31_milestone4_final_decisions.sql`
  change already present in the working tree before this task started
  was not touched or built upon.

# Expected Result

- Investors no longer see a generic, non-functional "Asset Management /
  Manage My Assets" box on Dashboard home.
- Dashboard home now shows a "Your Portfolio" card listing every
  property individually, each with its rent, portfolio tier, exact
  one-time + monthly fee, CFP, payback, and its own "Acquire {Tier}"
  button.
- The same breakdown (with working Acquire buttons) also replaces the
  previously broken block on Recommended Services — both surfaces now
  share one implementation.
- Clicking "Acquire {Tier}" for a specific property redirects to a real
  Stripe Checkout session charging that property's one-time portfolio
  fee only; on success it returns to the existing
  `/dashboard/payments/success` flow, same as every other plan purchase.
- The monthly maintenance fee is explicitly flagged in the UI as not yet
  automatically billed, with the technical reason and a concrete next
  step documented above (Fix 3) instead of being silently ignored.

**Not verified in a running browser:** this environment has no Node/npm
installed (`node_modules` absent, `npx`/`node` unavailable), so `next
dev`, `tsc --noEmit`, and `npm run lint` could not be executed here. All
changes were reviewed manually for type/JSX consistency against the
existing (untyped Supabase client) patterns already used throughout
these files. Recommend running `npm run lint` and a manual click-through
of both pages as an investor test account before merging.
