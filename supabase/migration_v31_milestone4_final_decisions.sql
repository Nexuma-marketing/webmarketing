-- ============================================================
-- Migration v31 — Milestone 4 final decisions (data updates)
-- ============================================================
-- Source: feedback/MILESTONE4_FINAL_DECISIONS.md
-- Client confirmation: Alex Sanabria, 2026-05-20
--
-- Updates DATA only (config rows, descriptions, policy texts) —
-- no schema changes, no destructive deletes. The 20 test-account
-- cleanup lives in a separate migration v32 so it can be reviewed
-- and run independently.
-- ============================================================

-- ─── 1. Founders counter starts at 0 for real launch ─────────
-- Client: "Contador de founders empezar en cero (0)"
UPDATE app_config
SET value = '0', updated_at = now()
WHERE category = 'founders_plan' AND key = 'taken';

UPDATE app_config
SET value = '20', updated_at = now()
WHERE category = 'founders_plan' AND key = 'limit';

-- Seed if missing (idempotent — first launch case)
INSERT INTO app_config (category, key, value)
SELECT 'founders_plan', 'taken', '0'
WHERE NOT EXISTS (SELECT 1 FROM app_config WHERE category = 'founders_plan' AND key = 'taken');

INSERT INTO app_config (category, key, value)
SELECT 'founders_plan', 'limit', '20'
WHERE NOT EXISTS (SELECT 1 FROM app_config WHERE category = 'founders_plan' AND key = 'limit');

-- ─── 2. Refund policy text (Final Sale) ──────────────────────
-- Client provided the EXACT Spanish text. We store it in
-- legal_documents under type='refund_policy' so /admin/legal can
-- display + edit it like any other policy, and the front-end can
-- pull it for the checkout disclosure ("Debido a la naturaleza...").
INSERT INTO legal_documents (type, content, version)
VALUES (
  'refund_policy',
  E'Debido a la naturaleza personalizada de nuestros servicios de marketing y consultoría, todas las ventas son definitivas. No se otorgan reembolsos totales ni parciales una vez iniciado el periodo mensual de servicio o tras la entrega de los primeros activos de marketing.\n\nDue to the customized nature of our marketing and consulting services, all sales are final. No full or partial refunds are granted once the monthly service period has started or once the first marketing assets have been delivered.',
  '1.0'
)
ON CONFLICT (type) DO NOTHING;

-- ─── 3. Plan-card description updates ────────────────────────
-- Client confirmed final pricing for owner Basic, Preferred, Elite
-- and PYMES tiers. We refresh the description text on the services
-- rows so the admin /admin/pricing table and the customer cards on
-- /dashboard/services show the up-to-date wording. Numeric .price
-- stays as set in v28 (the upfront amount charged at checkout); the
-- percent-of-rent portion is collected manually by the team.

UPDATE services
SET description = 'Owner Basic plan. $200 system fee upfront + 35% of first month''s rent collected after the tenant signs the lease. One-time. The $200 is deducted from the 35%.'
WHERE name = 'Plan: Low Price';

UPDATE services
SET description = 'Owner Basic plan, exclusive lifetime rate for the first 20 Visionary Owners. $200 system fee upfront + 30% of first month''s rent collected after the tenant signs the lease. One-time. The $200 is deducted from the 30%.'
WHERE name = 'Plan: Founder Package — Visionary Owners';

UPDATE services
SET description = 'Owner Preferred Tier (2–3 properties). 1st property: $200 upfront + 30% of rent. 2nd and 3rd properties: $200 upfront + 28% of rent each. One-time per property, $200 deducted from the percentage. Pricing is CFP-based — no upfront Stripe charge.'
WHERE name = 'Plan: Owner Preferred — Support Tier';

UPDATE services
SET description = 'Owner Preferred Tier — Premier (1.5+ year contract). 1st property: $200 maintenance fee + 30% of rent (balance after 2 months of tenant signing). 2nd and 3rd properties: $200 + 28% per property, balance paid 50% / 30% / 20% over months 1-3 after tenant signs. Pricing is CFP-based.'
WHERE name = 'Plan: Owner Preferred — Premier Tier';

UPDATE services
SET description = 'Investor portfolio plan, Essentials tier. Rents in the $2,500–$3,999 CAD/mo range. One-time $900 per property + $100/mo shared portfolio fee.'
WHERE name = 'Plan: Elite — Essentials';

UPDATE services
SET description = 'Investor portfolio plan, Signature tier. Rents in the $4,000–$7,000 CAD/mo range. One-time $1,410 per property + $100/mo shared portfolio fee.'
WHERE name = 'Plan: Elite — Signature';

UPDATE services
SET description = 'Investor portfolio plan, Lujo tier. Rents in the $7,001–$12,000 CAD/mo range. One-time $1,650 per property + $300/mo shared portfolio fee.'
WHERE name = 'Plan: Elite — Lujo';

-- PYMES plan prices already match v28 ($1500/$2500/$3800); we just
-- normalize the description so admin sees a consistent wording.
UPDATE services
SET description = 'Intensive intervention plan to exit critical mode. One-time $1,500.'
WHERE name = 'Plan: PYMES — Rescue';

UPDATE services
SET description = 'Plan to overcome stagnation and start growing. One-time $2,500.'
WHERE name = 'Plan: PYMES — Growth';

UPDATE services
SET description = 'Plan to scale and maximize revenue. One-time $3,800.'
WHERE name = 'Plan: PYMES — Scale';

-- Verification:
-- SELECT name, price, currency, left(description, 100) FROM services WHERE name LIKE 'Plan: %' ORDER BY name;
-- SELECT key, value FROM app_config WHERE category = 'founders_plan';
-- SELECT type, version, left(content, 80) FROM legal_documents WHERE type = 'refund_policy';
