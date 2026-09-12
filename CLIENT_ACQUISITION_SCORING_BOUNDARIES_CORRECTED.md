# Years In Business Boundary Fixed (1 or less → 1pt, 2-3 → 2pt, 4+ → 3pt)

[src/app/forms/pymes/page.tsx:166](src/app/forms/pymes/page.tsx#L166), in `calculateCaptacionPlan()`:

```diff
- const yearsPoints = years < 1 ? 1 : years <= 3 ? 2 : 3;
+ const yearsPoints = years <= 1 ? 1 : years <= 3 ? 2 : 3;
```

New behavior: `years <= 1` → 1 point (covers 0 and 1); `years <= 3` → 2 points (covers 2 and 3); else → 3 points (4+). No overlap or gap: the two comparisons partition cleanly at 1 and 3.

# Budget Boundary Confirmed/Fixed ($0-500→1pt, $501-2000→2pt, $2001+→3pt)

[src/app/forms/pymes/page.tsx:163](src/app/forms/pymes/page.tsx#L163) — **left unchanged**, verified against the corrected rule:

```ts
const budgetPoints = budget <= 500 ? 1 : budget <= 2000 ? 2 : 3;
```

`budget <= 500` → 1 (covers $0–$500); `budget <= 2000` → 2 (covers $501–$2,000); else → 3 (covers $2,001+). This already matched the corrected rule exactly — no overlap existed here (the earlier report's concern was specific to `years`, not `budget`), so no edit was made.

# Integer-Only Input Validation Added (years, and budget if applicable)

Checked [src/app/forms/pymes/page.tsx:534-541](src/app/forms/pymes/page.tsx#L534-L541), the shared renderer for every `field.type === "number"` entry in `CAPTACION_STEPS` (used by both `years_in_business` and `monthly_marketing_budget` — one code path, not per-field):

- The `onChange` handler already does `parseInt(e.target.value) || 0` — a fractional value typed by hand (e.g. "1.5") was already truncated to an integer (`1`) before ever reaching `captData` or the scorer. So there was no actual decimal-scoring ambiguity in stored data for either field.
- Added `step="1"` to the `<input type="number">` itself, so the browser's native spinner/scroll-wheel increments by whole numbers and the field's own validity constraint rejects fractional values at the HTML level, not just in the change handler. Since both fields share this one render path, the constraint now applies identically to `years_in_business` and `monthly_marketing_budget` — no separate per-field change was needed for budget.

# User-Facing Labels Updated To Match

Searched the codebase for any customer- or admin-facing text describing the tier ranges (e.g. "1-3 years", "$501–$2,000") — found none. The form only shows the bare field labels "Years in business" and "Monthly marketing budget (CAD)" ([src/app/forms/pymes/page.tsx:188](src/app/forms/pymes/page.tsx#L188), [:237](src/app/forms/pymes/page.tsx#L237)); the admin businesses view ([src/app/(dashboard)/admin/businesses/page.tsx:378](src/app/(dashboard)/admin/businesses/page.tsx#L378)) just echoes the raw stored number. The tier boundaries themselves only ever existed in the internal spec doc (`CLIENT_ACQUISITION_PLAN_SCORING_FIX.md`), not in any UI string. No label text required a change; nothing was displaying a boundary that could now contradict the code.

# Re-Verification Against All 3 Real Data Rows

Traced against the code as it now stands:

| Row | budget→pts | years→pts | channels→pts | totalScore | recommendedPlan | Expected | Match |
|---|---|---|---|---|---|---|---|
| budget=5000, years=6, 4 channels | 3 | 3 | 3 | 9 | scale | scale (unchanged) | ✅ |
| budget=1500, years=3, 4 channels | 2 | 2 | 3 | 7 | growth | growth (unchanged) | ✅ |
| budget=300, years=1, 1 channel | 1 | **1** (was 2) | 2 | **4** (was 5) | **rescue** (was growth) | rescue | ✅ |

Only the third row's `yearsPoints` and downstream totals changed, exactly as intended; the two previously-correct rows are untouched since neither has `years` in the `(1, 3]`-vs-`[1,3]` gap that moved.

# Files Modified

- `src/app/forms/pymes/page.tsx`:
  - Line 166: `yearsPoints` boundary changed from `years < 1` to `years <= 1`.
  - Line 537 (renderer for all `field.type === "number"` inputs, covering both `years_in_business` and `monthly_marketing_budget`): added `step="1"`.

No other files changed. No commit, push, or deploy performed.

# Expected Result

A Client Acquisition submission with exactly 1 year in business now scores 1 point for that field (not 2), matching the confirmed rule "1 year or less → 1 point." Combined with the already-correct budget and channels scoring, a business reporting the minimum budget tier, 1 year in business, and 1 marketing channel now totals 4 points and is assigned **Rescue** instead of **Growth**. Businesses with 2-3 years continue to score 2 points, and 4+ years continues to score 3 points, matching prior behavior for the two previously-verified rows. Number inputs for both fields now also carry a `step="1"` HTML constraint, reinforcing (not replacing) the existing `parseInt` truncation that was already preventing fractional years/budget from reaching the scorer.
