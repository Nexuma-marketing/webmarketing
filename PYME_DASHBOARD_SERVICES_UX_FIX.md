# Fix 1 — Dashboard Home Reuses Working Plan Card (with plan name shown)

**Root cause:** The Dashboard home page (`/dashboard`) and Recommended Services page
(`/dashboard/services`) each had their own hand-written copy of the PYMES "Your Recommended
Plan" card. The Services copy fetched `pymes_plans.id` and rendered a real
`<CheckoutButton type="pymes_upfront" ... />` that hits Stripe. The Dashboard home copy never
fetched that id and instead always rendered `<Link href="/dashboard/services#contact">Start
Now</Link>` — a same-page anchor link to a page it wasn't even on, so clicking it did nothing
useful. The Dashboard home copy's title was also the generic `Your Recommended Plan` with no
plan name, while Services already said `Your Recommended Plan: {name}`.

**Fix implemented:**
1. Extracted the Services page's working plan card into a shared component,
   `PymesPlanCard` (`src/components/dashboard/pymes-plan-card.tsx`) — same title format
   (`Your Recommended Plan: {name}`), same price/payment-options/features layout, and the same
   `CheckoutButton type="pymes_upfront"` (falling back to the same contact-link CTA only when no
   `pymes_plans` row exists, exactly as Services already did).
2. Extracted the data-fetching logic (recommended plan lookup, admin plan-override merge, and
   `pymes_plans` row lookup for the checkout id) into one shared helper,
   `getPymesPlanForUser()` (`src/lib/pymes-plan-display.ts`), used by both pages.
3. Dashboard home now calls `getPymesPlanForUser()` and renders `<PymesPlanCard>` — the exact
   same component, with the exact same working checkout button, that Services renders.

Both pages now render byte-identical plan content and both "Start Now"/"Pay $X CAD upfront"
buttons are the same working `CheckoutButton`. No new button was built.

# Fix 2 — Real Estate Plans Collapsed Behind Opt-In

**Confirmed:** none of the property/investor plans (Elite Lujo/Essentials/Signature, Owner
Preferred — Support/Premier Tier, Founders Package, Low Price) or the residential add-ons
(Virtual Tour 360, Portfolio Marketing Strategy, Elite Property Management, Property Listing
Optimization, Tenant Screening) have `pymes` in their `target_roles` in the DB seed data
(`migration_v2_mvp.sql`, `migration_v11`, `migration_v12`). So for a PYME customer, **all** of
them fell into the page's existing `otherServices` bucket and were rendered as a flat,
unfiltered grid in "Other Available Services" — exactly the clutter reported.

**Fix implemented:** reused the same `<details>` collapsible pattern already built for the
Property Owner's "Other Available Services" groups (`ownerOtherServiceGroups`) in
`src/app/(dashboard)/dashboard/services/page.tsx`. For PYME users, the "Other Available
Services" section now renders one collapsed prompt:

> **Own a property? Explore our real estate plans** — [+ View more]

Clicking it expands the exact same set of `otherServices` cards (all property/investor plans
*and* the residential add-ons, since none of them are pymes-relevant) using the existing
`OtherServiceCard` renderer — nothing is removed, it's just opt-in instead of default-visible.
Owner and Tenant rendering paths are untouched (owner keeps its existing per-group `<details>`
sections; tenant/fallback keeps the existing flat grid).

# Fix 3 — Available Services Stat Clarified

**Confirmed:** the "Available Services" stat card on Dashboard home is unconditional for every
role and counts `SELECT count(*) FROM services WHERE is_active = true` — currently 19 rows
platform-wide, dominated by property/investor plans and add-ons a PYME customer will never buy.

**Chosen replacement:** for PYME customers only, this card is now:
- **If they have a recommended plan:** title "Services In Your Plan", value =
  `pymesPlanDetails.features.length` (e.g. Rescue → 6, Growth → 7, Scale → 6), subtitle
  "Included in your {Plan} plan".
- **If no diagnosis/plan yet:** title "Available Plans", value `3`, subtitle "Rescue, Growth,
  Scale — take the diagnosis".

**Reasoning:** the DB has zero services whose `target_roles` includes `pymes` other than the
three `Plan: PYMES — Rescue/Growth/Scale` rows, so a "PYME-relevant add-on count" would always be
0 and equally uninformative. Counting the number of deliverables/services bundled into the
customer's *own* assigned plan keeps the card's original intent (communicate "how many services
you get") while making it about something the customer actually has, instead of a platform-wide
number dominated by services they can't buy. The platform-wide count query is now also skipped
entirely for PYME requests (previously run and discarded), avoiding an unnecessary DB round trip.

**Same stat elsewhere:** the identical unconditional "Available Services: {count}" card also
renders for Property Owner/Investor and Tenant dashboards, and has the same underlying issue —
an owner sees a count that includes Tenant and PYME-only services, and a tenant sees a count that
includes Owner/Investor/PYME-only services. This is not a trivial one-line fix for those roles
(each would need its own "relevant to me" definition, e.g. an owner's own tier's feature count vs.
a tenant's matched-properties count already shown elsewhere), so per the task scope **only the
PYME case was changed**; Owner/Investor/Tenant dashboards are unchanged and still show the
platform-wide count.

# Files Modified

- `src/app/(dashboard)/dashboard/page.tsx` — Fix 1 (plan card reuse via `getPymesPlanForUser` +
  `PymesPlanCard`), Fix 3 (PYME-specific stat card, conditional service-count query).
- `src/app/(dashboard)/dashboard/services/page.tsx` — Fix 1 (switched to the shared helper/
  component instead of its own inline logic; removed the duplicate local `PYMES_PLANS` object
  literal in favor of the canonical one in `src/lib/constants.ts`, values unchanged), Fix 2
  (collapsed real-estate section for PYME in "Other Available Services").
- `src/lib/pymes-plan-display.ts` — new. Shared `getPymesPlanForUser()` helper (diagnosis lookup,
  admin override merge, `pymes_plans` id lookup) used by both pages.
- `src/components/dashboard/pymes-plan-card.tsx` — new. Shared `PymesPlanCard` component
  (the working plan card + checkout button) used by both pages.

# What Was Intentionally Not Changed

- Plan assignment logic, scoring, or pricing for any role — `PYMES_PLANS` values (price, upfront,
  installment, duration, features) are byte-identical to what was already hardcoded; only the
  duplicate local copy in `services/page.tsx` was removed in favor of importing the one in
  `src/lib/constants.ts` that Dashboard home already used.
- Property Owner and Investor dashboards/services pages — the only reuse was the pre-existing
  `<details>` collapsible pattern already built for owners; their own grouping/content is
  untouched.
- Tenant flows — matched-properties, preferences, and the flat "Other Available Services" grid
  tenants see are unchanged.
- No commit, push, or deploy was performed.

# Expected Result

- On Dashboard home, a PYME customer now sees "Your Recommended Plan: Rescue" (or Growth/Scale)
  with a working "Pay $X CAD upfront" button that opens Stripe checkout — identical to what
  Recommended Services already showed.
- On Recommended Services, "Other Available Services" for a PYME customer collapses to a single
  "Own a property? Explore our real estate plans" prompt; clicking it reveals the same
  property/investor plans and residential add-ons as before, just opt-in instead of clutter.
- On Dashboard home, the confusing "Available Services: 19" stat is replaced for PYME customers
  with a count scoped to their own plan (or the 3 available plan tiers pre-diagnosis), removing
  the platform-wide number that included plans irrelevant to them.
