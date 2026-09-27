# Open questions before implementing items 1, 2 & 4 (upfront/balance payment flow)

Before writing any code for the 5-item payment-flow request, I hit three
design forks where the codebase already has relevant (sometimes
conflicting) precedent, and where guessing wrong would mean redoing a
large chunk of the work. This file lays out exactly what I found and the
options I was weighing, so you can decide instead of me assuming.

No files have been changed. Nothing has been implemented.

---

## Question 1 — Reuse the existing Stripe Invoice flow, or build a new Stripe Checkout flow, for "Pay remaining balance"?

### What I found already in the codebase

There is already a complete, working, previously-shipped mechanism for
exactly this "pay the balance once the tenant signs the lease" flow —
it's just not exposed to the customer yet:

- **`supabase/migration_v37_property_balance_invoice.sql`** added
  `properties.balance_invoice_id`, `balance_invoice_status`,
  `balance_invoice_amount`, `balance_invoice_sent_at`,
  `balance_invoice_paid_at`.
- **`src/lib/plan-percentage.ts`** already has `getPlanPercentage(serviceName)`
  (Low Price 35%, Founders 30%, Support/Premier 30%/28%) and
  `computeBalanceCents({ monthlyRentCad, planPercentage })`, which
  subtracts the flat `PLAN_UPFRONT_AMOUNT_CAD = 200`.
- **`src/lib/balance-invoice.ts`** — `generateBalanceInvoice(propertyId)`:
  finds the owner's most recent completed plan-category payment, looks up
  its percentage, computes the balance, creates a Stripe **Invoice**
  (not a Checkout Session) via `stripe.invoiceItems.create` +
  `stripe.invoices.create({ collection_method: "send_invoice", ... })`,
  finalizes it, and calls `stripe.invoices.sendInvoice()` — which makes
  Stripe email the customer a hosted payment page directly. It persists
  `balance_invoice_id`, `balance_invoice_status: "open"`,
  `balance_invoice_amount`, `balance_invoice_sent_at` on the property row.
  It does **not** currently persist the `hosted_invoice_url` anywhere.
- **Trigger today**: `src/app/api/admin/properties/route.ts` PATCH handler
  — when Sales/Admin toggles a property's `is_available` switch to
  `false`, it calls `generateBalanceInvoice()` in-process. The code
  comment there literally says: *"toggling Available -> false is Alex's
  signal that the tenant signed the lease."* There's also a standalone
  re-trigger endpoint, `POST /api/admin/properties/[id]/balance-invoice`,
  for retrying a failed run.
- **Webhook side**: `src/app/api/stripe/webhook/route.ts`'s
  `invoice.payment_succeeded` and `invoice.payment_failed` handlers
  already have a dedicated branch for `invoice.metadata?.kind ===
  "plan_balance"` — on success it sets `balance_invoice_status: "paid"`,
  stamps `balance_invoice_paid_at`, and inserts a `payments` row
  (`payment_type: "plan_balance"`) so it shows in Payment History and
  Sales Report. On failure it marks the property `overdue`/`uncollectible`.

So: the balance percentage math, the idempotent invoice creation, the
Stripe-side customer email, and the webhook reconciliation into
`payments` **all already exist and appear to already work** — nothing in
this chain is broken as far as I can tell from reading it. What's
missing is only: (a) no customer-facing button/page ever surfaces this
to the owner, (b) the `hosted_invoice_url` isn't persisted so there's
nothing to link to without an extra Stripe API call, (c) no "your
balance is now payable" email from *our* app (only Stripe's own generic
invoice email fires), and (d) the "Tenant signed lease" action you asked
for doesn't exist as its own explicit action — today it's implicit in
the `is_available` toggle.

Your item 2 request says: *"opens a Stripe Checkout for the exact
remaining amount."* Stripe Checkout Sessions and Stripe Invoices are two
different primitives. Building a **new** Checkout Session flow for the
balance would run in parallel with, not replace, everything above — two
systems charging "the balance," with two different code paths to keep in
sync, two different places the money could show up, and the existing
`invoice.payment_succeeded`/`failed` handling would become dead code (or
you'd have both handlers live, dealing with the same conceptual event).

### Option A — Reuse the existing Stripe Invoice flow (this is what I'd lean toward if I had to pick)
**What it means:** Add `properties.balance_invoice_url` (persist
`hosted_invoice_url` from `generateBalanceInvoice`), build the new "Mark
lease signed" action to call the same `generateBalanceInvoice()` you
already have, and have the "Pay remaining balance" button in Payment
History link straight to that hosted URL. Add one new branded email
(matching the existing `email.ts` templates) that says "your balance is
now payable" with a link to Payment History, sent right after
`generateBalanceInvoice` succeeds — on top of, not instead of, Stripe's
own invoice email.
- **Pros:** Small amount of new code. Reuses logic that's already been
  tested against real Stripe events (the `invoice.payment_succeeded`
  webhook branch, the idempotency check via `balance_invoice_id`).
  Doesn't create a second "what actually charged the balance" code path.
- **Cons:** Doesn't literally match the word "Checkout" in your request
  — the customer pays via a Stripe-hosted **Invoice** page, not a
  Checkout Session page. Visually similar (both are Stripe-hosted
  payment pages with a "Pay" button) but a different URL shape
  (`invoice.stripe.com/...` vs `checkout.stripe.com/...`) and a couple of
  small feature differences (e.g. Invoices don't support
  `allow_promotion_codes`/`consent_collection` the way Checkout Sessions
  do — not obviously relevant here since a promo code on a final balance
  wasn't requested, but flagging it as the main behavioral gap).

### Option B — Build a new Stripe Checkout Session flow for the balance
**What it means:** Leave `balance-invoice.ts` alone (or stop calling it),
and instead write a new endpoint that creates a one-off Checkout Session
for `computeBalanceCents(...)`, with its own webhook branch (or reusing
`checkout.session.completed` with a new `metadata.payment_type ===
"plan_balance"` case instead of the existing Invoice-based
`invoice.metadata.kind === "plan_balance"` case).
- **Pros:** Matches the literal word "Checkout" from the request. Gives
  a Checkout Session's UX (e.g. saved payment methods, Link, etc.) if
  that matters to you.
- **Cons:** More new code. Two parallel "charge the balance" systems
  unless you also rip out the `is_available`-toggle-triggers-invoice
  path and the existing `invoice.payment_succeeded`/`failed` handling
  for `plan_balance` — which is a behavior change beyond what was asked,
  and touches code that's already live and (as far as I can tell) not
  broken.

---

## Question 2 — Premier Tier's real multi-stage schedule, or a simplified single balance?

### What I found

`src/lib/constants.ts` (`OWNER_TIERS.preferred_owners.plans`) describes
two different balance shapes for the two Preferred Owners plans:

- **Support Tier:** *"$200 system fee per property upfront (deducted
  from %) — Pay the balance only after tenant signs the lease."* → one
  lump balance. This is the shape `computeBalanceCents` /
  `generateBalanceInvoice` already implement.
- **Premier Tier:** *"1st property: 30% — $200 upfront, balance at month
  2 after lease signing. 2nd & 3rd: 28% — $200 upfront, 50% at month 1,
  30% at month 2, 20% at month 3."* → a genuinely different,
  multi-installment schedule that depends on which property number it is
  (1st vs. 2nd/3rd) and runs over several months post-lease-signing, not
  a single balance due once.

Nothing in the codebase currently computes or schedules this Premier
multi-stage split — `getPlanPercentage()` only returns a flat percentage
per plan name, with no notion of "which stage" or "which property
number."

### Option A — Simplify Premier to one lump balance at lease-signing (leaning this way)
Treat Premier the same as Support Tier for this pass: one balance
(`rent * percentage - $200`) invoiced/payable once lease is signed.
Document the real month-1/month-2/month-3 split as a known simplification
and a follow-up item.
- **Pros:** Reuses the exact same `generateBalanceInvoice` /
  `computeBalanceCents` path as Support Tier — no new scheduling
  machinery. Ships now.
- **Cons:** Doesn't match Premier's actual sold terms. A Premier
  customer would be asked for the whole balance at once instead of in 3
  installments — which is arguably a bigger deviation from what they
  were sold than a UI wording issue, since it changes cash-flow timing
  for the customer.

### Option B — Build the real multi-stage schedule now
Model "1st property: 100% of balance at month 2" and "2nd/3rd: 50% /
30% / 20% at months 1/2/3" as scheduled charges (e.g. Stripe subscription
schedules, or manually-created future invoices with `due_date` staggered
by month, triggered off `lease_signed_at`).
- **Pros:** Matches what Premier customers were actually sold.
- **Cons:** Meaningfully larger scope — needs a scheduling mechanism
  that doesn't exist anywhere in this codebase today (the closest
  precedent, the PYMES installment subscriptions in the webhook, is a
  fixed-count monthly Stripe *subscription* created at upfront-payment
  time, not a set of future invoices keyed off a later "lease signed"
  event with per-stage percentages that also vary by property number).
  Would need real business-rule confirmation too — e.g. what happens if
  a payment in the middle of the schedule fails, whether "month 1" means
  30 days after lease-signing or the 1st of the next calendar month, etc.
  — details the plan text doesn't fully specify.

---

## Question 3 — Restructure Support/Premier Tier to be per-property now, or keep the current per-account granularity?

### What I found

I audited every `<CheckoutButton ... />` call site in `src/` (12 total,
across 6 files). For the **Elite** tiers (Investor), each property
already gets its own card with its own button — see
`src/components/dashboard/elite-portfolio-breakdown.tsx`, which maps over
`properties` and renders one `CheckoutButton` per property, passing
`propertyId={prop.id}`.

**Support Tier and Premier Tier have no equivalent.** In
`src/app/(dashboard)/dashboard/services/page.tsx`, each of these two
plans renders as a **single card with a single button** for the whole
account (lines ~746-790 for Support Tier inside `availablePlans.map`,
lines ~793-838 for Premier Tier) — neither passes a `propertyId` prop at
all. So today, a Preferred Owner with 2-3 properties sees one "Pay $200
upfront" button total, not one per property — even though the plan text
explicitly says *"$200 system fee **per property** upfront."* This
looks like a pre-existing gap, not something introduced by this task.

This matters for your items 1 and 4 specifically:
- **Item 1** (don't double-charge the upfront) is naturally a per-property
  concept for these two plans — "has this *property's* $200 already been
  paid," not "has this user ever paid $200 for anything." With no
  per-property button today, there's no clean place to attach a
  per-property "already paid" check for Support/Premier.
- **Item 4** (net a plan-switch against what's already been paid "for
  that property") explicitly asks me to "detect the existing payment by
  property_id." For Low Price/Founders this works cleanly (Basic tier is
  capped at exactly one property per `migration_v59`'s own eligibility
  note). For Support/Premier with 2-3 properties, there's currently no
  way for the checkout call to even know *which* of the owner's
  properties the $200 is for, because the button never asks.

### Option A — Restructure Support/Premier Tier to per-property cards now (leaning this way for correctness)
Mirror the existing `ElitePortfolioBreakdown` pattern: render one
row/card per property under Support/Premier Tier, each with its own
`CheckoutButton propertyId={...}`, its own "already paid" state, and its
own switch-netting.
- **Pros:** Actually matches "per property" from the plan text. Makes
  items 1 and 4 fully correct for 2-3-property Preferred Owners, not
  just Basic-tier's single-property case.
- **Cons:** The single largest piece of new UI work in this whole
  request — a real restructuring of how these two plan cards render,
  not just a conditional swap on an existing button.

### Option B — Keep the current single button per tier (no property scoping)
Leave Support/Premier Tier exactly as they render today (one button,
whole-account). Apply items 1 and 4's logic at the user+service level
for these two plans only (Low Price/Founders/Elite still get correct
per-property logic, since Basic tier is single-property and Elite is
already per-property).
- **Pros:** Much smaller change. Doesn't touch Support/Premier Tier's
  existing rendering at all.
- **Cons:** Doesn't fully satisfy "apply this transversally... to every
  plan/role" for Support/Premier specifically once an owner has more
  than one property — a 2-3 property Preferred Owner would still only
  ever be able to pay one $200 total through the UI (today's existing
  behavior), and the double-charge guard would trigger after the first
  property's payment even though a second property's balance hasn't
  been addressed yet. This carries the pre-existing gap forward rather
  than fixing it, but doesn't newly break anything either.

---

## Why I'm asking instead of picking

Each of these three forks changes the shape and size of the
implementation in a way that would be expensive to undo:

- Q1 determines whether item 2 is "expose and email around existing,
  tested code" (small) or "build and wire a second charging mechanism"
  (large, with a decision needed about what happens to the existing one).
- Q2 determines whether Premier Tier's balance is a two-line change
  (reuse Support Tier's path) or a new scheduling subsystem.
- Q3 determines whether Support/Premier Tier need a UI restructuring on
  the scale of the Elite portfolio breakdown, or not.

I'd rather confirm these than build the wrong-sized thing and have to
redo it.
