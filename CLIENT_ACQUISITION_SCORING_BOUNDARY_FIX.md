# Root Cause (exact boundary error found)

**None found. The reported bug is not reproducible against the current code.**

The score-to-plan mapping lives entirely in one place: `calculateCaptacionPlan()` in [src/app/forms/pymes/page.tsx:159-179](src/app/forms/pymes/page.tsx#L159-L179), specifically the ternary chain at line 175-176:

```ts
const recommendedPlan: "rescue" | "growth" | "scale" =
  totalScore <= 4 ? "rescue" : totalScore <= 7 ? "growth" : "scale";
```

Evaluated by hand for every possible integer score in the valid 3-9 range:

| totalScore | `totalScore <= 4` | `totalScore <= 7` | Result |
|---|---|---|---|
| 3 | true | — | rescue |
| 4 | true | — | rescue |
| 5 | false | true | growth |
| 6 | false | true | growth |
| 7 | false | true | growth |
| 8 | false | false | scale |
| 9 | false | false | scale |

`totalScore <= 4` is inclusive of 4 by construction — there is no `<` vs `<=` off-by-one, and no gap between the `rescue` and `growth` branches (the `else` in the second ternary means every non-rescue score falls through to `<= 7`, so nothing between 4 and 8 is missed or double-counted). A score of exactly 4 maps to `rescue`, not `growth`.

**Additional checks performed to rule out the bug living elsewhere:**
1. `calculateCaptacionPlan()` has exactly one call site, [src/app/forms/pymes/page.tsx:322](src/app/forms/pymes/page.tsx#L322), inside `submitCaptacion()`. Its return value (`recommendedPlan`) is written straight to the `pymes_captacion` insert at line 340 and to `setCaptRecommendedPlan()` at line 359 — no intermediate reassignment, default fallback, or second mapping table touches it before storage or display.
2. `git diff` and `git status` show **zero uncommitted changes** to `src/app/forms/pymes/page.tsx` — the working tree exactly matches commit `86096cb` ("Add plan scoring logic to Client Acquisition form, replacing hardcoded Growth assignment"), which is the commit that introduced this exact ternary. There is no stray local edit that could explain a discrepancy between what's on disk and what was tested.
3. No `.next` build directory exists in the repo, ruling out a stale compiled bundle being served during testing while the source already had different (correct) logic.
4. The only *other* `"growth"` literals in the codebase are pre-existing, unrelated null-safety fallbacks in Sales Leak Diagnosis's results page and result-email route (`diagnosis.recommended_plan ?? "growth"`), which only fire when `recommended_plan` is `null`/`undefined` on a `pymes_diagnosis` row — not reachable from `calculateCaptacionPlan()`'s return value at all, since that value is never null.

**Likely explanation for the original report:** the described repro ("lowest budget tier, least years in business, 'None' selected for marketing channels") actually computes `budgetPoints=1 + yearsPoints=1 + channelsPoints=1 = 3`, not 4, under the current point rules — so if a score of 4 really was observed and mapped to `growth`, either (a) the test wasn't run against this exact file/commit, or (b) one of the three inputs wasn't at its true minimum (e.g. a channel option other than the literal string `"None"` was selected, bumping `channelsPoints` to 2). Either way, the mapping function itself is not the source, since 4 unconditionally resolves to `rescue` as written.

# Fix Implemented

No code change made. Per the task instructions ("only change the score-to-plan mapping logic" — there being nothing incorrect in that logic to change), altering already-correct boundary code would be an unjustified edit with no defect to justify it.

# All Boundary Values Verified (3,4,5,7,8,9 each mapped correctly)

Traced against the current `src/app/forms/pymes/page.tsx:175-176` ternary, no code changes:

| Score | Expected | Actual (current code) | Match |
|---|---|---|---|
| 3 | rescue | rescue | ✅ |
| 4 | rescue | rescue | ✅ |
| 5 | growth | growth | ✅ |
| 7 | growth | growth | ✅ |
| 8 | scale | scale | ✅ |
| 9 | scale | scale | ✅ |

(6 also checked for completeness: growth ✅, since it falls in the same untouched branch as 5 and 7.)

# Files Modified

None.

# Expected Result

Client Acquisition submissions continue to score exactly as originally specified and previously verified: 3-4 → Rescue, 5-7 → Growth, 8-9 → Scale, with both boundary edges (4/5 and 7/8) inclusive on the lower side of each range. If a score-4 → Growth misassignment is still observed in a live/deployed environment, the next step should be to capture the actual `total_score` and the three raw inputs (`monthly_marketing_budget`, `years_in_business`, `current_channels`) stored on that specific `pymes_captacion` row, since the mapping function itself is confirmed correct against the checked-in source.
