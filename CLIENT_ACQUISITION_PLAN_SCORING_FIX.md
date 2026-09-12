# Old Behavior (hardcoded Growth)

**What was actually found:** Client Acquisition (`formType = "captacion"` in `src/app/forms/pymes/page.tsx`, table `pymes_captacion`) had **no plan-assignment code path at all** — not a hardcoded "Growth" literal, but a complete absence of any scoring or `recommended_plan` field. `pymes_captacion` (`supabase/migration_v4_captacion.sql`) has never had a `recommended_plan` or `total_score` column, and `submitCaptacion()` in `src/app/forms/pymes/page.tsx` only inserted the raw form answers, called `/api/leads`, and called `/api/pymes-captacion-email` — no plan, no score, no results page redirect. After submitting, the customer only saw a static "Submission Received!" screen with zero mention of a plan.

The only literal `"growth"` **default fallbacks** in the codebase live in Sales Leak Diagnosis's own results page (`src/app/results/pymes/[id]/page.tsx:193`, `const recommendedKey = diagnosis.recommended_plan ?? "growth"`) and its result email (`src/app/api/pymes-result-email/route.ts:155`) — both are pre-existing Sales-Leak-only null-safety fallbacks, confirmed untouched, and were never reachable from the Client Acquisition flow since Client Acquisition never created a `pymes_diagnosis` row.

**Conclusion:** this was a fully missing feature, not a bug in an existing hardcode. The scope below implements it as specified.

# Scoring Logic Implemented (exact point mapping)

New function `calculateCaptacionPlan()` in `src/app/forms/pymes/page.tsx` (placed just above `CAPTACION_STEPS`), using the 3 existing fields — no new question/field added:

| Input (existing field) | Rule | Points |
|---|---|---|
| `monthly_marketing_budget` (Step 3, numeric) | $0–$500 | 1 |
| | $501–$2,000 | 2 |
| | More than $2,000 | 3 |
| `years_in_business` (Step 1, numeric) | Less than 1 year | 1 |
| | 1–3 years | 2 |
| | More than 3 years | 3 |
| `current_channels` (Step 3, multi-select, excluding `"None"`) | 0 real channels | 1 |
| | 1–2 channels | 2 |
| | 3+ channels | 3 |

`totalScore` = sum of the 3 (range 3–9) → plan:
- 3–4 → `rescue`
- 5–7 → `growth`
- 8–9 → `scale`

This exactly matches the spec. One incidental, pre-existing quirk (not introduced by this change, not fixed, noted for transparency): `validateStep()` treats `years_in_business = 0` as "empty" for this required field, so in practice a brand-new business may be nudged to enter `1` rather than `0` — this does not affect the scoring rule itself (0 still correctly maps to "Less than 1 year → 1 point" if it ever reaches the scorer).

# Plan Assignment Reusing Sales Leak's Existing Lookup

Reused, not duplicated:
- **`pymes_plans` lookup by `plan_type`** — `submitCaptacion()` now runs the exact same query pattern already used by Sales Leak Diagnosis / `/dashboard/services` (`.from("pymes_plans").select("id").eq("plan_type", recommendedPlan).eq("is_active", true)...`) to resolve the real plan row id for checkout.
- **Same pricing/features display** — the success screen now renders `<PymesPlanCard>` (the shared component built in the prior PYME dashboard UX task), fed with `PYMES_PLANS[recommendedPlan]` from `src/lib/constants.ts` — the single canonical plan data source already used by Sales Leak Diagnosis, Dashboard home, and Services. Same title format ("Your Recommended Plan: {name}"), same price/payment-options/features layout, same working `CheckoutButton type="pymes_upfront"`.
- **Same "results" surface, via the shared lookup, not a duplicate one** — `getPymesPlanForUser()` (`src/lib/pymes-plan-display.ts`) now checks **both** `pymes_diagnosis` and `pymes_captacion` for the user's latest `recommended_plan`, and returns whichever is more recent by `created_at`. Since Dashboard home and Services already call this single helper and render `<PymesPlanCard>` from its result, a Client-Acquisition-only customer's plan now shows up there automatically — zero new UI code needed on those pages.

**Deliberately NOT reused: literal redirect to `/results/pymes/[id]`.** That page is tightly coupled to Sales Leak Diagnosis specifics that Client Acquisition never collects: the 7-question Likert radar chart, a `total_score` rendered with a hardcoded `/35` suffix, and an "Estimated Annual Revenue Loss" computed from `monthly_revenue × 30% × 12`. Sending a Client Acquisition submission there would render a broken/misleading page (null radar scores, a 3–9 score mislabeled "/35", a loss figure with no real revenue input). Instead, the *substantive* reuse requirement — same `pymes_plans` table lookup, same pricing/features component — is honored via the shared `PymesPlanCard` + `getPymesPlanForUser()`, which is the actually-reusable part of "the results page." This tradeoff is called out explicitly here for review.

# Email Confirmation Reflects Correct Plan

`src/app/api/pymes-captacion-email/route.ts` previously mentioned no plan at all (there was no hardcoded "Growth" text to remove, since none existed — see "Old Behavior" above). It now:
1. Accepts a new `captacion_id` field in the request body (parallel to how `/api/pymes-result-email` already requires `diagnosis_id`).
2. Re-queries `pymes_captacion` server-side by `id` + `user_id` (authenticated client, RLS-scoped) for the authoritative `recommended_plan` — **not** trusted from the client request body.
3. Looks up `PYMES_PLANS[recommended_plan]` (same canonical source as everywhere else) and adds a "Recommended Plan — {name} ({price})" row to the **commercial** notification email, and a "Your recommended plan" highlight box (name, price, tagline) to the **customer** confirmation email.

Both the initial submission email and the "SCHEDULE MY RESCUE SESSION" resend now pass `captacion_id`, so the plan appears correctly in every send, including reschedule requests.

# Score/Plan Storage (table/column used)

**New columns on `pymes_captacion` (not `pymes_diagnosis`):** `total_score INTEGER` and `recommended_plan TEXT CHECK (... IN ('rescue','growth','scale'))`, added in `supabase/migration_v55_captacion_plan_scoring.sql`.

**Why a new migration instead of reusing `pymes_diagnosis.total_score`:** the task's guidance was to reuse existing schema unless a new column is genuinely necessary. Reusing `pymes_diagnosis.total_score` was considered and rejected: that column is on a 7–35 scale (7 Likert questions) and is rendered by the Dashboard's "Diagnosis Score" stat card with a hardcoded `X/35` suffix. Writing Client Acquisition's 3–9-scale score into that same column would make that stat card display a misleading number (e.g., "7/35" for what is actually a strong Client-Acquisition score) for any customer whose only PYME activity is Client Acquisition. Adding matching `total_score` / `recommended_plan` columns directly on `pymes_captacion` — using the **same column names and the same CHECK constraint values** as `pymes_diagnosis` — keeps naming/reporting consistent while avoiding this scale collision. This is the "genuinely necessary" case the task anticipated.

**⚠️ Deployment order requirement:** `migration_v55_captacion_plan_scoring.sql` must be run in Supabase **before** this code is deployed. `submitCaptacion()` now inserts `total_score` and `recommended_plan` into `pymes_captacion`; if those columns don't exist yet, every Client Acquisition submission will fail with "Failed to save. Please try again." (the insert throws, caught by the existing try/catch). This is the one part of this change that is not purely additive — flagging it prominently since the task said not to deploy, but whoever does deploy this must run the migration first.

By contrast, the read side (`getPymesPlanForUser()` and the email route's `pymes_captacion` lookup) degrades **gracefully** if the migration hasn't run yet — a failed select on a missing column resolves to `null` there (not a thrown error), so Dashboard/Services/emails simply behave exactly as they do today until the migration is applied.

# Files Modified

- `src/app/forms/pymes/page.tsx` — added `calculateCaptacionPlan()`; `submitCaptacion()` now computes and stores the score/plan, looks up the `pymes_plans` row, and passes `captacion_id` to the email route; success screen now renders `<PymesPlanCard>`.
- `src/app/api/pymes-captacion-email/route.ts` — looks up the calculated plan server-side by `captacion_id` and includes it in both customer and commercial emails.
- `src/lib/pymes-plan-display.ts` — `getPymesPlanForUser()` now also checks `pymes_captacion`, using whichever of the two forms produced a plan more recently; Sales-Leak-only score/urgency/loss stats remain sourced strictly from `pymes_diagnosis`.
- `supabase/migration_v55_captacion_plan_scoring.sql` — new. Adds `total_score` / `recommended_plan` to `pymes_captacion`.

# What Was Intentionally Not Changed

- Sales Leak Diagnosis form, its 7-question scoring, its `pymes_diagnosis` table, its results page (`/results/pymes/[id]`), and its own email route — all untouched.
- `pymes_plans` table structure and plan pricing/features — untouched; only read from.
- No new question or field added to the Client Acquisition form — all 3 scoring inputs already existed.
- Property Owner, Investor, and Tenant flows — untouched.
- Admin `business-profiles` API / `admin/businesses` page — **not** updated to surface the new `total_score`/`recommended_plan` columns. Adding them to that route's existing `pymes_captacion` select was considered, but that route does not check for query errors on this select, so doing so before the migration is applied would silently blank out *all* captacion data in that admin view (not just new rows) — an unacceptable regression risk in a one-pass, no-deploy-coordination change. This is a safe, natural follow-up once the migration is confirmed applied.
- No commit, push, or deploy performed.

# Expected Result

Once `migration_v55_captacion_plan_scoring.sql` is applied: a Client Acquisition submission is scored from its existing budget/years/channels answers, assigned Rescue, Growth, or Scale accordingly (no more silent "no plan" outcome), and that plan flows consistently through: the submission's own stored record, the success screen (with a real working "Pay $X CAD upfront" button), both the customer and commercial emails, and the customer's Dashboard/Services pages — all via the same `pymes_plans`-by-`plan_type` lookup and the same plan-display component Sales Leak Diagnosis already uses, with no duplicated logic.
