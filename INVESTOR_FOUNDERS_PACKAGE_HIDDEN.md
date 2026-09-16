# Fix Implemented (Dashboard home + Recommended Services)

The Founders Package (30% lifetime commission) is more expensive for an
Investor than their fixed per-property portfolio pricing, so it must never
be shown to Investors. Both pages already had an existing role-check
pattern that separates Property Owner from Investor within the broader
"owner" role group:

```ts
const isInvestor = profile.role === "inversionista";
const isOwnerNotInvestor =
  profile.role === "propietario" || profile.role === "propietario_preferido";
```

This `isOwnerNotInvestor` flag already existed in
[src/app/(dashboard)/dashboard/page.tsx](src/app/(dashboard)/dashboard/page.tsx#L90-L91)
(used for tier-derivation logic) and locally inside a data-fetch block in
[src/app/(dashboard)/dashboard/services/page.tsx](src/app/(dashboard)/dashboard/services/page.tsx). The fix reuses that exact flag for
visibility instead of introducing a new check:

- **Dashboard home** ([page.tsx](src/app/(dashboard)/dashboard/page.tsx)):
  the Founders banner render condition changed from
  `isOwnerRole && foundersAvailability && foundersAvailability.limit > 0`
  to `isOwnerNotInvestor && foundersAvailability && ...`. The
  `getFoundersAvailability()` data fetch itself was also switched from
  `isOwnerRole ?` to `isOwnerNotInvestor ?`, so the availability query no
  longer even runs for an Investor (it's simply unused work otherwise,
  not a pricing/logic change).
- **Recommended Services** ([services/page.tsx](src/app/(dashboard)/dashboard/services/page.tsx)): promoted the
  previously function-scoped `isOwnerNotInvestor` declaration to the
  top-level role checks (alongside `isInvestor`) so it's available at both
  render sites, and gated both `FoundersBanner` occurrences — the one
  shown when the owner already has a tier (Elite included), and the one
  shown for owners with no tier assigned yet — with `isOwnerNotInvestor &&
  foundersLimit > 0`.

No changes were made to `FoundersBanner`, `getFoundersAvailability`,
pricing, or the Founders counter logic itself — only the conditions that
decide whether the component renders.

# Spacing/Layout Verified (no gaps left behind)

Both pages already render all dashboard sections as plain conditional
JSX siblings inside layout containers that use Tailwind's `space-y-*`
utility (`space-y-6` on Dashboard home's root, `space-y-4` inside the
Recommended Services owner tier block) rather than fixed-height slots,
absolute positioning, or grid rows reserved in advance. `space-y-*` only
applies top margin to elements that are actually rendered as siblings, so
removing a conditional block (`{cond && <X/>}` evaluating to `false`)
never leaves a blank gap — the next rendered sibling's margin collapses
against the previous one automatically.

- **Dashboard home**: Founders banner (`page.tsx:449`) sits directly
  before the "No plan assigned" fallback and "Quick Actions" card
  (`page.tsx:536`) as siblings in the same `space-y-6` container. With the
  banner hidden for Investors, "Quick Actions" (and anything else in that
  flow) sits immediately after "Your Service Tier" / the Elite portfolio
  breakdown card, with no gap.
- **Recommended Services**: both Founders banners sit inside a
  `space-y-4` wrapper, immediately followed by the `availablePlans` grid
  that contains the "Asset Management" card (Elite's plan entry). With the
  banner hidden, the grid moves up to sit directly under the "Your
  Service" card, no gap left.

No manual spacing/margin adjustments were required — verified by reading
the surrounding markup structure and confirming no sibling elements rely
on the banner's presence for layout.

# Property Owner Confirmed Unaffected

`isOwnerNotInvestor` evaluates to `true` for exactly `propietario` and
`propietario_preferido` — the same two roles `isOwnerRole` covered besides
`inversionista`. Every render condition that gated on `isOwnerRole` for
the Founders banner now gates on `isOwnerNotInvestor` instead, which is
`true` for Property Owner in precisely the same cases it was before (basic
tier, preferred owners tier, and the "no tier yet" fallback). Property
Owner (Basic/Preferred Owners) behavior — banner content, counter, CTA,
pricing — is unchanged on both Dashboard home and Recommended Services.

PYME (`isPymesRole`) and Tenant (`isTenantRole`) sections were not touched
— they never rendered the Founders banner to begin with.

# Files Modified

- [src/app/(dashboard)/dashboard/page.tsx](src/app/(dashboard)/dashboard/page.tsx)
  — `getFoundersAvailability()` fetch condition and the `FoundersBanner`
  render condition both switched from `isOwnerRole` to the existing
  `isOwnerNotInvestor` flag.
- [src/app/(dashboard)/dashboard/services/page.tsx](src/app/(dashboard)/dashboard/services/page.tsx)
  — `isOwnerNotInvestor` promoted from a block-scoped local (only used
  for tier derivation) to a top-level role flag; both `FoundersBanner`
  render conditions (tiered-owner branch and no-tier-yet branch) gated
  with `isOwnerNotInvestor && foundersLimit > 0`.

# Expected Result

- **Investor** (`inversionista`): Founders Package banner no longer
  appears on Dashboard home or Recommended Services, in any tier state.
  "Quick Actions" (Dashboard home) and the "Asset Management" plan card
  (Recommended Services) now sit directly below the preceding section
  with no leftover blank space.
- **Property Owner** (`propietario` / `propietario_preferido`, Basic or
  Preferred Owners): Founders Package banner still renders exactly as
  before, on both pages, in every tier state (including the no-tier-yet
  fallback), with unchanged pricing, counter, and CTA.
- PYME and Tenant dashboards: unchanged (they never showed Founders to
  begin with).
