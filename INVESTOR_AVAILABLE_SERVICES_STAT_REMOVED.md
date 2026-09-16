# Fix Implemented

The "Available Services" stat card (previously showing a flat count like
"16", sourced from `ownerPlan.features.length` — the old generic Elite
feature list already hidden per `PER_PORTFOLIO_FEATURES_FIX.md`) is now
excluded for Investor specifically, in the top stat-card ternary chain on
Dashboard home.

The chain (`isPymesRole ? ... : isTenantRole ? ... : isOwnerRole ? ... :
...`) previously fell into the `isOwnerRole` branch for both Property
Owner and Investor (since `isOwnerRole` covers both). Changed that branch
to `isOwnerRole && !isInvestor`, and added an explicit `isInvestor ? null`
branch immediately after it — so Investor renders no card in that grid
slot at all, while Property Owner (Basic/Preferred Owners) still gets
its `Available Services` card exactly as before (tier-specific feature
count, untouched).

# Layout Verified (remaining stat cards display cleanly)

Before this fix, the stat grid used a fixed `grid gap-4 md:grid-cols-2
lg:grid-cols-4` for every role. Checked what actually renders for
Investor now:

- **My Properties** (always, for any `isOwnerRole`)
- **Total CFP** (only when `isInvestor && totalCFP > 0`)
- Available Services: now removed (`null`)

So Investor ends up with either **2 cards** (My Properties + Total CFP,
when the investor has CFP-positive properties) or just **1 card** (My
Properties alone, e.g. before any property earns CFP). Stretching 1–2
cards across a `lg:grid-cols-4` grid would leave a large, awkward blank
gap on the right of the row on wider screens — confirmed this is exactly
the kind of leftover-space issue the task flagged, since CSS grid doesn't
redistribute width to fill unused column tracks.

Fixed by sizing the grid to the Investor's actual card count instead of
reusing the generic 4-column grid:

```tsx
className={`grid gap-4 ${
  isInvestor
    ? totalCFP > 0
      ? "sm:grid-cols-2 max-w-md"   // 2 cards: My Properties + Total CFP
      : "max-w-xs"                   // 1 card: My Properties only
    : "md:grid-cols-2 lg:grid-cols-4"  // unchanged for every other role
}`}
```

This only branches on `isInvestor` — every other role (Property Owner,
Tenant, PYME, and the generic/admin fallback) keeps the exact same
`md:grid-cols-2 lg:grid-cols-4` grid class as before, so their layouts
are provably unaffected. For Investor, the cards now sit in a
compact, appropriately-sized row instead of trailing off into empty
grid space.

# Files Modified

- [src/app/(dashboard)/dashboard/page.tsx](src/app/(dashboard)/dashboard/page.tsx#L238-L253) — sized the stat-card grid
  container to Investor's card count (`isInvestor` branch added;
  every other role's grid class is unchanged).
- [src/app/(dashboard)/dashboard/page.tsx](src/app/(dashboard)/dashboard/page.tsx#L361-L376) — the "Available Services" stat
  card branch changed from `isOwnerRole` to `isOwnerRole && !isInvestor`,
  with an explicit `isInvestor ? null` branch added so no card renders
  for Investor in that grid position.

# Expected Result

- **Investor**: Dashboard home's top stat row no longer shows "Available
  Services: 16" (or any flat services count). It shows just "My
  Properties" (and "Total CFP" once the investor has CFP-positive
  properties) in a compact, correctly-sized grid row with no dangling
  empty space.
- **Property Owner** (Basic/Preferred Owners): unaffected — "My
  Properties" + "Available Services" (tier-specific count) still render
  exactly as before, in the original `md:grid-cols-2 lg:grid-cols-4`
  grid.
- **PYME**: unaffected — "Diagnosis Score" / "Estimated Loss" /
  "Services In Your Plan" / "Available Plans" cards and grid sizing are
  unchanged.
