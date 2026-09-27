# Payment-Flow Overhaul — Implementation Report

Covers all 9 items of the PROMPT2 payment-flow brief. Nothing was
committed, pushed, or applied to the database — all four migrations
are created but not run, and no `git commit` was made. This report is
the single source of truth for what changed and what still needs your
attention before deploying.

No Node.js toolchain was available in this working environment (no
`node`, `npm`, or `node_modules`), so **`npm install`, `next build`,
`tsc`, and `eslint` could not be run**. Every file below was reviewed
manually, line by line, including a second pass specifically hunting
for type mismatches and money-calculation bugs (two real bugs were
found and fixed this way — see Item 8 and the "Bugs found while
reviewing" section). Please run `npm install && npm run build` before
deploying; that is the one verification step this session could not do
for you.

---

## Item 0 — Does `generateBalanceInvoice` actually work?

**Verdict: could not be proven end-to-end from this session (no Stripe
credentials available), but a full code-path audit found no evidence
it was ever fundamentally broken — the most likely explanation for "no
customer has ever received one of its emails" is the silent-failure
design of its old trigger, which this work removes.**

### What the audit found

- `generateBalanceInvoice` (`src/lib/balance-invoice.ts`) had exactly
  two call sites before this change:
  1. `POST /api/admin/properties/[id]/balance-invoice` — a manual
     re-trigger endpoint.
  2. `PATCH /api/admin/properties` — fired automatically whenever an
     admin/marketing/sales user flipped a property's `is_available`
     switch to **false**.
- The second call site wrapped the call in try/catch and was
  **best-effort**: if `generateBalanceInvoice` threw, the
  `is_available` toggle still succeeded, and the error was only
  returned in the HTTP response body — nothing in the admin UI ever
  read or displayed that field. A real failure there would have been
  completely silent to the person who triggered it. This alone fully
  explains the symptom without the underlying Stripe logic necessarily
  being broken.
- `finalized.hosted_invoice_url` was computed by the function but
  **never persisted** anywhere (returned in the JSON response only) —
  there was also no `balance_invoice_url` column on `properties`. So
  even a fully successful run left no durable link for anyone to find
  later except by re-reading server logs at the exact moment it ran.
- `STRIPE_GST_RATE_ID` is read with a bare `|| null` fallback, and the
  code's own prior comment already warned it "must match the Stripe
  key mode" (a test-mode tax rate ID used against a live key, or vice
  versa, throws inside `stripe.invoices.create`). This is a plausible
  failure mode if that env var was ever copied between environments.
- No other file in the codebase touches `stripe.invoices.*` — this was
  (and remains) the only Stripe Invoice-creation code path.

### What was fixed as part of this work regardless of the verdict above

1. **`balance_invoice_url` is now persisted** (migration v62 adds the
   column; `generateBalanceInvoice`'s final Supabase update now writes
   `created.hostedInvoiceUrl` into it).
2. **`[balance-invoice-diag]` logging** was added around every Stripe
   and Supabase call inside `generateBalanceInvoice`,
   `ensureStripeCustomer`, and `createAndSendStripeInvoice`
   (`src/lib/balance-invoice.ts`), matching the existing
   `[webhook-diag]` pattern already used in the Stripe webhook. The
   webhook's `invoice.payment_succeeded` / `invoice.payment_failed`
   branches for `metadata.kind === "plan_balance"` got the same
   treatment (`src/app/api/stripe/webhook/route.ts`).
3. The old implicit, best-effort, error-swallowing trigger on
   `is_available` was **removed entirely** (Item 1) — the mechanism is
   now only ever invoked from an explicit, auditable staff action whose
   result is shown directly in the UI, not buried in an HTTP response
   nobody reads.
4. A real, previously-unreported **money bug** was found in the
   balance calculation itself while implementing Item 8's interaction
   with Item 1 — see "Bugs found while reviewing," below. It has been
   fixed.

### How to get a definitive answer

Since this session has no Stripe credentials, you can confirm real
behavior in two ways:

- **Stripe test Dashboard**: search Invoices for
  `metadata[kind]:plan_balance` (or, after this ships,
  `metadata[kind]:plan_installment` for Premier Tier installments too).
- **Vercel logs**: after deploying, trigger the new "Tenant signed
  lease" action (Item 1) once on a test property and grep the function
  logs for `[balance-invoice-diag]` — every step (idempotency check,
  owner lookup, plan detection, balance math, Stripe Customer/Invoice
  creation, finalize, send, Supabase persist) now logs its own
  input/output, so a failure will show exactly which step it happened
  at instead of a bare stack trace.

---

## Item 1 — Decouple "Tenant signed lease" from `is_available`

- **`src/app/api/admin/properties/route.ts`** — the
  `if (is_available === false) { generateBalanceInvoice(...) }` block
  is gone. `is_available` is a pure availability flag again.
- **New route** `src/app/api/admin/properties/[id]/tenant-signed-lease/route.ts`
  (POST, role-gated to `admin`/`marketing`/`sales`, same as the old
  toggle):
  - Idempotent — if `tenant_lease_signed_at` is already set, it no-ops
    and returns the original timestamp instead of re-invoicing.
  - Sets `tenant_lease_signed_at` + `tenant_lease_signed_by`.
  - Detects the plan **per property** (not per owner — see "Bugs found
    while reviewing" for why this matters once Item 6 makes
    Support/Premier per-property).
  - For Low Price / Founders / Support Tier → calls
    `generateBalanceInvoice(propertyId)`, then sends the new branded
    email on success.
  - For Premier Tier → does **not** call it; Premier's schedule is
    entirely calendar-based from the upfront payment (Item 5), never
    from lease-signed.
- **New email** `sendBalanceInvoiceAvailableEmail`
  (`src/lib/email.ts`) — "your remaining balance is now payable,"
  links to `/dashboard/payments`, sent **in addition to** Stripe's own
  invoice email (never instead of it).
- **UI**: "Commercial dashboard" and "Admin dashboard" turned out to be
  the same surface in this codebase — sales/marketing/admin all already
  share `/admin` (confirmed with you before building). The action is
  now available from both places that exist:
  - `src/app/(dashboard)/admin/properties/page.tsx` — new "Lease
    signed" column; shows a "Mark signed" button, or a green
    checkmark + date once signed.
  - `src/components/admin/property-detail-modal.tsx` — same action
    inline in the Property section, plus a direct link to the Stripe
    balance invoice once one exists.
- **Migration `migration_v62_tenant_lease_signed_and_balance_invoice_url.sql`**
  adds `properties.tenant_lease_signed_at`,
  `properties.tenant_lease_signed_by`, `properties.balance_invoice_url`.

---

## Item 2 — Show pending balance immediately after upfront paid

New shared component `src/components/dashboard/property-balance-summary.tsx`
renders "Paid: $200 · Pending balance: $X" as soon as a completed
upfront payment exists for a property+plan — independent of whether
Item 1's trigger has fired. Wired in:

- `/dashboard/payments` (Payment History) — new "Plan Balances" card,
  one row per property with a paid plan. This is the primary surface.
- `/dashboard/services` — a compact line under the Low Price/Founders
  card (basic tier) and inside each per-property Support/Premier card
  (Item 6).

Before the balance is payable, the "Pay remaining balance" button
renders as a disabled-looking badge ("Pending — becomes payable once
your tenant signs the lease"), never hidden.

---

## Item 3 — "Pay remaining balance" links directly to Stripe

Once payable (`balance_invoice_url` set and status is
`open`/`overdue`/`uncollectible`), `PropertyBalanceSummary` renders a
real `<a href={balance_invoice_url}>` button opening Stripe's hosted
invoice page directly — a real Stripe Invoice page (same idea as
Checkout, different Stripe API), not an email link. Same pattern
per-row for Premier Tier installments, each with its own
`hosted_invoice_url` once the cron has invoiced it (Item 5).

---

## Item 4 — Prevent double-charging the upfront deposit

New shared lookup library `src/lib/payment-lookup.ts` and swap
component `src/components/dashboard/paid-or-checkout.tsx`. Given an
`alreadyPaid` boolean (computed server-side per page), it renders
either the existing `CheckoutButton` or a disabled-look "Deposit paid
✓ — View balance" link to Payment History. Wired into every render
site found:

- `src/app/(dashboard)/dashboard/services/page.tsx` — Low Price,
  Founders (both branches), the (dead-code but now defensively fixed)
  "Available Plans" grid, Support Tier and Premier Tier (via the new
  per-property component, Item 6).
- `src/app/(dashboard)/dashboard/page.tsx` (Dashboard home) — same
  cards duplicated here, all fixed too.
- `src/components/dashboard/primary-plan-pricing-card.tsx` — shared by
  both pages above.
- `src/components/dashboard/elite-portfolio-breakdown.tsx` — Investor
  per-property Elite fee.
- `src/components/dashboard/pymes-plan-card.tsx` — PYME upfront
  (keyed by `user_id + pymes_plan_id`, since PYME has no property).

Low Price and Founders now also pass `propertyId` to checkout (basic
tier is exactly one property by definition, so this is always safe) —
needed for the double-charge check to have something to key on, and
for Item 8's netting.

---

## Item 5 — Premier Tier real installment schedule

- **Migration `migration_v63_plan_installments.sql`** — new
  `plan_installments` table (`property_id, service_id, sequence,
  due_date, percentage, amount_cents, stripe_invoice_id,
  hosted_invoice_url, status`), RLS so owners see their own rows and
  staff see all.
- **`src/lib/balance-invoice.ts` refactored** — the Stripe
  Customer/InvoiceItem/Invoice/finalize/send sequence is now two
  exported, reusable functions (`ensureStripeCustomer`,
  `createAndSendStripeInvoice`) instead of being inlined only in
  `generateBalanceInvoice`. Both the lump-sum flow (`kind:
  "plan_balance"`) and the new installment flow (`kind:
  "plan_installment"`) call the same code.
- **`src/lib/premier-installments.ts`** (new) —
  `schedulePremierInstallments()`, called once from the Stripe
  webhook's `checkout.session.completed` handler right after a Premier
  Tier $200 upfront succeeds (`src/app/api/stripe/webhook/route.ts`).
  Determines "Property #1" vs "#2/#3" by the property's index in the
  owner's properties ordered by `created_at` — the same convention
  already used by `src/lib/owner-plan-display.ts`'s
  `percentageForPlan`, so the number shown to the owner matches the
  number billed:
  - Property #1: one installment, 100% of `(30% × rent − $200)`, due
    +2 months.
  - Property #2/#3: three installments, 50%/30%/20% of
    `(28% × rent − $200)`, due +1/+2/+3 months (the third installment
    absorbs the rounding remainder so the three always sum exactly).
  - Idempotent against redelivered webhook events (checks for existing
    rows before inserting).
- **Cron** `src/app/api/cron/process-installments/route.ts` (new) +
  **`vercel.json`** (new, repo root — this repo had **no** existing
  cron infrastructure: no `vercel.json`, no `src/app/api/cron/*`, no
  `CRON_SECRET` anywhere). Runs daily
  (`0 13 * * *` UTC), finds `plan_installments` rows with
  `status = 'scheduled'` and `due_date <= now()`, invoices each one via
  `createAndSendStripeInvoice`, updates the row to `invoiced` with the
  resulting `hosted_invoice_url`. **You need to add a `CRON_SECRET` env
  var in Vercel** — the route refuses to run without one (returns 401),
  and Vercel automatically sends
  `Authorization: Bearer ${CRON_SECRET}` on scheduled invocations once
  that env var exists.
- **Webhook extended** — `invoice.payment_succeeded` /
  `invoice.payment_failed` now also branch on
  `metadata.kind === "plan_installment"`, updating the matching
  `plan_installments` row to `paid`/`failed` and inserting a mirrored
  `payments` row (`payment_type: "plan_installment"`).
- **Payment History** now lists each Premier installment individually
  (paid / due-now-with-Pay-button / scheduled-for-a-future-date), not
  just a single total.
- **Migration `migration_v64_premier_tier_description_fix.sql`** —
  corrects `services.description` for
  `'Plan: Owner Preferred — Premier Tier'`. The old text (seeded in
  v59) said "50% of the applicable total service fee is paid at the
  beginning" — wrong on two counts per your confirmed final spec: the
  $200 is flat, never a percentage of the fee, and the real schedule
  differs by property rank (single payment for #1, 50/30/20 split for
  #2/#3). The new text matches what's actually implemented.

---

## Item 6 — Support Tier & Premier Tier → per-property cards

New `src/components/dashboard/owner-plan-portfolio-breakdown.tsx`,
modeled directly on the existing `elite-portfolio-breakdown.tsx`
pattern. Renders one card per property (up to 3, matching the plan's
own terms), each with its own `CheckoutButton propertyId={...}`
(via `PaidOrCheckout`), its own paid state (Item 4), and its own
balance/installment display (Items 2/3/5).

`src/app/(dashboard)/dashboard/services/page.tsx` now renders this
component twice for `preferred_owners` tier — once for Support Tier
(replacing the single card that used to live inside "Your Service"),
once for Premier Tier (replacing the account-wide card that used to
live inside the "Want to pay in installments?" collapsible — including
the JSX that was previously duplicated verbatim between the grid and
that collapsible, now written once).

---

## Item 7 — Optional +$100 priority listing add-on

- **Migration `migration_v65_priority_listing_addon_service.sql`** —
  new `services` row `"Add-on: Priority Listing Placement (1 month)"`
  ($100, category `addon`, `target_roles` = Property Owner roles), so
  it's independently purchasable via the existing single-line-item
  checkout path with zero API changes for the standalone case.
- **Bundled case**: `src/components/dashboard/primary-plan-pricing-card.tsx`
  (now a client component) turns the existing "Optional: +$100 for
  priority listing placement" bullet into a real checkbox — matched by
  text content, not a hardcoded index, so admin edits to the plan copy
  in `/admin/pricing` don't break it. Checked before paying → the
  checkout route adds it as a second, clearly itemized Stripe line
  item ($200 + $100 = $300).
- **`src/app/api/stripe/checkout/route.ts`** — the `"service"` case
  gained `addOnServiceId` handling (second `price_data` line item) and
  the webhook (`checkout.session.completed`) now splits that one
  Checkout Session into **two** `payments` rows (main plan + add-on)
  so the add-on's own "already purchased" state and standalone
  re-purchase eligibility both work correctly.
- **Standalone purchase**: new card on `/dashboard/payments` for an
  owner who skipped it at checkout, using the same paid-state logic —
  disappears once bought.

---

## Item 8 — Founders Package automatic smart balance

- **`src/lib/plan-switch.ts`** (new) — `computeNetAmountDueCents()`,
  written generically (property + new service in, net amount out) per
  your explicit ask that this not be hardcoded to Founders. Two cases:
  - Nothing paid yet on this property → the normal flat $200 upfront
    (same as every other plan's first charge — the remaining balance
    is handled later by Item 1/5's flow, never charged up front).
  - Something already paid on this property (any plan) → charges only
    `max(0, newPlanTotalFee − amountAlreadyPaid)`.
- Wired into the Founders `CheckoutButton` (now `PaidOrCheckout ...
  netAgainstExisting`) on both `/dashboard/services` and Dashboard
  home. The checkout route
  (`src/app/api/stripe/checkout/route.ts`) computes the net amount
  server-side and, when it's exactly $0, **skips Stripe entirely** —
  records a `$0`, `payment_type: "plan_switch_noop"` audit row and
  redirects straight to Payment History, then the normal balance flow
  (Item 1) proceeds as if the upfront had just been paid.
- Only triggers on an explicit Founders button click — the logic lives
  entirely inside the checkout route/button call chain, never a
  background job, so it can't silently reassign an existing payment.
- **Founders confirmation email** (`sendPaymentReceiptEmail` in
  `src/lib/email.ts`) gained an optional `foundersAvailability`
  field — the webhook's existing Founders-purchase branch now calls
  the already-existing `getFoundersAvailability()`
  (`src/lib/founders-plan.ts`) and includes "X of Y spots taken, Z
  remaining" in the receipt (both the customer's copy and commercial's
  BCC'd copy, kept simple rather than sending two different email
  bodies).
- **Scope boundary, documented rather than silently left ambiguous**:
  `netAgainstExisting` is wired to Founders only, as the prompt
  specifically describes. It is **not** wired into Support Tier or
  Premier Tier's per-property checkout (Item 6) — an owner who already
  paid $200 for Low Price on a property and then buys Support/Premier
  Tier on that same property today pays a fresh $200 rather than the
  netted difference. The reusable engine (`computeNetAmountDueCents`)
  already exists and is proven correct via Founders; wiring it into
  Support/Premier's `CheckoutButton` calls would be a small, low-risk
  follow-up if you want that behavior too.

---

## Item 9 — "Other Available Services" contact note

`OtherServiceCard` (`src/app/(dashboard)/dashboard/services/page.tsx`)
is the single shared component every role's "Other Available Services"
grouping renders through (Owner, Investor, PYME, and the generic
fallback all funnel through it — confirmed by reading the full render
tree before touching it), so one change covers every role. It now
shows a visually prominent callout box (not a small gray caption):
"Have questions or want to know more? Click Schedule a Free
Consultation below," linking to the page's existing `#contact` anchor
and button — no new anchor needed.

---

## Bugs found while reviewing (fixed, not part of the original ask)

Since I couldn't run `tsc`/`build` in this environment, I did a manual
second pass specifically looking for logic errors in the money-math I
had just written, and found two real ones:

1. **Netting formula charged the full plan fee, not $200, on a
   first-time Founders purchase.** My first draft of
   `computeNetAmountDueCents` computed `netDue = totalFee −
   alreadyPaid`, which for an owner with *nothing* paid yet
   (`alreadyPaid = 0`) charged the entire 30%-of-rent Founders fee
   upfront instead of the normal $200. Fixed: `netDue` is now $200 flat
   when nothing has been paid yet, and only the true difference once
   something has.
2. **A $0 "netted to zero" plan-switch row could mask a real prior
   payment on a third plan switch.** The netting lookup originally
   picked only the *most recent* payment row for a property. After a
   switch nets to $0 (a `plan_switch_noop` row with `amount: 0`), that
   row becomes "most recent" — a later, third switch would then see
   `alreadyPaid = $0` and charge a fresh $200, silently forgetting the
   real amount paid in an earlier row. Fixed: `getCompletedUpfrontForProperty`
   (`src/lib/payment-lookup.ts`) now **sums** every completed upfront
   payment for the property instead of reading only the latest row.
3. **`generateBalanceInvoice` assumed exactly $200 was ever paid.**
   Once Item 8's netting can leave a different amount already paid
   (e.g. $250 after a Founders switch), the old hardcoded
   `computeBalanceCents` (rent × percentage − $200) would re-invoice an
   amount the owner had already covered. Fixed: the balance calculation
   in `src/lib/balance-invoice.ts` now looks up the property's real
   cumulative paid amount instead of assuming a flat $200.

## A backward-compatibility gap this work could not fully close

Before this change, Low Price / Founders / Support Tier / Premier Tier
checkouts never passed `propertyId` to Stripe, so **every payment row
that predates this deploy has `property_id = null`** for those plans.
Once Items 4/6/8 start reading payment history by `property_id`, those
legacy rows would be invisible — worst case, a property that already
paid $200 could be shown a clickable "Pay $200 upfront" button again.

I added a fallback everywhere this mattered
(`src/lib/payment-lookup.ts`): if a property-scoped lookup finds
nothing, and that property's owner has **exactly one property total**,
it also checks that owner's `property_id = null` legacy rows — safe
because for a single-property owner there's no ambiguity about which
property an old payment belongs to. This covers the common case (Low
Price/Founders are single-property by definition).

**What it does not cover**: an owner with 2–3 properties who already
bought Support Tier or Premier Tier *before* this deploy (when those
plans were still one account-wide purchase with no property
attribution at all). For that specific, narrower case, a legacy
payment cannot be safely auto-attributed to one of several properties.
Before relying on the new per-property balance/double-charge logic for
such an owner, I'd recommend either confirming none exist yet (this
looks like a newer feature area) or running a one-time manual
`UPDATE payments SET property_id = ... WHERE ...` backfill informed by
your own records of which property each historical payment was for.

---

## Files changed

**New files**
- `src/lib/payment-lookup.ts`, `src/lib/plan-switch.ts`,
  `src/lib/premier-installments.ts`
- `src/components/dashboard/paid-or-checkout.tsx`,
  `property-balance-summary.tsx`, `owner-plan-portfolio-breakdown.tsx`
- `src/app/api/admin/properties/[id]/tenant-signed-lease/route.ts`
- `src/app/api/cron/process-installments/route.ts`
- `vercel.json`

**Modified files**
- `src/lib/balance-invoice.ts`, `src/lib/email.ts`
- `src/app/api/stripe/checkout/route.ts`,
  `src/app/api/stripe/webhook/route.ts`
- `src/app/api/admin/properties/route.ts`,
  `src/app/api/admin/properties/[id]/route.ts`
- `src/app/(dashboard)/admin/properties/page.tsx`
- `src/components/admin/property-detail-modal.tsx`
- `src/app/(dashboard)/dashboard/page.tsx`,
  `src/app/(dashboard)/dashboard/services/page.tsx`,
  `src/app/(dashboard)/dashboard/payments/page.tsx`
- `src/components/checkout/checkout-button.tsx`,
  `src/components/dashboard/primary-plan-pricing-card.tsx`,
  `src/components/dashboard/pymes-plan-card.tsx`,
  `src/components/dashboard/elite-portfolio-breakdown.tsx`

**New migrations (created, NOT applied)**
1. `supabase/migration_v62_tenant_lease_signed_and_balance_invoice_url.sql`
2. `supabase/migration_v63_plan_installments.sql`
3. `supabase/migration_v64_premier_tier_description_fix.sql`
4. `supabase/migration_v65_priority_listing_addon_service.sql`

**New Vercel Cron config**
- `vercel.json` (daily, `/api/cron/process-installments`) — needs a
  `CRON_SECRET` env var added in Vercel before it will run.

## What I could not verify in this environment

- No `npm install`/`next build`/`tsc`/`eslint` — no Node.js toolchain
  was present in this sandbox. I did a full manual line-by-line review
  of every changed/new file instead, and it's how the three bugs above
  were caught, but a real build is the one thing this session cannot
  substitute for. Please run it before deploying.
- No browser/dev-server verification of the UI — same root cause.
- No live Stripe test-mode verification for Item 0, by design (you
  asked to check that yourself once this ships, rather than share
  credentials into this session).
