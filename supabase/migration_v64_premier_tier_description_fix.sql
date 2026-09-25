-- ============================================================
-- Migration v64 — correct Premier Tier's installment description text
-- ============================================================
-- Run in Supabase SQL Editor (postgres / service_role).
--
-- Context: PROMPT2 payment-flow overhaul, item 5. Migration v59 seeded
-- this description saying "50% of the applicable total service fee is
-- paid at the beginning" — wrong on two counts, confirmed by Alex as
-- part of this work's final spec:
--   1. The upfront is a FLAT $200 (same checkout as every other plan),
--      never 50% of anything.
--   2. The real schedule differs by property rank, not one 50/30/20
--      split for every property:
--        - Property #1 (30% of rent): after the $200 upfront, the
--          remaining balance is ONE payment due 2 months later.
--        - Property #2/#3 (28% of rent each): after the $200 upfront,
--          the remaining balance splits 50% / 30% / 20% due at
--          +1 / +2 / +3 months.
-- Matches the schedule actually implemented by
-- src/lib/premier-installments.ts (see migration v63).
--
-- Idempotent — re-running matches the same target state. Only the
-- description column changes; price/is_active untouched (already
-- correct per migration v56).
-- ============================================================

UPDATE services
SET description =
  'Owner Preferred — Premier Tier for Preferred Owners with 2–3 properties, committing to contracts longer than one year. Property 1: total service fee of 30% of the first month''s rent. Properties 2 and 3: total service fee of 28% of the first month''s rent per property. Same flat $200 CAD upfront as every other plan (never a percentage of the fee), paid at checkout. The remaining balance is then scheduled automatically, starting the moment the $200 upfront is paid — no waiting on "tenant signed lease": Property 1''s remaining balance is due as one payment 2 months after the upfront; Properties 2 and 3''s remaining balance is split into three installments — 50% due 1 month after the upfront, 30% due 2 months after, and 20% due 3 months after.'
WHERE name = 'Plan: Owner Preferred — Premier Tier';

-- Verification:
-- SELECT name, description FROM services
-- WHERE name = 'Plan: Owner Preferred — Premier Tier';
