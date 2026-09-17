# Fallback Tier Implemented (label, features, pricing logic)

Previously, an Elite/Investor property with rent below the Essentials
minimum ($2,500) got `elite_tier = NULL` from every classification path
in the codebase — no portfolio, no CFP, no payback, no way to purchase
anything for that property, just a static "Below Elite portfolio
minimum" message. Added a genuinely separate fallback classification,
**never a renamed Essentials**:

- **Label**: "Below Portfolio Minimum" — used everywhere the tier name
  is displayed (badge, Acquire button, admin labels), always visually
  and textually distinct from "Essentials."
- **Features**: reuses the exact same 8-item Essentials feature list
  (`ELITE_ESSENTIALS_FEATURES` from `PER_PORTFOLIO_FEATURES_FIX.md`) —
  full Elite-tier service quality, just a different fee structure.
- **Pricing**: flat **30% of that specific property's own monthly
  rent**, one-time — **not** a fixed dollar amount like Essentials
  ($900), Signature ($1,410), or Luxury ($1,650). $200 of it is the
  Stripe checkout deposit (same mechanism already used for "Plan: Low
  Price" / "Plan: Founder Package — Visionary Owners" — see
  `migration_v28_plan_service_prices.sql`: those rows also charge only
  $200 via Stripe, with the rest invoiced out-of-band after lease
  signing). Plus the same $200/month recurring maintenance fee as
  Essentials/Signature.
- **Independence from Support/Premier Tier**: the 30% is a brand-new
  constant (`BELOW_MINIMUM_FEE_PERCENT` / local `getPortfolioFee()`
  helper), never reading from or calling into
  `percentageForPlan()`/Support-Tier/Premier-Tier logic. It does not
  vary with property count or order — always flat 30%, purely Elite-side.
- **Color**: slate (`text-slate-600` / `bg-slate-50` / `border-slate-300`)
  — deliberately not blue/amber/purple (Essentials/Signature/Luxury), so
  it reads as "different," not as a 4th premium rung.

Classification logic updated in **two** places, since the codebase has
two independent classifiers:

1. `src/lib/profiling.ts` — `classifyEliteTier()` (used by
   `profileOwner()`, the admin/system re-profiling path): now returns
   `"below_minimum"` for `0 < rent < 2500` instead of `null`. The
   `$2,500` Essentials threshold itself is untouched; `null` is now
   reserved purely for "no rent set" (`rent <= 0`).
2. `src/app/forms/propietario/page.tsx` — `getPortfolio()` (the actual
   live classification path used when an Investor submits/edits
   properties in the Discovery Brief form, and in the Financial
   Preview / Portfolio Assignment Summary shown while filling it in):
   same fix, same threshold behavior.

Both files also got a fee-lookup helper (`getPortfolioFee()` in
`propietario/page.tsx`, an inline ternary in `profileOwner()`) since the
existing fixed-lookup maps (`PORTFOLIO_ONE_TIME_FEES`,
`PORTFOLIO_FEES`) can't hold a value that depends on each property's own
rent — `below_minimum` is deliberately excluded from those maps'
types/keys and handled as `rent * 0.30` instead, everywhere a one-time
fee is computed.

# CFP/Payback Confirmed Working

- **CFP**: `calculateCFP(rent) = rent × 10%` (both implementations) is
  computed purely from `monthly_rent`, with no branching on tier at all
  — it was already meaningful for any rent, including below $2,500, and
  required no change.
- **Payback**: `Payback = one-time fee / CFP`, same formula as every
  other tier. The only change was what "one-time fee" resolves to for
  this tier: `rent × 30%` (via `getPortfolioFee()` /
  `BELOW_MINIMUM_FEE_PERCENT`) instead of a fixed lookup. Verified both
  call sites:
  - `profileOwner()` (`src/lib/profiling.ts`): `paybackMonths =
    calculatePayback(fee, cfp)` with `fee = rent * BELOW_MINIMUM_FEE_PERCENT`
    when `propEliteTier === "below_minimum"`.
  - Discovery Brief submission and live Financial Preview
    (`src/app/forms/propietario/page.tsx`): both now call
    `getPortfolioFee(portfolio.key, rent)` instead of indexing
    `PORTFOLIO_FEES` directly, so `portfolioFee.oneTime` is correctly
    `rent * 0.30` for this tier before the same `oneTime / cfp` division
    used everywhere else.
- Display: `ElitePortfolioBreakdown` shows the same computed
  `oneTimeFee` (`rent * tier.oneTimeFeePercent` when
  `oneTimeFeePercent` is set) next to "One-time fee," now annotated with
  "(30% of rent)" so it's clear this isn't a flat bracket fee like the
  other three tiers.

# Acquire Button Wired (one-time + recurring, reusing existing checkout pattern)

Reused the exact `ELITE_RECURRING_BILLING_FIX.md` mechanism with **zero
changes** to `src/app/api/stripe/checkout/route.ts` or
`src/app/api/stripe/webhook/route.ts` — both are already fully generic
over whatever key exists in `ELITE_SUB_TIERS`:

- The checkout route resolves `assignedTier = ELITE_SUB_TIERS[property.elite_tier]`
  and checks `assignedTier.dbServiceName === service.name` to decide
  whether to stamp `metadata.elite_tier` on the Stripe session — this
  already works for any tier key, including `"below_minimum"`, with no
  code change.
- The webhook's `checkout.session.completed` handler creates the
  monthly subscription from `ELITE_SUB_TIERS[metadata.elite_tier].monthlyFee`
  — again already generic; `below_minimum.monthlyFee = 200` flows
  through automatically.
- The one-time Stripe charge itself is a normal fixed-price `services`
  row lookup (`service.price`), exactly like every other "service"
  checkout — **not** a dynamically-computed rent-based amount. This
  matches the task's explicit instruction to use "the same $200
  upfront-deposit mechanism already used elsewhere": the new services
  row (see migration below) is priced at a flat **$200**, the deposit
  portion of the 30%, mirroring how "Plan: Low Price" (35%) and "Plan:
  Founder Package" (30%) are also seeded at $200, not their full
  percentage amount.
- `ElitePortfolioBreakdown`'s Acquire button label was adjusted only for
  tiers with `oneTimeFeePercent` set: instead of "Pay $X CAD one-time"
  (accurate for Essentials/Signature/Luxury, which charge the full fee),
  it now reads "Pay $200 CAD upfront (deposit toward the 30% total;
  balance after lease signing)" — so the customer isn't misled into
  thinking $200 is the full charge.
- The existing recurring-charge disclosure paragraph ("Completing this
  purchase also enrolls this property in an automatic recurring charge
  of $200 CAD/month...") needed no change — it already reads generically
  from `tier.monthlyFee`.

**New migration created, not applied** (per instructions — no
commit/push/deploy, and per this project's established pattern of
writing-but-not-running migration files for this kind of change; see
`ELITE_RECURRING_BILLING_FIX.md`'s own unapplied migration):
[supabase/migration_v57_below_portfolio_minimum_service.sql](supabase/migration_v57_below_portfolio_minimum_service.sql)
— inserts one `services` row, `'Plan: Elite — Below Portfolio Minimum'`,
priced at `200` CAD, `target_roles = ['inversionista']`, following the
exact same idempotent `INSERT ... WHERE NOT EXISTS` pattern as
`migration_v11`/`migration_v19`. Until this migration is applied, the
per-property card gracefully falls back to the existing
`Link href="/dashboard/services#contact"` CTA (same fallback every other
sub-tier already uses when its `services` row is missing) instead of a
working CheckoutButton.

# Files Modified

- [src/types/database.ts](src/types/database.ts) — `EliteTier` extended
  with `"below_minimum"`.
- [src/lib/profiling.ts](src/lib/profiling.ts) — `classifyEliteTier()`
  returns `"below_minimum"` for `0 < rent < 2500`; added
  `BELOW_MINIMUM_FEE_PERCENT`; `PORTFOLIO_ONE_TIME_FEES` type narrowed to
  exclude `"below_minimum"` (fee isn't fixed); `profileOwner()`'s fee
  calc branches to `rent * BELOW_MINIMUM_FEE_PERCENT` for this tier.
- [src/lib/constants.ts](src/lib/constants.ts) — added
  `below_minimum` entry to `ELITE_TIERS` (label) and `ELITE_SUB_TIERS`
  (full tier definition incl. new optional `oneTimeFeePercent` field on
  the type); reuses `ELITE_ESSENTIALS_FEATURES` from
  `PER_PORTFOLIO_FEATURES_FIX.md` for its feature list.
- [src/components/dashboard/elite-portfolio-breakdown.tsx](src/components/dashboard/elite-portfolio-breakdown.tsx) —
  computes `oneTimeFee` dynamically (`rent * oneTimeFeePercent`) instead
  of always reading the fixed `tier.oneTimeFee`; annotates the display
  with "(X% of rent)" for percentage-based tiers; Acquire button label
  clarifies the $200 is a deposit for percentage-based tiers; updated
  the stale "Below Elite portfolio minimum" fallback text (a null
  `elite_tier` now only means "no rent set," not "below minimum").
- [src/app/forms/propietario/page.tsx](src/app/forms/propietario/page.tsx) —
  `getPortfolio()` returns the new fallback for `0 < rent < 2500`; added
  `BELOW_MINIMUM_FEE_PERCENT` + `getPortfolioFee()` helper; both
  `PORTFOLIO_FEES[portfolio.key]` lookups (submission payload calc and
  the live per-property Financial Preview) switched to
  `getPortfolioFee(portfolio.key, rent)`; updated two stale "Below Elite
  portfolio minimum" UI strings to reflect that a null portfolio now
  only means no rent was entered.
- [supabase/migration_v57_below_portfolio_minimum_service.sql](supabase/migration_v57_below_portfolio_minimum_service.sql)
  (new, not applied) — seeds the `services` row this tier's Acquire
  button resolves.

# What Was Intentionally Not Changed

- `src/app/api/stripe/checkout/route.ts` and
  `src/app/api/stripe/webhook/route.ts` — both already generic over any
  `ELITE_SUB_TIERS` key; zero code changes needed.
- Essentials/Signature/Luxury pricing, thresholds, `oneTimeFee` values,
  `dbServiceName`s, colors, and features — untouched. Essentials remains
  exactly $900 one-time + $200/month, unrenamed.
- The `$2,500` Essentials minimum threshold — unchanged; this fallback
  only ever applies strictly below it.
- Support Tier / Premier Tier's 28%/30% Property-Owner-side percentage
  logic (`percentageForPlan()` in `src/lib/owner-plan-display.ts`) — not
  read, called, or modified. The new 30% is a separate, independent
  constant used only for this Elite fallback.
- No commit, push, deploy, or migration execution was performed.

# Expected Result

- An Investor property with, e.g., $1,800/month rent now gets
  `elite_tier = "below_minimum"` instead of `null`.
- In "Your Portfolio" / "Property Portfolio Breakdown" (Dashboard home
  and Recommended Services — same shared component, so both update
  together), that property's card shows:
  - A slate "Below Portfolio Minimum" badge, clearly distinct from the
    blue/amber/purple Essentials/Signature/Luxury badges.
  - One-time fee: $540 CAD (30% of $1,800), labeled "(30% of rent)".
  - Monthly maintenance: $200 CAD/mo.
  - CFP: $180.00/mo (10% of rent, unchanged formula) and Payback: 3.0
    months ($540 / $180), calculated the same way as every other tier.
  - The same collapsible "What's included in Below Portfolio Minimum"
    list showing the 8 Essentials features.
  - An "Acquire Below Portfolio Minimum — Pay $200 CAD upfront (deposit
    toward the 30% total; balance after lease signing)" button, wired to
    the same one-time-Stripe-checkout + automatic-$200/month-recurring-
    subscription mechanism as every other Elite sub-tier, once the new
    migration is applied.
- Property Owner (Basic/Preferred Owners) and every other Elite sub-tier
  are unaffected.
