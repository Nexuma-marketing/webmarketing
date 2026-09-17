# Root Cause (why $200 deposit model was wrong for this tier)

`BELOW_PORTFOLIO_MINIMUM_FALLBACK_FIX.md` modeled "Below Portfolio
Minimum"'s one-time fee (30% of rent) on the **Low Price / Founders
Package** pattern: charge a flat $200 via Stripe, defer the rest to a
manual balance invoiced after lease signing. That pattern exists for Low
Price/Founders for a specific reason — their percentage applies to
**future rent the tenant hasn't signed yet** (first month's rent at
lease signing), so the exact dollar amount genuinely isn't known at
checkout time, which is why those plans only charge a $200 deposit
upfront and invoice the balance later.

"Below Portfolio Minimum" is different: its 30% is of the property's
**current, already-known `monthly_rent`** — the exact dollar amount
(`monthly_rent × 30%`) is fully computable the moment the property
exists, with nothing pending. That's exactly the same situation as
Essentials/Signature/Luxury, which already charge their full one-time
fee via Stripe with no manual step. There was no reason to defer any of
it — the $200-deposit model was simply copied from the wrong precedent.

# Dynamic Stripe Price Creation Implemented (full 30% charged automatically)

Changed `src/app/api/stripe/checkout/route.ts`'s `"service"` case so the
one-time charge amount for this tier is computed server-side from the
property's own rent instead of read from the fixed `services.price`
column:

```ts
const chargeAmount = eliteTierInfo?.oneTimeFeePercent
  ? Math.round(propertyMonthlyRent * eliteTierInfo.oneTimeFeePercent * 100) / 100
  : service.price;

const baseCents = Math.round(chargeAmount * 100);
```

`propertyMonthlyRent` is read from the same ownership-checked `properties`
query already used to verify the property belongs to the requesting user
(now also selecting `monthly_rent`) — never trusted from client input,
exactly like `elite_tier` already wasn't. `chargeAmount` then flows
through the existing `unitAmount` → promo-code discount → Stripe
`price_data.unit_amount` pipeline completely unchanged, so tax handling,
GST line items, and promo codes all keep working identically for this
tier.

**On the "use `stripe.prices.create(...)`" instruction** — I implemented
this via the checkout route's existing inline `price_data` on the
Checkout Session line item, not a separate persisted
`stripe.prices.create()` call, and want to explain that choice rather
than silently deviate:

- Every "service" checkout in this route (Essentials, Signature, Luxury,
  Low Price, Founders, promo-discounted amounts — all of it) already
  uses `price_data` inline on the session's `line_items`, never a
  pre-created `Price` object. That *is* Stripe's dynamic-pricing
  mechanism for a one-time Checkout Session — a `Price` you `create()`
  ahead of time is for something you intend to reference again (a
  recurring subscription item, a reusable catalog price); an inline
  `price_data` object is exactly the mechanism Stripe recommends for a
  one-off amount computed at request time, which is precisely this
  case.
- The webhook's `stripe.prices.create()` call (for the $200/month
  subscription) exists because Stripe **Subscriptions** need a
  persisted Price to attach a subscription item to — that's a
  Subscriptions API requirement, not a general "dynamic pricing needs
  `prices.create()`" rule. A one-time `payment` mode Checkout Session has
  no such requirement.
- So the correct read of "use the same dynamic-price pattern already
  used elsewhere" is: reuse the *general principle* (compute the amount
  server-side at request time, never store one static number that has
  to serve every case) — which this change does — via the mechanism
  that's actually idiomatic for a one-time charge, which this codebase
  was already using throughout this exact function.

Adding a redundant `stripe.prices.create()` call here would create a
throwaway Price object on every single checkout attempt (never reused,
since the amount differs per property) for no functional benefit over
the inline `price_data` this route already relies on everywhere else.

Also fixed the customer-facing recurring-fee disclosure text, which
previously read `$${service.price}` (a static DB value, and one that's
about to become an uninformative `$0` — see below); it now reads
`$${chargeAmount}`, the real computed amount, for every tier — no visible
change for Essentials/Signature/Luxury/Low Price/Founders since
`chargeAmount === service.price` for all of them.

# Services Row / Migration Adjusted (or removed, with reasoning)

**Kept the row, but no longer treats its `price` as the charged
amount.** Considered removing it entirely, but two structural (not
pricing) reasons still require a `services` row for this tier:

1. The checkout API's `"service"` type requires a `serviceId` — the
   client (`ElitePortfolioBreakdown`) needs something to send.
2. The checkout route's tier-verification check
   (`ELITE_SUB_TIERS[property.elite_tier].dbServiceName === service.name`)
   is what proves server-side that this specific checkout really is the
   Elite fee for a property genuinely assigned this tier, before it's
   allowed to trigger the recurring maintenance subscription. This is
   the same security-relevant mechanism Essentials/Signature/Luxury
   already rely on, and removing the row would remove that guard for
   this tier too.

What changed in
[supabase/migration_v57_below_portfolio_minimum_service.sql](supabase/migration_v57_below_portfolio_minimum_service.sql)
(rewritten in place — it was never applied, so there's no need for a
follow-up `UPDATE` migration):

- `price` changed from `200` to **`0`** — it can never correctly
  represent "the" charge amount (that's per-property, computed at
  checkout time), so leaving a stale $200 in the catalog would be
  actively misleading in the admin pricing table. `0` here follows the
  same existing precedent as "Plan: Owner Preferred — Support/Premier
  Tier" (`migration_v28_plan_service_prices.sql`, "$0 by design" — also
  not a flat per-purchase amount).
- Description rewritten to drop the deposit/balance wording and state
  plainly that the real amount is computed per property and charged in
  full at checkout, and that `price = 0` here is a deliberate catalog
  placeholder, not the charged amount.
- Because `price` is no longer meaningful for this tier's purchasability
  check, also updated
  [elite-portfolio-breakdown.tsx](src/components/dashboard/elite-portfolio-breakdown.tsx#L136)'s
  gate for showing the Acquire button: it now checks
  `tier.oneTimeFeePercent ? rent > 0 : Number(service.price) > 0` instead
  of always requiring `service.price > 0` — for this tier, "purchasable"
  correctly means "the property has a rent to compute from" (always true
  once it's classified into this tier), not "the catalog row has a
  positive price."

# CFP/Payback Confirmed Still Correct

Verified — **no changes were needed here**, and this is worth stating
explicitly since it's easy to assume the previous fix got this wrong
too. It didn't: `profileOwner()` (`src/lib/profiling.ts`) and
`getPortfolioFee()` (`src/app/forms/propietario/page.tsx`) already
computed the Payback "one-time fee" input as the **full** `rent × 30%`
(`BELOW_MINIMUM_FEE_PERCENT`), never the $200 deposit — that part of the
prior fix was already internally consistent with "the full 30% is the
real fee," it was *only* the Stripe checkout amount that was wrongly
pegged to $200. So:

- CFP = `rent × 10%` — unaffected by any of this, as always.
- Payback = `(rent × 30%) / CFP` — was already using the full 30% before
  this fix, and still does. The dashboard's displayed "One-time fee" and
  the Acquire button's charge amount now finally **match** that same
  `rent × 30%` figure (previously the display/Payback math used the full
  30% while the actual Stripe charge silently only took $200 of it —
  those two numbers are now consistent everywhere).

# Files Modified

- [src/app/api/stripe/checkout/route.ts](src/app/api/stripe/checkout/route.ts) — selects `monthly_rent` on the
  ownership-checked property; computes `chargeAmount` from
  `monthly_rent × oneTimeFeePercent` for this tier (else unchanged,
  `service.price`); `baseCents`, the promo-code base amount, and the
  recurring-fee disclosure text all now use `chargeAmount` instead of
  `service.price`.
- [src/lib/constants.ts](src/lib/constants.ts) — `ELITE_SUB_TIERS.below_minimum.feeDescription`
  and its surrounding comment rewritten to describe the full-charge
  model instead of the deposit/balance model.
- [src/components/dashboard/elite-portfolio-breakdown.tsx](src/components/dashboard/elite-portfolio-breakdown.tsx) — Acquire
  button label for this tier now reads
  `Acquire {name} — Pay $X CAD one-time` (identical wording style to
  Essentials/Signature/Luxury; the "deposit toward the 30%... balance
  after lease signing" wording is gone), using the already-computed
  `oneTimeFee` (full `rent × 30%`) instead of `service.price`;
  purchasability gate updated to not depend on `service.price` for
  percentage-based tiers.
- [supabase/migration_v57_below_portfolio_minimum_service.sql](supabase/migration_v57_below_portfolio_minimum_service.sql) —
  rewritten (still unapplied): `price` 200 → 0, description corrected,
  reasoning for keeping the row documented inline.

# What Was Intentionally Not Changed

- `src/app/api/stripe/webhook/route.ts` — zero changes. The $200/month
  recurring subscription creation already reads
  `ELITE_SUB_TIERS[metadata.elite_tier].monthlyFee` generically and was
  never part of the bug.
- Essentials/Signature/Luxury's full-fee-via-Stripe behavior —
  unaffected; for them `eliteTierInfo?.oneTimeFeePercent` is undefined,
  so `chargeAmount` falls through to the exact same `service.price` path
  as before.
- Low Price / Founders Package's $200-deposit-then-manual-balance
  model — untouched; that pattern remains correct for those two plans,
  where the percentage is of not-yet-known future rent.
- The 30% rate and the $2,500 Essentials threshold — unchanged.
- No commit, push, deploy, or migration execution was performed.

# Expected Result

For an Investor property at, e.g., $1,800/month rent classified as
"Below Portfolio Minimum":

- The per-property card shows "One-time fee: $540 CAD (30% of rent)" —
  unchanged from before (this was already correct).
- The Acquire button now reads **"Acquire Below Portfolio Minimum — Pay
  $540 CAD one-time"** (no more "$200 CAD upfront... balance after lease
  signing" wording) — matching the exact style of "Acquire Essentials —
  Pay $900 CAD one-time".
- Completing checkout charges the customer **$540 CAD in full via
  Stripe**, automatically computed from the property's rent — no manual
  balance, no e-transfer, no deferred invoice.
- The $200/month recurring maintenance-fee subscription still starts
  automatically after that one-time payment succeeds, exactly as before.
- CFP ($180/mo) and Payback (540 / 180 = 3.0 months) remain correct and
  now finally match the amount actually charged.
