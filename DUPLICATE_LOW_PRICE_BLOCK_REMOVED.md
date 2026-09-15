# Fix Implemented (same filter pattern applied to Basic)

Extended the exact same scoped filter already applied and verified for
Preferred Owners
([services/page.tsx:679-694](<src/app/(dashboard)/dashboard/services/page.tsx#L679-L694>))
so it also covers Basic's "Low Price" entry, instead of hardcoding a
second tier-specific condition:

```tsx
{availablePlans
  .filter((plan) => plan.name !== primaryPlan?.name)
  .map((plan, i) => { ... })}
```

Previously the filter was written as
`!(ownerTier === "preferred_owners" && plan.name === "Support Tier")`
— correct for Preferred Owners but Basic-specific duplication was left
unfixed by design (per `DUPLICATE_SUPPORT_TIER_BLOCK_REMOVED.md`).
Since `primaryPlan` already resolves to the correct primary plan for
whichever tier the customer is on (`Support Tier` for Preferred
Owners, `Low Price` for Basic, `null` for Elite/Investor — same
`OWNER_PRIMARY_PLAN` map used by the "Your Service" pricing block),
comparing directly against `primaryPlan?.name` is equivalent to the
old condition for Preferred Owners and additionally excludes Low Price
for Basic — one generic rule instead of two tier-specific ones.

This is still a render-site-only filter on the existing
`availablePlans` array — the array's own computation, the "Available
Plans" `<h2>` heading, and the Founders Package banner are all
completely untouched, exactly matching how the Preferred Owners fix
was applied.

# Files Modified

- [src/app/(dashboard)/dashboard/services/page.tsx](<src/app/(dashboard)/dashboard/services/page.tsx>) — generalized the existing Preferred-Owners-only filter to exclude whichever plan matches `primaryPlan` for the current tier, covering Basic's "Low Price" the same way.

# Expected Result

- Basic tier's "Recommended Services" page now shows the Low Price
  pricing block (name, $ breakdown, terms, "Choose & secure your
  money" CTA) exactly once, inside "Your Service: Basic."
- "Available Plans" heading and the Founders Package banner remain
  exactly where they were, unhidden and unconditional — same layout
  order as before (Your Service → Available Plans heading → Founders
  banner → [now nothing, previously the duplicate] → Other Available
  Services), with no visual gap, matching the Preferred Owners fix.
- Preferred Owners is unaffected by this change — `primaryPlan?.name`
  still evaluates to `"Support Tier"` for that tier, so the filtering
  outcome is identical to before this edit.
- Elite/Investor is unaffected — `primaryPlan` is `null` for Elite, so
  `plan.name !== primaryPlan?.name` is always `true`; the "Asset
  Management" card in Available Plans renders exactly as before.
- `npx tsc --noEmit` passes with no new errors on the modified file.
  No commit, push, or deploy was performed.
