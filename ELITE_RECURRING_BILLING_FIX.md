# Elite Recurring Billing Fix

Scope: Elite Assets & Legacy (investor) monthly maintenance-fee billing
only. Fee amounts, portfolio classification, and CFP/Payback math were
not touched. The PYMES installment subscription code path was not
modified — only its pattern was mirrored in new, separate code. No
migration was applied, no commit/push/deploy was made.

---

# Migration Created (property_id column on payments)

**File (not applied):**
[supabase/migration_v50_payments_property_id.sql](supabase/migration_v50_payments_property_id.sql)

Additive only:
- `ALTER TABLE payments ADD COLUMN IF NOT EXISTS property_id UUID;`
- `payments_property_id_fkey` → `properties(id)`, **`ON DELETE SET
  NULL`** — deliberately matching the existing `service_id` and
  `pymes_plan_id` foreign keys on this same table (both `ON DELETE SET
  NULL`, see `migration_v2_mvp.sql` lines 130-136 / 287-289), not the
  unrelated `ON DELETE CASCADE` used on `property_images.property_id`
  (a different table with different semantics — deleting a property
  should not delete its payment history).
- `idx_payments_property_id` partial index (`WHERE property_id IS NOT
  NULL`), matching the style of the existing
  `idx_payments_stripe_subscription_id` partial index.
- No other column, table, RLS policy, or existing row was touched.

---

# Recurring Subscription Logic Implemented (mirroring PYMES pattern)

**Where the tier is determined (server-side only, never trusted from
the client):** `src/app/api/stripe/checkout/route.ts`, `"service"`
case. When `propertyId` is provided, the route now also selects
`elite_tier` on the ownership-checked property row and checks whether
the service being purchased (`service.name`) matches that property's
own assigned tier's `dbServiceName` (`ELITE_SUB_TIERS[...].dbServiceName`,
`src/lib/constants.ts`). Only if they match does it set
`eliteTierForSubscription`, which becomes `metadata.elite_tier` on the
Stripe Checkout Session (alongside the existing `metadata.property_id`
from the prior task). This means a client can't spoof a subscription
by sending an arbitrary `elite_tier` — it's derived from the DB.

**Where the subscription is created:**
`src/app/api/stripe/webhook/route.ts`, inside the existing
`checkout.session.completed` handler, in a **new, separate `if` block**
placed immediately after (not inside or replacing) the existing PYMES
upfront-installment block:

```ts
if (
  paymentType === "one_time" &&
  metadata.property_id &&
  metadata.elite_tier &&
  ELITE_SUB_TIERS[metadata.elite_tier]
) {
  const tier = ELITE_SUB_TIERS[metadata.elite_tier];
  // stripe.prices.create({ recurring: { interval: "month" }, ... })
  // stripe.subscriptions.create({ customer, items: [{ price }], metadata: {
  //   kind: "elite_maintenance", user_id, property_id, elite_tier,
  // }})
}
```

This is the same two-call pattern as the PYMES block
(`stripe.prices.create` with `recurring.interval: "month"`, then
`stripe.subscriptions.create`), including the same GST workaround
(`STRIPE_GST_RATE_ID` manual tax rate, falling back to
`automatic_tax`). Two intentional differences from PYMES, both required
by the confirmed business rule:
- **No `total_installments`** metadata and no auto-cancel-after-N-payments
  logic — Elite maintenance is not a fixed-term installment plan, it
  bills every month indefinitely until the customer or an admin cancels
  it (via the existing `/api/stripe/cancel-my-subscription` route,
  which already works generically — see below).
- Triggered by `metadata.property_id` + `metadata.elite_tier` instead of
  `metadata.pymes_plan_id` + `metadata.installment_months`.

The PYMES `if` block above it was not edited in any way.

---

# Webhook Attribution Confirmed (recurring payments linked to property)

Four places in `src/app/api/stripe/webhook/route.ts` now attribute
payments/events to `property_id`, all additive (`null` for every
existing non-Elite payment type, so PYMES/Owner behavior is unchanged):

1. **`checkout.session.completed`** — the existing generic payment
   insert (used for every checkout type) now also writes
   `property_id: metadata.property_id || null`. This covers the
   one-time Elite portfolio fee itself, not just the recurring fee.
2. **`invoice.payment_succeeded`** — new branch, checked *before* the
   untouched PYMES logic: `if (metadata.kind === "elite_maintenance" &&
   metadata.property_id)` inserts a `payments` row with
   `payment_type: "elite_maintenance"` and `property_id` set, then
   `break`s (never reaches the PYMES-specific installment-counting
   code).
3. **`invoice.payment_failed`** — same `kind === "elite_maintenance"`
   check; when true, records `payment_type: "elite_maintenance"` and
   `property_id` instead of `"installment"`/`null` (the PYMES rows this
   handler also serves are byte-for-byte unaffected).
4. **`customer.subscription.deleted`** — the cancellation marker row
   now also carries `property_id: metadata.property_id || null`, so a
   canceled Elite maintenance subscription shows up attributed to its
   property too.

**Payment History UI**
(`src/app/(dashboard)/dashboard/payments/page.tsx`) — updated to
actually surface this attribution instead of just having it sit unused
in the DB: the query now also joins `properties:property_id (address,
city)`, and both the "Active installment plans" group label and the
"Service / Plan" table column fall back to `Elite maintenance —
{address}, {city}` when there's no `services`/`pymes_plans` name to
show (i.e., exactly the Elite maintenance rows). The existing
cancel-subscription flow needed no changes: `CancelSubscriptionButton`
→ `/api/stripe/cancel-my-subscription` authorizes by matching
`stripe_subscription_id` + `user_id` on a `payments` row — since Elite
maintenance rows now have `stripe_subscription_id` set, cancellation
already works for them with zero code changes to that route.

---

# Manual-Billing Notice Removed

Removed from
`src/components/dashboard/elite-portfolio-breakdown.tsx` (the shared
component used by both Dashboard home and Recommended Services):

> ~~The $X CAD/mo maintenance fee for this property is billed
> separately by our team; it is not yet collected automatically at
> checkout.~~

Replaced with the disclosure described below.

---

# Customer Disclosure Before Checkout (how it's communicated)

Two layers, so no one is silently enrolled in recurring billing:

1. **Our own UI, before the click** — the note directly under each
   "Acquire {Tier}" button now reads: *"Completing this purchase also
   enrolls this property in an automatic recurring charge of $X
   CAD/month (maintenance fee), billed monthly until canceled."*
2. **Stripe Checkout's own line item, on the payment page itself** —
   `src/app/api/stripe/checkout/route.ts` appends to the line item
   `description` (visible on the Checkout page before the customer
   enters payment details): *"By completing this one-time payment of $X
   CAD, you also authorize a separate recurring monthly charge of $Y CAD
   (maintenance fee for this property), billed automatically each month
   until canceled."* This only appears when the purchase actually is an
   Elite one-time fee tied to a property (never for Basic/Preferred/
   Founders/other services). It's appended (not overwritten) so it
   still shows up even if the customer also applies a promo code —
   fixed a latent bug in the same line where the promo-code branch used
   to overwrite `descriptionSuffix` instead of appending to it.

---

# Files Modified

- `supabase/migration_v50_payments_property_id.sql` — **new**, not
  applied.
- `src/app/api/stripe/checkout/route.ts` — resolves the property's real
  `elite_tier`, sets `metadata.elite_tier` when it matches the service
  being purchased, adds the pre-checkout recurring-charge disclosure to
  the line item description (fixing the promo-code overwrite bug along
  the way).
- `src/app/api/stripe/webhook/route.ts` — new Elite subscription
  creation block in `checkout.session.completed`; new Elite branch in
  `invoice.payment_succeeded`; `property_id` attribution added to the
  `checkout.session.completed` payment insert, the
  `customer.subscription.deleted` marker insert, and the
  `invoice.payment_failed` insert. PYMES-specific branches themselves
  were not edited.
- `src/components/dashboard/elite-portfolio-breakdown.tsx` — removed
  the manual-billing notice, added the recurring-charge disclosure.
- `src/app/(dashboard)/dashboard/payments/page.tsx` — joins
  `properties(address, city)` and shows an "Elite maintenance —
  {address}" label for property-attributed rows that have no
  service/PYMES-plan name.

# What Was Intentionally Not Changed

- Fee amounts ($900/$1,410/$1,650 one-time, $200/$200/$300 monthly),
  portfolio thresholds, and `ELITE_SUB_TIERS` — read, not modified.
- CFP/Payback calculations (`src/lib/profiling.ts`) — not touched, not
  imported into any of this change.
- The PYMES installment subscription code itself — the `if
  (paymentType === "upfront" && metadata.pymes_plan_id ...)` block in
  `checkout.session.completed`, and the PYMES-specific tail of
  `invoice.payment_succeeded` (installment counting, auto-cancel after
  final installment) — read for reference, not edited.
- `/api/stripe/cancel-my-subscription` — already generic enough to
  cancel an Elite maintenance subscription with no changes.
- Basic/Preferred Owner, Tenant, PYMES pages/flows — untouched.
- The migration was created but **not applied** — no `psql`/Supabase
  CLI/dashboard SQL was run.
- No commit, push, or deploy.

# How To Apply (plain language, Supabase SQL Editor)

**Order matters** — apply the migration *before* any real Elite
purchase goes through this new code path, or the webhook's `payments`
insert will fail with a "column property_id does not exist" error.

1. Open the Supabase dashboard for this project → **SQL Editor**.
2. Open the file
   [supabase/migration_v50_payments_property_id.sql](supabase/migration_v50_payments_property_id.sql)
   in this repo, copy its full contents.
3. Paste into a new SQL Editor query and click **Run**. It only adds a
   column, a foreign key, and an index — it does not touch any existing
   row, so it's safe to run without a maintenance window.
4. Confirm it worked by running the two `SELECT` statements left as
   comments at the bottom of the migration file — the first should
   return one row (`property_id`, `uuid`, `YES`), the second should
   return the constraint name.
5. Once the column exists, deploy the application code changes in this
   task normally (no separate flag/toggle — the new webhook logic only
   activates when `metadata.elite_tier` is present on a session, which
   only happens for Elite property purchases).

# Expected Result

- Clicking "Acquire {Tier}" for a specific property still charges the
  one-time portfolio fee exactly as before, but the customer now sees
  — both on our page and on the Stripe Checkout page itself, before
  paying — that a separate recurring monthly charge will also start.
- On successful payment, a Stripe subscription is created automatically
  for that property's monthly maintenance fee ($200 Essentials/
  Signature, $300 Luxury) and begins billing on its normal monthly
  cycle — no manual invoicing by the commercial team.
- Each recurring invoice (success or failure) and any future
  cancellation is recorded in `payments` with `property_id` set,
  `payment_type: "elite_maintenance"`, so Payment History
  (`/dashboard/payments`) shows it labeled by the property's address
  and lets the customer cancel it with the same button already used for
  PYMES installment plans.
- The old "billed separately by our team" notice no longer appears
  anywhere in the app.
- PYMES installment plans behave identically to before this change —
  their code path was not modified.

**Not verified in a running environment:** as noted in the prior task,
this sandbox has no Node/npm installed, so `next dev`, `tsc --noEmit`,
and a live Stripe test-mode checkout could not be run here. Recommend,
before merging: applying the migration to a staging DB, running a test
purchase in Stripe test mode for one Elite property, confirming the
subscription and its first invoice both appear correctly in
`payments`/Payment History, and confirming `npm run lint` passes.
