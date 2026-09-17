-- ============================================================
-- Migration v57 — Add the "Plan: Elite — Below Portfolio Minimum"
--                 service row (Below Portfolio Minimum fallback tier)
-- ============================================================
-- Steve — BELOW_PORTFOLIO_MINIMUM_FALLBACK_FIX.md: an Investor property
-- with rent below the Essentials minimum ($2,500) used to get
-- elite_tier = NULL — no portfolio, no service, no Acquire button.
-- It now gets a dedicated "below_minimum" fallback classification
-- (src/lib/constants.ts ELITE_SUB_TIERS.below_minimum, dbServiceName
-- 'Plan: Elite — Below Portfolio Minimum'), which this migration seeds
-- as a real services row.
--
-- Why a services row still exists even though its `price` is never
-- actually charged (BELOW_PORTFOLIO_MINIMUM_FULL_CHARGE_FIX.md):
--   1. The one-time fee is 30% of THAT SPECIFIC property's own rent —
--      not a fixed dollar amount shared by every property in the tier
--      the way Essentials/Signature/Lujo's $900/$1,410/$1,650 are — so
--      no single `price` value here could ever be correct for every
--      property.
--   2. A `services` row is still required for two structural reasons
--      unrelated to pricing: (a) the checkout API's "service" flow
--      requires a `serviceId`, which the client resolves from this
--      row, and (b) the checkout route uses this row's `name` to
--      verify server-side that the property is actually assigned this
--      tier (`ELITE_SUB_TIERS[property.elite_tier].dbServiceName ===
--      service.name`) before allowing the recurring maintenance-fee
--      subscription to start — the same security-relevant check used
--      for Essentials/Signature/Lujo.
--   3. `price` is therefore priced at 0 here, matching the existing
--      precedent for "Plan: Owner Preferred — Support/Premier Tier"
--      (migration_v28_plan_service_prices.sql: "$0 by design" because
--      their pricing is also not a flat per-purchase amount). The
--      actual one-time amount is computed at checkout time in
--      src/app/api/stripe/checkout/route.ts from the property's own
--      `monthly_rent × 30%`, passed to Stripe via inline `price_data`
--      on the Checkout Session line item (the same dynamic-pricing
--      mechanism this route already uses for every "service" checkout
--      — it never relied on a pre-created Stripe Price object). The
--      $200/month recurring maintenance fee is unaffected — it's
--      already created dynamically by the existing webhook logic from
--      ELITE_SUB_TIERS.below_minimum.monthlyFee via `stripe.prices.create`
--      + `stripe.subscriptions.create` (see ELITE_RECURRING_BILLING_FIX.md).
--
-- Independent of Support/Premier Tier's 28%/30% Property-Owner-side
-- percentage rules — this is purely Elite-side and always flat 30%,
-- regardless of how many properties the investor has in other tiers.
-- ============================================================

INSERT INTO services
  (name, description, category, price, currency, is_active, target_roles, status)
SELECT * FROM (VALUES
  ('Plan: Elite — Below Portfolio Minimum',
   'Investor portfolio fallback for properties renting below the Essentials minimum ($2,500 CAD). One-time fee is 30% of this specific property''s monthly rent, calculated automatically and charged in full via Stripe at checkout (no manual balance or deposit) — price shown here is $0 by design since the real amount is computed per property, not a fixed catalog price. Plus $200 CAD/month maintenance fee (separate recurring subscription). Same Essentials-level service included.',
   'plan', 0::numeric, 'CAD', true,
   ARRAY['inversionista']::text[], 'active')
) AS v(name, description, category, price, currency, is_active, target_roles, status)
WHERE NOT EXISTS (
  SELECT 1 FROM services s WHERE s.name = v.name
);

-- Verification:
-- SELECT name, price, currency, target_roles
-- FROM services
-- WHERE name = 'Plan: Elite — Below Portfolio Minimum';
