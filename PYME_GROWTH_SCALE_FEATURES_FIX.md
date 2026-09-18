# Growth Plan Features Corrected

`PYMES_PLANS.growth.features` in `src/lib/constants.ts` (the shared source of truth — see below):

- Removed: `"Lead tracking system implementation"`
- Added: `"Direct 1-on-1 advisory sessions"` (placed right before the KPI-reporting line, mirroring where Rescue's own advisory-sessions line sits in its list)

New Growth list: Complete business diagnosis & sales leak analysis → Marketing strategy development & execution → Conversion rate optimization → Campaign structure & ad management → Market positioning analysis → **Direct 1-on-1 advisory sessions** → Bi-weekly KPI performance reports.

# Scale Plan Features Corrected

`PYMES_PLANS.scale.features`:

- Added: `"Direct 1-on-1 advisory sessions"`
- Added: `"Marketing strategy development & execution"`
- Added: `"Lead tracking system implementation"`

New Scale list: Complete business diagnosis & sales leak analysis → **Marketing strategy development & execution** → Advanced multi-channel optimization → Channel expansion & new market entry → Growth strategy & scaling roadmap → **Lead tracking system implementation** → Opportunity & competitor analysis → **Direct 1-on-1 advisory sessions** → Weekly KPI performance reports.

No exact position was specified for the additions, so they were placed to mirror Rescue's and Growth's own internal ordering convention (advisory sessions near the end, before the reporting-cadence line; strategy/execution items placed early). Reorder if a different placement was intended — this is purely presentational, the set of features is what was specified.

Rescue's feature list was not touched.

# Single Source Confirmed Across All 3 Surfaces

Traced how each of the three surfaces actually resolves PYME plan features — this took more digging than a simple "one shared constant," because there turned out to be **two independent layers**, not one:

1. **`PYMES_PLANS`** (`src/lib/constants.ts`) — the base/default feature data.
2. **`app_config` admin override** (table rows `category='plan_features:pymes_growth'/'pymes_scale'`, `key='features'`) — read by `getPymesPlanForUser()` in `src/lib/pymes-plan-display.ts`, which **prefers the override over `PYMES_PLANS` whenever a row exists**. Dashboard home and Recommended Services both call this one shared function (confirmed by its own doc comment: *"the single source of truth both /dashboard and /dashboard/services use..."*), so they're already consistent with each other.

**Critical finding**: `migration_v11_steve_4_29_fixes.sql` seeded exactly these two `app_config` rows with the *old, wrong* feature text back when Growth/Scale were first added, and no migration since has touched them. That override row still exists — so editing `PYMES_PLANS` alone would have had **zero visible effect** on Dashboard/Recommended Services; the stale `app_config` value would keep winning every time. This is why `supabase/migration_v60_pymes_growth_scale_features.sql` also updates those two `app_config` rows to the corrected text — without it, the fix would only ever show up on the results page.

**Third surface — "Compare All Plans"** (`src/app/results/pymes/[id]/page.tsx`): this page never touched `PYMES_PLANS` or `app_config` at all. It kept its own fully separate `PLAN_DETAILS` object (a byte-for-byte copy of `PYMES_PLANS`, plus an unused `priceNum` field) and its own separate `ALL_FEATURES` flat list for the comparison table rows — exactly the "separate/duplicated feature list" the task asked me to check for. Consolidated:
```ts
const PLAN_DETAILS = PYMES_PLANS;
const ALL_FEATURES = Array.from(
  new Set((["rescue", "growth", "scale"] as const).flatMap((key) => PLAN_DETAILS[key].features)),
);
```
`ALL_FEATURES` is now derived, not hand-maintained, so a future feature addition can't be silently missed from the comparison table again. The unused `priceNum` field disappeared along with the duplicate object — grepped for `.priceNum` usage first and confirmed it was dead code, never read anywhere.

**One residual asymmetry, left as-is (not introduced by this fix, and out of the stated scope)**: the results page reads `PYMES_PLANS` directly and does not apply the `app_config` admin override the way Dashboard/Recommended Services do — it never did. If an admin edits Growth/Scale wording later via `/admin/plans`, that edit will show on Dashboard/Recommended Services but not on this results page. Flagging this so it's a known, visible tradeoff rather than a silent gap — fully unifying it would mean adding override-fetching to a page that was never built for it, which felt like scope beyond "fix the feature list + remove duplicates."

# Files Modified

- `src/lib/constants.ts` — corrected `PYMES_PLANS.growth.features` and `PYMES_PLANS.scale.features` (Rescue untouched).
- `src/app/(dashboard)/admin/plans/page.tsx` — synced the `pymes_growth`/`pymes_scale` entries' `defaultFeatures` (the admin editor's pre-fill/fallback text, shown only when no `app_config` override row exists) to match — kept as literal arrays, consistent with this file's existing convention of mirroring live copy for every other plan entry, rather than introducing a new import pattern for just these two.
- `src/app/results/pymes/[id]/page.tsx` — removed its standalone `PLAN_DETAILS`/`ALL_FEATURES` duplicates; now imports and derives from `PYMES_PLANS`.
- **New**: `supabase/migration_v60_pymes_growth_scale_features.sql` — `UPDATE app_config` for the two stale override rows seeded by `migration_v11`. Not yet applied — needs to be run against Supabase by someone with DB access, same as the still-pending `migration_v59` from the prior task. Nothing was committed, pushed, or deployed.

# Expected Result

Once `migration_v60` is applied: Growth's card/table everywhere (Dashboard home, Recommended Services, and Compare All Plans) shows "Direct 1-on-1 advisory sessions" and no longer shows "Lead tracking system implementation." Scale's shows all three additions. Rescue is unchanged everywhere. Because all three surfaces now resolve from the same underlying data (`PYMES_PLANS` as the base, with the `app_config` override — now also corrected — layered on top for Dashboard/Recommended Services only), a future correction to Growth or Scale's features needs to happen in at most two known places instead of drifting silently across three-plus hardcoded copies.
