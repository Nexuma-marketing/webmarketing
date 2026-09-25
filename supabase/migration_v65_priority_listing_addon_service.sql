-- ============================================================
-- Migration v65 — Priority Listing Placement add-on service row
-- ============================================================
-- Run in Supabase SQL Editor (postgres / service_role).
--
-- Context: PROMPT2 payment-flow overhaul, item 7. Low Price's
-- "Optional: +$100 for priority listing placement (1 month)" bullet
-- (OWNER_TIERS.basic.plans[0].details, src/lib/constants.ts) was
-- purely informational text with no way to actually buy it — neither
-- bundled with the $200 upfront nor standalone afterward. This row
-- makes it a real, independently purchasable service so:
--   - it can be added as a second Stripe Checkout line item when the
--     new checkbox on the Low Price card is checked before paying
--     (src/app/api/stripe/checkout/route.ts's addOnServiceId handling)
--   - it can also be bought standalone afterward (Payment History /
--     Recommended Services) via the existing single-line-item
--     CheckoutButton `type="service"` path, unmodified.
--
-- target_roles scoped to Property Owner roles only (the plan this
-- add-on is offered against). is_active idempotent via ON CONFLICT-
-- style guard (no unique constraint on name, so guarded with a
-- NOT EXISTS check instead).
-- ============================================================

INSERT INTO services (name, description, category, price, currency, is_active, target_roles)
SELECT
  'Add-on: Priority Listing Placement (1 month)',
  'Boosts your property listing to a priority position for 1 month. Purchasable bundled with the Low Price plan''s $200 upfront checkout, or standalone at any time from Payment History.',
  'addon',
  100,
  'CAD',
  true,
  ARRAY['propietario', 'propietario_preferido']
WHERE NOT EXISTS (
  SELECT 1 FROM services WHERE name = 'Add-on: Priority Listing Placement (1 month)'
);

-- Verification:
-- SELECT name, category, price, currency, is_active, target_roles
-- FROM services
-- WHERE name = 'Add-on: Priority Listing Placement (1 month)';
