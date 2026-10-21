-- ============================================================
-- WebMarketing v67 — Elite service descriptions: "maintenance fee"
-- → "platform fee" (customer-facing text only)
--
-- services.description is shown to the customer in the services
-- catalog and as the Stripe Checkout line-item description. The Elite
-- rows still said "Monthly maintenance fee" (Essentials / Signature /
-- Lujo, last set in v59) and "$200 CAD/month maintenance fee" (Below
-- Portfolio Minimum, v57). The rest of the app already says
-- "platform fee". See BUGFIX_ELITE_RECEIPT_AND_DESCRIPTION.md.
--
-- Only the description text changes. Internal identifiers
-- (payments.payment_type / subscription metadata.kind
-- 'elite_maintenance') are NOT touched.
--
-- Idempotent: rows that no longer contain "maintenance fee" are
-- skipped, so running it twice changes nothing the second time.
-- ============================================================

-- Before (expect up to 4 rows containing "maintenance fee"):
-- SELECT name, description
-- FROM services
-- WHERE name LIKE 'Plan: Elite — %'
-- ORDER BY name;

UPDATE services
SET description = REPLACE(
  REPLACE(description, 'Monthly maintenance fee', 'Monthly platform fee'),
  'month maintenance fee', 'month platform fee'
)
WHERE name IN (
  'Plan: Elite — Essentials',
  'Plan: Elite — Signature',
  'Plan: Elite — Lujo',
  'Plan: Elite — Below Portfolio Minimum'
)
AND (
  description LIKE '%Monthly maintenance fee%'
  OR description LIKE '%month maintenance fee%'
);

-- After (expect 0 rows):
-- SELECT name, description
-- FROM services
-- WHERE name LIKE 'Plan: Elite — %'
--   AND description ILIKE '%maintenance fee%';
