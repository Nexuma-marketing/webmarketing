# Service Assignment Logic (Basic/Preferred/Elite threshold) — Current State

There are two assignment paths:

- `src/lib/profiling.ts` exports `classifyOwner(propertyCount)`, which implements the raw count rule correctly: `>= 4` returns `{ role: "inversionista", serviceTier: "elite" }`; `>= 2` returns Preferred; otherwise Basic. This helper is not the effective path for an already registered owner.
- The effective `profileOwner()` function in the same file intentionally preserves the current `profiles.role`. If that role is `inversionista`, it assigns `elite` regardless of count. If it is `propietario` or `propietario_preferido`, it assigns `preferred_owners` at `>= 2` properties and explicitly never promotes that person to Investor/Elite, even at four or more properties.

Both owner dashboard pages (`src/app/(dashboard)/dashboard/page.tsx` and `src/app/(dashboard)/dashboard/services/page.tsx`) follow the same precedence: a stored `inversionista` role always displays Elite; a stored owner role displays Basic/Preferred by count. Therefore the UI cannot show Preferred/Support for a profile whose stored role is actually `inversionista`.

The original onboarding submit (`src/app/forms/propietario/page.tsx`) initially calculates `elite` for four properties and creates investor-form properties with that tier, but then calls `/api/profiling`. That calls `profileOwner()`, which applies the role-preservation rule described above.

# Portfolio Assignment Logic (Essentials/Signature/Luxury per property) — Current State, Exists or Missing

The logic exists and is per-property in both the original investor onboarding form and the profiling runner:

- `src/app/forms/propietario/page.tsx` calls `getPortfolio(rent)` inside the loop that inserts each investor property. It saves that individual property's `elite_tier`, CFP, and payback values.
- `src/lib/profiling.ts` iterates every property owned by the user, calls `classifyEliteTier(rent)`, and writes each property's own `elite_tier` when the effective service tier is Elite.

Current threshold implementation is:

- `rent >= 7,001` → `lujo`
- `rent >= 4,000` → `signature`
- otherwise → `essentials`

So the intended per-property model exists, including mixed portfolios for a single investor. The lower boundaries for Essentials and Signature match the stated ranges. However, the implementation has no `$12,000` upper cap for Luxury and treats any rent below `$4,000` (including below `$2,500`) as Essentials. It is therefore not an exact enforcement of the stated `$2,500–$12,000` ranges.

# CFP/Payback Wiring For Investor Properties — Current State

`src/lib/profiling.ts` calculates CFP as `monthlyRent × 10%` and calculates payback as `portfolioMonthlyFee / CFP`. It writes payback only when the effective tier is `elite` and writes `elite_tier` per property in that same condition.

CFP itself is currently calculated and stored for every profiled owner property before the Elite check, including Basic/Preferred properties. It is not displayed to Basic/Preferred users because the dashboard property list, property detail page, and Services portfolio breakdown all gate CFP/Payback presentation on `profile.role === "inversionista"`. For an Investor, the display is per property:

- `src/app/(dashboard)/dashboard/services/page.tsx` renders a Property Portfolio Breakdown using each property's rent, `elite_tier`, `cfp_monthly`, and `payback_months`.
- `src/app/(dashboard)/dashboard/properties/page.tsx` renders CFP and Payback inside each property card.
- `src/app/(dashboard)/dashboard/properties/[id]/page.tsx` renders the same individual property financial overview.

Thus Payback is Elite-only in persistence and both values are Investor-only in display, but CFP remains persisted for non-Elite properties as a data-side inconsistency.

# Elite Fee Configuration — Current Values

The active code constants agree on the expected monthly fees:

- Essentials: `$100/month`
- Signature: `$100/month`
- Lujo/Luxury: `$300/month`

They appear in `src/lib/profiling.ts` (`PORTFOLIO_FEES`), `src/app/forms/propietario/page.tsx` (initial investor submission), and `src/app/(dashboard)/dashboard/services/page.tsx` (portfolio presentation). The migration/service descriptions also retain these values, with one-time fees of `$900`, `$1,410`, and `$1,650` respectively.

The descriptions are inconsistent about whether a monthly portfolio fee is “per property” or “shared across linked properties,” but the requested values themselves are currently `$100 / $100 / $300`. No `$200` change is present in the checked-in code or migrations.

# Root Cause: Why This Investor Got Preferred Owners Instead Of Elite

This is a code/role-state issue, not a faulty `>= 4` comparison.

The dashboard would assign Elite immediately if the stored profile role were `inversionista`, so the observed Preferred Owners/Support Tier state establishes that the active profile role was `propietario` or `propietario_preferido` when the page and profiling runner read it.

The most direct reproducible path is:

1. The account is registered with role `propietario` (the registration page persists that selection in auth metadata/profile).
2. The user chooses “Investor” in the later six-step owner form. That form uses the choice to insert four Elite-shaped property rows, but it does not update `profiles.role` to `inversionista`.
3. The form calls `/api/profiling`; `profileOwner()` sees the existing owner role and deliberately preserves it. At four properties it sets the effective tier to `preferred_owners`, updates every property to that tier, clears their `elite_tier` and Payback, and leaves the profile role as `propietario_preferido`.
4. The dashboard then correctly follows that stored non-Investor role and renders Preferred Owners / Support Tier.

The four-step Add Property flow has the same role-preserving profiling call after it adds a property. It calculates `elite` for the newly inserted fourth property, but the later profiling call can overwrite it to Preferred if the stored role is not `inversionista`.

To confirm the specific account record operationally, inspect its `profiles.role`, `profiles.property_count`, and the four `properties` rows (`service_tier`, `elite_tier`, `cfp_monthly`, `payback_months`). That database state is not available in this workspace, so this report does not claim to have inspected the live account.
