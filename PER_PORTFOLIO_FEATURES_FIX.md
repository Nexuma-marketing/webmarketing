# Approach Chosen (per-property vs. summary side-by-side) And Why

Chose **(a) inside each property's own card in "Your Portfolio"
breakdown**, not a side-by-side/stacked 3-tier summary.

Reasons:

- **Already shared, single place to fix.** `ElitePortfolioBreakdown`
  ([src/components/dashboard/elite-portfolio-breakdown.tsx](src/components/dashboard/elite-portfolio-breakdown.tsx))
  is explicitly documented as "Shared by Dashboard home and Recommended
  Services so both surfaces stay in sync," and is in fact the only place
  either page renders the per-property tier badge, fee, CFP, and Payback.
  Adding the feature list there means one code change fixes both pages
  simultaneously and can never drift between them.
- **Correctness matches the data model exactly.** Each property already
  carries its own `elite_tier`, so the per-property card is the one place
  that knows, unambiguously, which cumulative feature set applies to that
  specific property — no ambiguity about "which of the 3 tiers does this
  section describe" the way a side-by-side summary would have if an
  Investor's portfolio spans multiple tiers at once.
- **A side-by-side summary would misrepresent mixed portfolios.** The bug
  being fixed is that one shared list implied uniform inclusions across
  all properties. A generic "here are all 3 tiers, compare them" block
  reads more like a sales/pricing page than a factual "what does the
  Investor already own" statement, and risks the same
  ambiguity-at-a-glance problem in a different shape.
- **Layout fit.** The per-property cards already have room for
  fee/CFP/Payback plus a `feeDescription` note; the codebase already has
  an established `<details>`/`<summary>` collapsible convention (used for
  "Premier Tier" details on Recommended Services), so the (up to 18-item)
  Luxury list can be tucked behind a collapsed toggle by default — keeping
  each card compact even for Investors with several properties in the
  same tier, while the accurate list is one click away.

# Data Structure Added

Extended the existing `ELITE_SUB_TIERS` record in
[src/lib/constants.ts](src/lib/constants.ts#L284-L367) — the same object
already used for per-tier pricing/colors, shared by both pages — with a
new `features: string[]` field per sub-tier, built cumulatively from three
local arrays so the "each tier includes everything below it" relationship
is explicit and each tier's unique additions stay easy to find/edit:

```ts
const ELITE_ESSENTIALS_FEATURES = [ /* 8 items, exactly as specified */ ];
const ELITE_SIGNATURE_OWN_FEATURES = [ /* 7 items, Signature-only additions */ ];
const ELITE_LUXURY_OWN_FEATURES = [ /* 3 items, Luxury-only additions */ ];

essentials.features = ELITE_ESSENTIALS_FEATURES;                                    // 8 items
signature.features  = [...ELITE_ESSENTIALS_FEATURES, ...ELITE_SIGNATURE_OWN_FEATURES]; // 15 items
lujo.features        = [...ELITE_ESSENTIALS_FEATURES, ...ELITE_SIGNATURE_OWN_FEATURES, ...ELITE_LUXURY_OWN_FEATURES]; // 18 items
```

All three lists use the exact wording specified in the task. No pricing,
`extras`, CFP/Payback, or tier-assignment thresholds were touched.

# Fix Implemented (both pages)

- **`ElitePortfolioBreakdown`** ([elite-portfolio-breakdown.tsx](src/components/dashboard/elite-portfolio-breakdown.tsx#L105-L119)):
  each property card now renders a collapsible "What's included in
  {tier.name}" `<details>` block (collapsed by default) listing that
  property's actual cumulative `tier.features`, using the same
  `CheckCircle2` checkmark + `tier.color` styling already used for every
  other bullet list on these cards. Positioned after the Payback callout
  and before the existing `feeDescription` note. Because both pages
  render this same component for "Your Portfolio", this single change
  fixes both Dashboard home and Recommended Services at once.
- **Dashboard home** ([page.tsx](src/app/(dashboard)/dashboard/page.tsx#L404-L422)): the old single shared
  "What's included in your Elite Assets & Legacy service" list (driven by
  `OWNER_TIERS.elite.features`, a generic non-portfolio-specific list) is
  now wrapped in `!isInvestor`, so it no longer renders for Investor —
  replaced by the accurate per-property lists described above.
- **Recommended Services** ([services/page.tsx](src/app/(dashboard)/dashboard/services/page.tsx#L606-L626)): the equivalent
  "What's included in your Elite Assets & Legacy service" block is
  likewise wrapped in `!isInvestor` for the same reason.
- Property Owner (Basic/Preferred Owners) and PYME are unaffected:
  `!isInvestor` is `true` for them, so their existing shared feature
  lists (driven by `OWNER_TIERS.basic.features` /
  `OWNER_TIERS.preferred_owners.features`) render exactly as before, and
  `OWNER_TIERS.elite.features` itself (the old generic 16-item array) was
  left untouched — it's still used elsewhere (the "Available Services"
  count stat), which was out of scope for this fix.

# Files Modified

- [src/lib/constants.ts](src/lib/constants.ts#L284-L367) — added `ELITE_ESSENTIALS_FEATURES` /
  `ELITE_SIGNATURE_OWN_FEATURES` / `ELITE_LUXURY_OWN_FEATURES`, added
  `features: string[]` to the `ELITE_SUB_TIERS` type and to all three
  entries (cumulative composition).
- [src/components/dashboard/elite-portfolio-breakdown.tsx](src/components/dashboard/elite-portfolio-breakdown.tsx) — added
  `CheckCircle2` import; added the collapsible per-property "What's
  included in {tier.name}" list.
- [src/app/(dashboard)/dashboard/page.tsx](src/app/(dashboard)/dashboard/page.tsx#L404-L422) — wrapped the old generic
  "What's included" list in `!isInvestor`.
- [src/app/(dashboard)/dashboard/services/page.tsx](src/app/(dashboard)/dashboard/services/page.tsx#L606-L626) — wrapped the old
  generic "What's included" list in `!isInvestor`.

# Expected Result

- **Investor**, on both Dashboard home and Recommended Services: no more
  single shared 14-item list implying every property gets the same
  features. Instead, each property card inside "Your Portfolio Breakdown"
  / "Property Portfolio Breakdown" has a collapsible "What's included in
  Essentials/Signature/Luxury" list showing exactly that property's
  correct, cumulative feature set (8 / 15 / 18 items respectively). An
  Investor with properties across multiple tiers sees each property's own
  accurate list, not one blended list.
- **Property Owner** (Basic/Preferred Owners) and **PYME**: fully
  unaffected — their feature lists, pricing, and CFP/Payback logic are
  unchanged.
