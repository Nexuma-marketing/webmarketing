-- ============================================================
-- Migration v31 — Milestone 4 final decisions
-- Corrected to approved MVP commercial rules
-- ============================================================
-- DATA / CONFIGURATION UPDATES ONLY.
--
-- IMPORTANT:
-- - Owner Basic / Founder / Support use a $200 upfront deposit.
-- - That $200 is CREDITED toward the total service fee.
-- - It is NOT an additional fee.
-- - Premier uses a different long-term installment model:
--   50% / 30% / 20%.
-- - Elite Assets & Legacy uses fixed per-property fees plus
--   monthly maintenance fees.
-- - Optional premium positioning is a separate $150 service and
--   is NOT created or modified in this migration.
-- ============================================================


-- ============================================================
-- 1. FOUNDERS PLAN COUNTER
-- ============================================================

UPDATE app_config
SET
  value = '0',
  updated_at = now()
WHERE category = 'founders_plan'
  AND key = 'taken';


UPDATE app_config
SET
  value = '20',
  updated_at = now()
WHERE category = 'founders_plan'
  AND key = 'limit';


-- Seed if missing
INSERT INTO app_config (category, key, value)
SELECT 'founders_plan', 'taken', '0'
WHERE NOT EXISTS (
  SELECT 1
  FROM app_config
  WHERE category = 'founders_plan'
    AND key = 'taken'
);


INSERT INTO app_config (category, key, value)
SELECT 'founders_plan', 'limit', '20'
WHERE NOT EXISTS (
  SELECT 1
  FROM app_config
  WHERE category = 'founders_plan'
    AND key = 'limit'
);


-- ============================================================
-- 2. REFUND POLICY
-- ============================================================
-- Stored in legal_documents so it can be managed from Admin.
-- Legal wording will receive a separate final legal review
-- before production launch.

INSERT INTO legal_documents (type, content, version)
VALUES (
  'refund_policy',
  E'Debido a la naturaleza personalizada de nuestros servicios de marketing y consultoría, todas las ventas son definitivas. No se otorgan reembolsos totales ni parciales una vez iniciado el periodo mensual de servicio o tras la entrega de los primeros activos de marketing.\n\nDue to the customized nature of our marketing and consulting services, all sales are final. No full or partial refunds are granted once the monthly service period has started or once the first marketing assets have been delivered.',
  '1.0'
)
ON CONFLICT (type) DO NOTHING;


-- ============================================================
-- 3. OWNER BASIC — LOW PRICE
-- ============================================================
-- Total service fee:
-- 35% of first month's rent.
--
-- Payment:
-- $200 upfront deposit.
-- $200 is credited toward the 35% total.
-- Remaining balance is paid after tenant signs.
-- One-time service fee.

UPDATE services
SET
  price = 200,
  description =
    'Owner Basic — Low Price. Total service fee: 35% of the first month''s rent. A $200 upfront deposit is required and is credited toward the total service fee; it is not an additional charge. The remaining balance is due after the tenant signs the lease. One-time service fee.'
WHERE name = 'Plan: Low Price';


-- ============================================================
-- 4. OWNER BASIC — FOUNDER PACKAGE
-- ============================================================
-- Limited to first 20 Visionary Owners.
-- Lifetime rate:
-- 30% of first month's rent.
--
-- Payment:
-- $200 upfront deposit.
-- $200 is credited toward the 30% total.
-- Remaining balance is paid after tenant signs.
-- One-time service fee.

UPDATE services
SET
  price = 200,
  description =
    'Owner Basic — Founder Package for the first 20 Visionary Owners. Exclusive lifetime service rate: 30% of the first month''s rent. A $200 upfront deposit is required and is credited toward the total service fee; it is not an additional charge. The remaining balance is due after the tenant signs the lease. One-time service fee.'
WHERE name = 'Plan: Founder Package — Visionary Owners';


-- ============================================================
-- 5. OWNER PREFERRED — SUPPORT TIER
-- ============================================================
-- Applies to 2–3 properties.
--
-- Property 1:
-- Total service fee = 30% of first month's rent.
--
-- Property 2:
-- Total service fee = 28% of first month's rent.
--
-- Property 3:
-- Total service fee = 28% of first month's rent.
--
-- Payment:
-- Each property requires a $200 upfront deposit.
-- Each $200 deposit is credited toward the applicable total fee.
-- It is not an additional charge.

UPDATE services
SET
  price = 200,
  description =
    'Owner Preferred — Support Tier for 2–3 properties. Property 1: total service fee of 30% of the first month''s rent. Properties 2 and 3: total service fee of 28% of the first month''s rent per property. Each property requires a $200 upfront deposit, credited toward that property''s total service fee. The $200 is not an additional charge. The remaining balance is due after the tenant signs the lease.'
WHERE name = 'Plan: Owner Preferred — Support Tier';


-- ============================================================
-- 6. OWNER PREFERRED — PREMIER TIER
-- ============================================================
-- Long-term benefit for contracts longer than one year.
--
-- Property 1:
-- Total service fee = 30% of first month's rent.
--
-- Property 2:
-- Total service fee = 28% of first month's rent.
--
-- Property 3:
-- Total service fee = 28% of first month's rent.
--
-- PREMIER PAYMENT SCHEDULE:
-- 50% of the applicable total fee at the beginning.
-- 30% three months later.
-- 20% three months after the second payment.
--
-- IMPORTANT:
-- Premier does NOT use the standard $200 deposit model.
-- Its initial payment is 50% of the applicable total service fee.

UPDATE services
SET
  description =
    'Owner Preferred — Premier Tier for contracts longer than one year. Property 1: total service fee of 30% of the first month''s rent. Properties 2 and 3: total service fee of 28% of the first month''s rent per property. Premier installment benefit: 50% of the applicable total service fee is paid at the beginning, 30% three months later, and the remaining 20% three months after the second payment.'
WHERE name = 'Plan: Owner Preferred — Premier Tier';


-- ============================================================
-- 7. ELITE — ASSETS & LEGACY
-- ASSET MANAGEMENT
-- ============================================================


-- ------------------------------------------------------------
-- ESSENTIALS
-- Monthly rent range:
-- CAD $2,500–$3,999
--
-- One-time fee:
-- $900 PER PROPERTY
--
-- Monthly maintenance:
-- $200 PER PROPERTY
-- ------------------------------------------------------------

UPDATE services
SET description =
  'Elite Assets & Legacy — Asset Management, Essentials. For properties with monthly rent from $2,500 to $3,999 CAD. One-time fee: $900 per property. Monthly maintenance fee: $200 per property.'
WHERE name = 'Plan: Elite — Essentials';


-- ------------------------------------------------------------
-- SIGNATURE
-- Monthly rent range:
-- CAD $4,000–$7,000
--
-- One-time fee:
-- $1,410 PER PROPERTY
--
-- Monthly maintenance:
-- $200 PER PROPERTY
-- ------------------------------------------------------------

UPDATE services
SET description =
  'Elite Assets & Legacy — Asset Management, Signature. For properties with monthly rent from $4,000 to $7,000 CAD. One-time fee: $1,410 per property. Monthly maintenance fee: $200 per property.'
WHERE name = 'Plan: Elite — Signature';


-- ------------------------------------------------------------
-- LUJO
-- Monthly rent range:
-- CAD $7,001 and above (no upper cap)
--
-- One-time fee:
-- $1,650 PER PROPERTY
--
-- Monthly maintenance:
-- $300 PER PROPERTY
-- ------------------------------------------------------------

UPDATE services
SET description =
  'Elite Assets & Legacy — Asset Management, Lujo. For properties with monthly rent of $7,001 CAD or more. One-time fee: $1,650 per property. Monthly maintenance fee: $300 per property.'
WHERE name = 'Plan: Elite — Lujo';


-- ============================================================
-- 8. PYMES
-- ============================================================

UPDATE services
SET description =
  'Intensive intervention plan to exit critical mode. One-time $1,500.'
WHERE name = 'Plan: PYMES — Rescue';


UPDATE services
SET description =
  'Plan to overcome stagnation and start growing. One-time $2,500.'
WHERE name = 'Plan: PYMES — Growth';


UPDATE services
SET description =
  'Plan to scale and maximize revenue. One-time $3,800.'
WHERE name = 'Plan: PYMES — Scale';


-- ============================================================
-- 9. PAYMENT IMPLEMENTATION NOTES
-- ============================================================
--
-- BASIC / FOUNDER / SUPPORT
--
-- $200 = UPFRONT DEPOSIT.
--
-- It is credited toward the applicable total percentage-based
-- service fee.
--
-- It is NOT:
-- - an additional system fee
-- - a maintenance fee
-- - a positioning fee
--
--
-- PREMIER
--
-- Premier does NOT use the standard $200 deposit model.
--
-- Payment schedule:
-- 50% at the beginning
-- 30% three months later
-- 20% three months after the second payment
--
--
-- STRIPE / PAYMENTS
--
-- Automated calculation and collection of percentage-based
-- balances and Premier installments must be implemented/reviewed
-- separately during the Stripe/payments phase.
--
--
-- OPTIONAL PREMIUM POSITIONING
--
-- Approved price: $150.
--
-- This is an independent optional service intended to improve
-- property visibility/positioning across listing platforms.
--
-- It is separate from all plan deposits and plan fees.
--
-- This migration intentionally DOES NOT create or update that
-- service because the existing service record/name must first
-- be identified to avoid creating a duplicate.
--
-- ============================================================


-- ============================================================
-- 10. VERIFICATION QUERIES
-- Read-only. Uncomment later if needed.
-- ============================================================

-- SELECT
--   name,
--   price,
--   currency,
--   description
-- FROM services
-- WHERE name LIKE 'Plan: %'
-- ORDER BY name;


-- SELECT
--   key,
--   value
-- FROM app_config
-- WHERE category = 'founders_plan'
-- ORDER BY key;


-- SELECT
--   type,
--   version,
--   left(content, 100) AS preview
-- FROM legal_documents
-- WHERE type = 'refund_policy';
