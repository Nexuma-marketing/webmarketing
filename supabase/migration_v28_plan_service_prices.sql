-- ============================================================
-- Migration v28 - set the upfront system fee as the price for
--                 owner Basic plans so admin pricing stops showing $0
-- ============================================================
-- Steve 5/8 docx: "Aun en el panel administrador estan unos servicios
-- con valor $0 y falta el servicio Low price". Low Price exists from
-- v19 but was inserted with price=0 (matching the v12 pattern for
-- Founders Package), so admin's pricing table showed several $0 rows.
--
-- The owner Basic plans (Founder Package + Low Price) are sold as a
-- $200 system fee upfront + the rest collected after the tenant
-- signs the lease (30% or 35% of first month's rent). $200 is the
-- only amount Stripe actually charges at checkout — the % balance is
-- handled out-of-band — so storing 200 as services.price is the
-- accurate value. The description still spells out the %.
--
-- Owner Preferred plans (Support Tier / Premier Tier) stay at 0 here
-- because their pricing is CFP-based (% of monthly rent every month)
-- and no upfront stripe charge applies — leave them as 0 with a
-- clarified description so admin can tell why the price reads $0.
--
-- Idempotent — re-running matches the same target state.
-- ============================================================

UPDATE services
SET price = 200,
    description = 'Owner Basic plan. $200 system fee upfront (charged at checkout) + 35% of first month''s rent collected after the tenant signs the lease. Listed as 35% one-time on the public plan card.'
WHERE name = 'Plan: Low Price';

UPDATE services
SET price = 200,
    description = 'Owner Basic plan with the founders rate (30% lifetime — limited to the first 20 owners). $200 system fee upfront (charged at checkout) + 30% of first month''s rent collected after the tenant signs the lease.'
WHERE name = 'Plan: Founder Package — Visionary Owners';

UPDATE services
SET description = 'Owner Preferred Tier (2–3 properties). Pricing is CFP-based: a percentage of monthly rent collected each month, no upfront Stripe charge. Admin price reads $0 by design.'
WHERE name = 'Plan: Owner Preferred — Support Tier'
  AND COALESCE(price, 0) = 0;

UPDATE services
SET description = 'Owner Preferred Tier (2–3 properties, 1.5+ year commitment). Pricing is CFP-based: a percentage of monthly rent collected each month, no upfront Stripe charge. Admin price reads $0 by design.'
WHERE name = 'Plan: Owner Preferred — Premier Tier'
  AND COALESCE(price, 0) = 0;

-- Verification:
-- SELECT name, price, currency, left(description, 80) AS preview
-- FROM services
-- WHERE name LIKE 'Plan: %'
-- ORDER BY name;
