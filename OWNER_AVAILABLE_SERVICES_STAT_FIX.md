# Fix Implemented

The "Available Services" stat card on the main dashboard
(`/dashboard`) previously fell through to a generic `else` branch for
every role that wasn't PYME or Tenant — including all three
Property Owner tiers (Basic, Preferred Owners) and Investor (Elite).
That branch rendered `serviceCount`, a platform-wide count of all
active `services` rows (~19), which is the same category of bug
already fixed for PYME (`PYME_DASHBOARD_SERVICES_UX_FIX.md`) and
Tenant (see the `tenantServiceCount` logic in the same file).

Added a dedicated `isOwnerRole` branch to the stat-card ternary in
[page.tsx](src/app/(dashboard)/dashboard/page.tsx#L364-L378), inserted
between the existing Tenant and generic-fallback branches:

```tsx
) : isOwnerRole ? (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between pb-2">
      <CardTitle className="text-sm font-medium">Available Services</CardTitle>
      <Heart className="h-4 w-4 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">
        {ownerPlan ? ownerPlan.features.length : serviceCount}
      </div>
      <p className="text-xs text-muted-foreground">
        {ownerPlan ? `Included in your ${ownerPlan.name} service` : "Active services"}
      </p>
    </CardContent>
  </Card>
) : (
```

This reuses the `ownerPlan` variable already computed earlier in the
same server component
([page.tsx:198-208](src/app/(dashboard)/dashboard/page.tsx#L198-L208)),
which resolves the correct tier (`basic` / `preferred_owners` /
`elite`) from `OWNER_TIERS` in
[constants.ts](src/lib/constants.ts#L15-L147) and already accounts
for any admin `app_config` overrides to plan features
(`ownerPlanFeatureOverride`). No new data fetch was needed.

Resulting counts, based on the current `OWNER_TIERS` feature lists:
- **Basic**: 6 features
- **Preferred Owners**: 7 features (matches the confirmed "What's
  included in your Preferred Owners service" list)
- **Elite** (Investor): 16 features

If a user has no property yet and no tier assigned (`ownerPlan` is
`null`), the card falls back to the platform-wide `serviceCount`,
matching the existing "No service tier assigned yet" prompt card
further down the page — this mirrors how the PYME branch falls back
to a static `3` ("Rescue, Growth, Scale") before a plan is assigned.

# Investor Status Checked (already fixed or needs same treatment)

**Investor's "Available Services" stat card was NOT already
addressed — it had the same bug and is fixed by this same change.**

Investor (`inversionista`) sets `isInvestor = true`, which is a
subset of `isOwnerRole` (`propietario` / `propietario_preferido` /
`inversionista`, see
[page.tsx:70-73](src/app/(dashboard)/dashboard/page.tsx#L70-L73)).
Before this fix, Investor fell through the exact same generic `else`
branch as Property Owner and saw the same platform-wide count (~19).

There IS a separate, correctly-implemented Investor feature — the
per-property portfolio breakdown card ("Your Portfolio" →
`ElitePortfolioBreakdown`,
[page.tsx:471-486](src/app/(dashboard)/dashboard/page.tsx#L471-L486))
— but that is a different card entirely (shows CFP/payback per
property, not a feature/service count) and does not touch the
"Available Services" stat card. It was left completely untouched by
this change.

Because the new `isOwnerRole` branch checks role membership (not
tier), it automatically covers Investor too: their "Available
Services" card now shows **16** (Elite's `OWNER_TIERS.elite.features`
count) via the same `ownerPlan` resolution used for Basic/Preferred
Owners, with no Investor-specific code path needed.

# Files Modified

- [src/app/(dashboard)/dashboard/page.tsx](src/app/(dashboard)/dashboard/page.tsx) — added `isOwnerRole` branch to the "Available Services" stat card ternary (lines 364-378).

No other files were changed. `src/app/(dashboard)/dashboard/services/page.tsx` was checked and does not contain a numeric "Available Services" stat card (only an "Other Available Services" section heading), so it was out of scope.

# Expected Result

- Basic-tier Property Owner dashboard: "Available Services" card shows **6**, subtext "Included in your Basic service".
- Preferred Owners dashboard: shows **7**, subtext "Included in your Preferred Owners service".
- Investor (Elite) dashboard: shows **16**, subtext "Included in your Elite Assets & Legacy service". The separate "Your Portfolio" per-property breakdown card is unaffected.
- Owner/Investor with no properties/tier yet: falls back to the platform-wide active-services count (unchanged behavior, same as before for the no-plan case), alongside the existing "No service tier assigned yet" prompt.
- PYME, Tenant, and any other role (e.g. admin) dashboards: unchanged.

`npx tsc --noEmit` was run against the modified file with no new errors. No commit, push, or deploy was performed.
