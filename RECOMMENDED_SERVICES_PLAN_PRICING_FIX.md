# Fix Implemented (component reused)

Dashboard home's "Your Service Tier" card already showed the correct
plan-pricing block (plan name, per-property `$` breakdown via
`formatOwnerPlanPrice`, payment terms, purchase CTA button), but that
block was inline JSX in `dashboard/page.tsx`, not a reusable
component — so it couldn't be reused on Recommended Services without
duplicating it.

Extracted that exact block, unchanged, into a new shared component:

**`src/components/dashboard/primary-plan-pricing-card.tsx`** — `PrimaryPlanPricingCard`

```tsx
<PrimaryPlanPricingCard
  primaryPlan={primaryPlan}
  primaryPlanTerms={primaryPlanTerms}
  primaryPlanService={primaryPlanService}
  accentColorClassName={/* tier accent color */}
  ownerProperties={ownerProperties}
/>
```

It renders the same markup that was previously inline: plan name,
`formatOwnerPlanPrice(...)` pricing line, the terms `<ul>`, and either
a `CheckoutButton` (real Stripe purchase) or a fallback `#contact`
link — exactly as before.

Also lifted the `OWNER_PRIMARY_PLAN` tier→plan map (previously a
private constant inside `dashboard/page.tsx`) into the already-shared
**`src/lib/owner-plan-display.ts`** (same file `formatOwnerPlanPrice`
lives in, which both pages already imported). This means both pages
now resolve the *identical* primary plan object per tier instead of
each maintaining their own copy.

**Dashboard home** (`dashboard/page.tsx`): the inline block was
replaced with a call to `<PrimaryPlanPricingCard />` using the exact
same props it always computed (`primaryPlan`, `primaryPlanTerms`,
`primaryPlanService`, `ownerPlan.color`, `ownerProperties`). Output is
pixel-identical — this is a refactor, not a behavior change.

**Recommended Services** (`dashboard/services/page.tsx`): added the
same computation Dashboard home uses —

```ts
const primaryPlan = ownerTier ? OWNER_PRIMARY_PLAN[ownerTier] : null;
const primaryPlanTerms = baseTier?.plans.find((plan) => plan.name === primaryPlan?.name)?.details || [];
const primaryPlanService = primaryPlan?.serviceName ? servicesByDbName[primaryPlan.serviceName] : undefined;
```

`primaryPlanTerms` intentionally reads from `baseTier.plans` (the raw
`OWNER_TIERS` shape), the same source Dashboard home uses, rather than
this page's own admin-override-aware `tierDetails.plans` — so the two
pages show identical pricing/terms for a given tier instead of
potentially diverging. `primaryPlanService` reuses the page's existing
`servicesByDbName` lookup (built from the already-fetched `services`
table), so no new query was added.

The `<PrimaryPlanPricingCard />` call was inserted into the "Your
Service: {tier}" card immediately after the existing feature checklist
block, before the pre-existing "See the full plan pricing... in
Available Plans below" hint text — mirroring the same
features-then-pricing order used on Dashboard home. It only renders
for Basic/Preferred Owners (`primaryPlan` is `null` for Elite/Investor,
same as Dashboard home), so Investor's per-property portfolio
breakdown further down the card is unaffected.

# Files Modified

- [src/components/dashboard/primary-plan-pricing-card.tsx](src/components/dashboard/primary-plan-pricing-card.tsx) — new shared component (extracted, not rebuilt).
- [src/lib/owner-plan-display.ts](src/lib/owner-plan-display.ts) — added shared `OWNER_PRIMARY_PLAN` export.
- [src/app/(dashboard)/dashboard/page.tsx](<src/app/(dashboard)/dashboard/page.tsx>) — removed local `OWNER_PRIMARY_PLAN` const and inline pricing JSX; now imports the shared map/component. Card output unchanged.
- [src/app/(dashboard)/dashboard/services/page.tsx](<src/app/(dashboard)/dashboard/services/page.tsx>) — added `primaryPlan`/`primaryPlanTerms`/`primaryPlanService` and rendered `PrimaryPlanPricingCard` inside the "Your Service" card.

# Expected Result

- Recommended Services → "Your Service: Preferred Owners" (or Basic)
  card now shows, right under the feature checklist: the plan name
  ("Support Tier" / "Low Price"), the per-property `$` breakdown
  (e.g. "Property 1: you would pay approximately $735.00 CAD..."),
  the payment terms bullets, and a working purchase CTA (Stripe
  checkout when a priced service is mapped, otherwise a contact link)
  — matching Dashboard home exactly, computed from the same shared map.
- Feature checklist on Recommended Services is unchanged.
- Dashboard home's "Your Service Tier" card is visually and
  behaviorally unchanged (refactor only).
- Elite/Investor: no pricing block is added to either page's "Your
  Service" card (by design, same as before); the per-property
  portfolio breakdown remains untouched.
- `npx tsc --noEmit` passes with no new errors on either modified page
  or the new component/lib export. No commit, push, or deploy was
  performed.
