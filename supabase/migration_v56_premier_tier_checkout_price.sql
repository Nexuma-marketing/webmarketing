-- ============================================================
-- Migration v56: Premier Tier checkout price parity with Support Tier
-- Run this in Supabase Dashboard → SQL Editor → New query
-- ============================================================
--
-- Bug: on Recommended Services, expanding "Want to pay in installments?
-- See Premier Tier details" reveals a "Go Premier" button that does
-- nothing when clicked, while the sibling "Get Support" (Support Tier)
-- button works.
--
-- Root cause: dashboard/services/page.tsx only renders a real
-- CheckoutButton for a plan when its `services` row is active AND has
-- price > 0 (see PLAN_NAME_TO_DB_SERVICE + servicesByDbName lookup —
-- identical code path is used for both Support Tier and Premier Tier).
-- Otherwise it silently falls back to a dead `<Link href="#contact">`.
--
-- 'Plan: Owner Preferred — Support Tier' and 'Plan: Owner Preferred —
-- Premier Tier' were both originally seeded at price = 0 (v12), then
-- both explicitly left at 0 "by design" in v28 (CFP-based pricing,
-- no upfront Stripe charge). Migration v34 ("No puedo comprar ningún
-- plan") later corrected this for both plans in one statement
-- (`UPDATE services SET price = 200 WHERE name IN (...)`), matching
-- the $200 upfront-deposit checkout mechanism already used by Basic's
-- Low Price / Founders plans. If v34 was not applied — or Premier's
-- row was otherwise reset to 0/inactive after — Premier silently loses
-- checkout capability while Support keeps working, exactly matching
-- the reported symptom.
--
-- Fix: idempotently (re-)apply the same $200 upfront-deposit price and
-- active status to ONLY the Premier Tier row, so the already-correct,
-- already-shared front-end code renders a working CheckoutButton for
-- it — the exact same mechanism Support Tier already uses. This does
-- NOT touch Support Tier's row, and does NOT change the Premier Tier
-- plan's displayed pricing text or terms (30%/28% of rent, 50/30/20
-- installment schedule) — those live in OWNER_TIERS (constants.ts) and
-- this row's `description` column, both left untouched here. The $200
-- remains, as with Support Tier, an upfront deposit collected via
-- Stripe; the percentage-based balance/installments continue to be
-- handled out-of-band, unchanged.
--
-- Idempotent — re-running matches the same target state.
-- ============================================================

UPDATE services
SET price = 200,
    is_active = true
WHERE name = 'Plan: Owner Preferred — Premier Tier';

-- Verification:
-- SELECT name, price, currency, is_active
-- FROM services
-- WHERE name IN (
--   'Plan: Owner Preferred — Support Tier',
--   'Plan: Owner Preferred — Premier Tier'
-- );
