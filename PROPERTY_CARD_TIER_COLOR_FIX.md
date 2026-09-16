# Fix Implemented (colors used, subtle styling approach)

Each property card in the Investor Dashboard's "Property Portfolio Breakdown"
now carries a subtle tier-colored background tint and matching border, in
addition to the existing top-right tier badge, so the tier is visible at a
glance instead of only in the small badge.

Colors reused directly from the existing `ELITE_SUB_TIERS` definitions in
[src/lib/constants.ts](src/lib/constants.ts#L285-L336) (no new colors
introduced):

- **Essentials** — `bg-blue-50` background / `border-blue-200` border
- **Signature** — `bg-amber-50` background / `border-amber-200` border
- **Luxury** — `bg-purple-50` background / `border-purple-200` border

These are the same very light (`-50`) background and light (`-200`) border
shades already used elsewhere in the app for tier-colored cards (e.g.
[pymes-plan-card.tsx](src/components/dashboard/pymes-plan-card.tsx#L29),
the owner plan card on
[dashboard/page.tsx](src/app/(dashboard)/dashboard/page.tsx#L377), and the
services tier card on
[services/page.tsx](src/app/(dashboard)/dashboard/services/page.tsx#L553)),
so the new styling is visually consistent with the rest of the product
rather than a one-off.

Properties with no assigned `elite_tier` keep the original neutral
`bg-card` background with the default border — no color is invented for
the "Below Elite portfolio minimum" case.

# Files Modified

- [src/components/dashboard/elite-portfolio-breakdown.tsx](src/components/dashboard/elite-portfolio-breakdown.tsx#L51-L58)
  — the property card's root `<div>` now conditionally applies
  `${tier.borderColor} ${tier.bgColor}` when a tier is present, replacing
  the previous uniform `border bg-card` styling. No other markup, the
  badge, pricing, CFP/Payback display, or Acquire buttons were changed.

No changes were made to `src/lib/constants.ts` — the existing `bgColor` /
`borderColor` fields on `ELITE_SUB_TIERS` already provided everything
needed.

# Expected Result

On the Investor Dashboard's Property Portfolio Breakdown (and the shared
Recommended Services per-property breakdown, since both surfaces render
`ElitePortfolioBreakdown`), each property card now has a light background
tint and matching border color that corresponds to its tier:

- Essentials properties: light blue tint/border
- Signature properties: light amber tint/border
- Luxury properties: light purple tint/border

This makes tier membership recognizable from the overall card color at a
glance, while the tint/border stay light enough (`-50`/`-200` Tailwind
shades) that card text, pricing, and CFP/Payback numbers remain fully
readable — matching the existing subtle-card-tint pattern used elsewhere
in the dashboard.
