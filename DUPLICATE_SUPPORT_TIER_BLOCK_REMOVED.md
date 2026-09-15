# Root Cause (why it appeared twice)

`RECOMMENDED_SERVICES_PLAN_PRICING_FIX.md` added a new
`PrimaryPlanPricingCard` (name, per-property $ breakdown, terms, CTA)
inside the "Your Service: {tier}" card
([services/page.tsx:615-623](<src/app/(dashboard)/dashboard/services/page.tsx#L615-L623>)),
gated on `primaryPlan`, which is set for both Basic ("Low Price") and
Preferred Owners ("Support Tier") via the shared `OWNER_PRIMARY_PLAN`
map.

That fix didn't account for the fact that the same plan was **already**
being rendered further down the page, in the generic "Available Plans"
grid ([services/page.tsx:679-680](<src/app/(dashboard)/dashboard/services/page.tsx#L679-L680>)):

```ts
const availablePlans = tierDetails?.plans.filter(
  (plan) => plan.name !== "Founders Package — Visionary Owners" && plan.name !== "Premier Tier",
) || [];
```

For Preferred Owners, `tierDetails.plans` is `[Support Tier, Premier
Tier]`; this filter only excludes Premier Tier, leaving `availablePlans
= [Support Tier]` — the exact same plan object now also rendered above
in "Your Service." Both blocks use the same `formatOwnerPlanPrice`,
the same `PLAN_NAME_TO_DB_SERVICE`/`servicesByDbName` lookup, and the
same `CheckoutButton`, so the two renderings are visually identical —
hence the confirmed duplicate.

# Fix Implemented

Scoped the "Available Plans" grid to skip the entry that's already
shown in "Your Service," for Preferred Owners only:

```tsx
{availablePlans
  .filter((plan) => !(ownerTier === "preferred_owners" && plan.name === "Support Tier"))
  .map((plan, i) => { ... })}
```

This is a render-site filter, not a change to the underlying
`availablePlans` computation — it leaves the shared `availablePlans`/
`primaryPlan` logic (used by Basic, Preferred Owners, and Elite alike)
untouched, minimizing blast radius. For Preferred Owners, the
"Available Plans" grid now renders empty (0 cards) between the
Founders banner and the Premier Tier expandable — the Support Tier
card is only shown once, inside "Your Service."

The Founders Package banner and the Premier Tier "Want to pay in
installments?" expandable are both outside this filtered `.map()` call
entirely (they're separate JSX blocks before/after it) and were not
touched.

# Basic Tier Checked (same issue or not)

**Confirmed: Basic has the exact same underlying duplication.**
`primaryPlan` is set for Basic too (`OWNER_PRIMARY_PLAN.basic` = "Low
Price"), so `PrimaryPlanPricingCard` renders Low Price inside "Your
Service" for Basic owners exactly the same way it does Support Tier
for Preferred Owners. And `availablePlans` for Basic is `[Low Price]`
(Founders Package is the only entry excluded by the existing filter) —
the identical code path, just with different data. This is not
"similar," it's the same shared mechanism producing the same bug for
Basic's "Low Price" card.

**Left unfixed, per the task's scope.** Basic was intentionally not
touched: unlike Preferred Owners (which still has the Premier Tier
expandable below it, so its "Available Plans" section keeps content
either way), removing Low Price from Basic's "Available Plans" grid
would leave that section showing only the Founders banner with an
empty grid underneath and nothing else — a layout consequence that
deserves its own deliberate look rather than a side effect of this
one-line filter. Recommend a quick follow-up decision on whether to
apply the identical fix to Basic and, if so, whether the "Available
Plans" heading/section should be conditionally hidden when its grid
would otherwise be empty.

# Files Modified

- [src/app/(dashboard)/dashboard/services/page.tsx](<src/app/(dashboard)/dashboard/services/page.tsx>) — added a scoped `.filter()` immediately before the "Available Plans" grid's `.map()`, removing only the Preferred Owners "Support Tier" duplicate entry.

# Expected Result

- Preferred Owners' "Recommended Services" page shows the Support Tier
  pricing block (name, per-property breakdown, terms, "Get Support"
  CTA) exactly once, inside "Your Service: Preferred Owners."
- The "Available Plans" section for Preferred Owners now shows: the
  Founders Package banner, then directly the "Want to pay in
  installments? See Premier Tier details" expandable — no empty/blank
  card in between, no second Support Tier card.
- Basic tier's "Available Plans" section (Low Price card) is
  completely unchanged — still duplicated as before, pending a
  separate decision (see above).
- Elite/Investor is unaffected — `primaryPlan` is `null` for Elite, so
  neither the new filter nor "Your Service"'s pricing block ever
  applied to it; its "Available Plans" section (Asset Management)
  renders exactly as before.
- `npx tsc --noEmit` passes with no new errors on the modified file.
  No commit, push, or deploy was performed.
