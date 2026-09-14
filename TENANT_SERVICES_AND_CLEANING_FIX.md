# Tenant Services Filtered (which services shown, which removed)

## The bug

`src/app/(dashboard)/dashboard/services/page.tsx` builds two lists from the
`services` table:

```ts
const relevantServices = allServices?.filter((s) => {
  if (!s.target_roles || s.target_roles.length === 0) return true;
  return s.target_roles.includes(profile.role);
});

const otherServices = allServices?.filter((s) => {
  if (!s.target_roles || s.target_roles.length === 0) return false;
  return !s.target_roles.includes(profile.role);
});
```

`relevantServices` renders under **"Recommended for You"**, `otherServices`
renders under **"Other Available Services"**. The `otherServices` section
had three branches: an accordion for Owner, a single collapsed opt-in
accordion for PYME ("Own a property? Explore our property marketing
plans"), and — for everyone else, which in practice meant only Tenants —
a **plain, always-expanded grid** with every single non-tenant-tagged
service: Elite Property Management, Founders Package, Owner Preferred
Support/Premier Tier, Low Price, Virtual Tour 360°, etc. That's the
confirmed bug: a Tenant landed straight in that catch-all `else` branch
with zero filtering.

## The fix

`src/app/(dashboard)/dashboard/services/page.tsx` (~line 1086): added an
explicit `isTenantRole` branch **before** the existing `otherServices`
block, and excluded tenants from that block entirely
(`!isTenantRole && otherServices && ...`). Tenants now render their own
"Other Available Services" section containing only the new Cleaning
Services card — no Owner/Investor/PYME plans reach a Tenant's screen at
all, per the requirement (no opt-in accordion like PYME's, since a Tenant
has no legitimate reason to see those plans).

## Services shown to Tenants

- **Tenant Property Search** and **Premium Tenant Concierge** — confirmed
  these already exist in the `services` table (seeded in
  `supabase/migration_v2_mvp.sql` lines 501–520) with
  `target_roles = ARRAY['inquilino','inquilino_premium']` (Tenant Property
  Search) and `ARRAY['inquilino_premium']` (Premium Tenant Concierge,
  Premium-tier only). Because `target_roles` already includes the
  tenant/premium-tenant roles, these two were **already** correctly
  filtered into `relevantServices` and rendered under "Recommended for
  You" — no code change was needed there, only confirmation. No new
  services rows were created; both existing rows are reused as-is.
- **Cleaning Services** — new, see below. Not a DB row (no price/checkout
  needed), rendered directly under "Other Available Services".

## Services removed from Tenant's view

Everything previously leaking into `otherServices` for a Tenant: Elite
Property Management, Founders Package — Visionary Owners, Owner Preferred
— Support/Premier Tier, Low Price, Virtual Tour 360°, and any other
service tagged for `propietario`, `propietario_preferido`, `inversionista`,
or `pymes`. These continue to render normally for Owner/Investor (in the
Owner accordion groups) and for PYME (behind their existing opt-in), which
were both left untouched.

---

# Cleaning Services Card Added (description, Contact Us wiring)

## New component: `src/components/dashboard/cleaning-services-card.tsx`

A client component (`"use client"`) rendered as a `Card` matching the
visual style of the existing `OtherServiceCard` (same header/badge/
description layout), but with a `Badge` reading "Contact only" instead of
a category badge, and a "Contact Us" button instead of a price + checkout
button — there is no price and no purchase flow for this entry.

Description used: *"Need help keeping your place spotless? Let us know
and we'll connect you with a trusted cleaning provider."*

On click, the button POSTs to `/api/dashboard/cleaning-interest` and shows
inline status: `Sending…` while in flight, a green "Thanks! Our team will
follow up soon." confirmation on success, or an inline error message with
the button re-enabled to retry on failure. No modal/dialog — a single
click is enough since this is only an expression of interest, not a form
requiring extra input.

## New route: `src/app/api/dashboard/cleaning-interest/route.ts`

Modeled directly on the existing commercial-only pattern in
`src/app/api/dashboard/refund-request/route.ts`:

- Requires an authenticated Supabase session (401 if not signed in).
- Looks up the caller's `full_name` / `email` / `phone` from `profiles`.
- Sends **one** email via Resend to `COMMERCIAL_AREA_EMAIL` (same env var
  and fallback address used everywhere else in this codebase), with
  `replyTo` set to the tenant's email so commercial can reply directly.
  Subject: `Cleaning Services interest — <name>`.
- Best-effort: if `RESEND_API_KEY` is missing or the send throws, the
  error is logged server-side and the route still returns
  `{ success: true }` to the client (mirrors the existing
  refund-request route's behavior of never blocking the user-facing
  confirmation on an email hiccup).
- **No customer confirmation email is sent** — see decision below.

## Confirming: should a customer confirmation email be added?

Yes, it would be simple to add — the exact `sendOne()` helper in
`src/lib/email.ts` (used by all four payment-lifecycle emails) already
supports firing a customer email with `notifyCommercial: true` to BCC the
commercial team in one call, and `tenant-submit-email/route.ts` shows the
"commercial send + customer send via `Promise.allSettled`" pattern this
project already uses for form submissions. Either would be a small
addition.

I left it out on purpose, matching the task's own reasoning: this is a
single-click expression of interest with no cleaning partner integrated
yet, not a formal request with a committed 24-hour follow-up promise (like
the public Contact form or Schedule a Consultation flow, both of which
explicitly promise "our team will get back to you within 24 hours" in
both the UI copy and the customer email body). Sending a customer email
here would either have to invent a similar promise the business hasn't
made for this feature yet, or read as a generic "we got your message"
email disconnected from any concrete next step — worse than the inline
"Thanks! Our team will follow up soon." confirmation already shown on the
card itself. If the business wants a customer-facing confirmation once a
real cleaning-partner follow-up flow exists, adding one is a ~10-line
change to this route using the existing `sendOne()` helper.

---

# Files Modified

- `src/app/(dashboard)/dashboard/services/page.tsx` — imported
  `CleaningServicesCard`; added an `isTenantRole`-gated "Other Available
  Services" branch showing only the Cleaning Services card; excluded
  tenants from the pre-existing `otherServices` block (Owner/PYME
  branches untouched).
- `src/components/dashboard/cleaning-services-card.tsx` — new client
  component (informational card + Contact Us button + inline status).
- `src/app/api/dashboard/cleaning-interest/route.ts` — new route,
  commercial-only email notification.

# What Was Intentionally Not Changed

- **Owner / Investor / PYME sections** — the Owner tier card, Available
  Plans, Owner's `otherServices` accordion groups (Property add-on /
  Investor services / Business services), and PYME's plan card + opt-in
  accordion are all untouched. The new tenant branch is a hard early-exit
  (`isTenantRole && ...` / `!isTenantRole && otherServices ...`) so it
  cannot affect those code paths.
- **"Recommended for You" section** — left as-is. Tenant Property Search
  and Premium Tenant Concierge already surfaced correctly there via the
  existing `target_roles` filter; no change was needed to make that
  correct, only confirmation.
- **No pricing/checkout for Cleaning Services** — no `services` table row
  was added, no `CheckoutButton`, no Stripe involvement. The card is
  purely informational plus a lead-capture email.
- **Dashboard home** (`src/app/(dashboard)/dashboard/page.tsx`) — checked
  and confirmed it does **not** render "Recommended for You" or "Other
  Available Services" at all; it only links out to `/dashboard/services`
  via a "View Services" button. So there is only one place this section
  exists in the app, and it's already fixed — no duplicate section to
  reconcile.
- **Customer confirmation email** — deliberately omitted; see reasoning
  above. Reported per the task's request rather than silently added.
- **Admin-assigned recommendations** ("Specially Assigned for You",
  driven by `service_recommendations`) — untouched. That section is
  admin-curated per-user and is a separate mechanism from the
  role-based `otherServices` filtering this task addresses.

# Expected Result

- A Tenant (`inquilino` or `inquilino_premium`) visiting
  `/dashboard/services` sees, under "Other Available Services", **only**
  the Cleaning Services informational card — no Elite/Founders/Owner
  Preferred/Low Price/Investor/PYME plans.
- Clicking "Contact Us" on that card sends one email to the commercial
  team (via `COMMERCIAL_AREA_EMAIL`) with the tenant's name/email/phone
  and a reply-to set to the tenant, and the card shows an inline "Thanks!
  Our team will follow up soon." confirmation — no customer email is
  sent, no price/checkout is offered anywhere on the card.
- Tenant Property Search and (for Premium Tenants) Premium Tenant
  Concierge continue to appear under "Recommended for You" as before,
  now confirmed to be the only tenant-relevant services in scope.
- Property Owner, Investor, and PYME views are pixel-for-pixel unchanged.

## Not verified

No `node_modules` are installed in this environment, so I could not run
`next dev`/a type-check/build or exercise the flow in a browser. The new
code was written to mirror the exact existing, working patterns in this
repo (`OtherServiceCard` layout, `RefundRequestButton`'s fetch-on-click
pattern, and `refund-request/route.ts`'s commercial-only Resend call), but
this should still be smoke-tested as a Tenant user (and with `RESEND_API_KEY`
set) before merging.
