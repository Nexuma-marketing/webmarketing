-- ============================================================
-- Migration v59 — "Other Available Services" catalog cleanup
-- ============================================================
-- Steve — SERVICES_CATALOG_DESCRIPTIONS_FIX.md. Data-only changes to the
-- shared `services` table (name/description/status/is_active); no price,
-- fee percentage, or business logic touched. All UPDATEs are idempotent
-- (safe to re-run).
--
-- 1) Eligibility text added to plan descriptions that stated a rent
--    range / property count without saying who actually qualifies.
-- 2) "Lujo" → "Luxury" in the customer-facing description text (the
--    `name`/`elite_tier` internal values are intentionally left alone —
--    same label-only approach as PAYBACK_CALC_AND_LUJO_TRANSLATION_FIX.md,
--    which covered code-level labels but never this DB description
--    column).
-- 3) Duplicate legacy "Plan: Owner Preferred" row (seeded in
--    migration_v11_steve_4_29_fixes.sql, superseded by the Support Tier /
--    Premier Tier split added one migration later in
--    migration_v12_steve_4_30_fixes.sql, but never removed) deactivated.
--    It has no `dbServiceName` lookup anywhere in the app — grepped
--    src/ for the exact string, zero matches — so it's safe to retire.
--    This is also the root cause of the broken "% of first month's rent
--    (one-time)" placeholder price: formatServicePrice() in
--    services/page.tsx only special-cases names containing "support" or
--    "premier"; this row's bare name matches neither and falls through
--    to that generic placeholder.
-- 4) "Premium Tenant Concierge" deactivated — confirmed too difficult to
--    reliably deliver. Deactivating (not deleting) so it's consistently
--    gone from every view built on `services.is_active = true`: the
--    shared "Other Available Services" catalog (Property Owner/
--    Investor/PYME) AND a Premium Tenant's own "Recommended for You"
--    (both source from the same is_active-filtered query), rather than
--    just one of the two.
--
-- NOT touched: "Plan: Elite — Below Portfolio Minimum" stays fully
-- is_active — it's excluded from the browsable catalog by a code-level
-- name check instead (services/page.tsx), because this row must remain
-- active for the Investor's own real portfolio breakdown lookups and
-- the checkout security check to keep working. See
-- SERVICES_CATALOG_DESCRIPTIONS_FIX.md for why a DB-level deactivation
-- was not usable here.
-- ============================================================

-- ─── 1) Elite eligibility + Lujo→Luxury ───────────────────────
UPDATE services
SET description =
  'Elite Assets & Legacy — Asset Management, Essentials. For Investors with 4+ properties, applied to properties with monthly rent from $2,500 to $3,999 CAD. One-time fee: $900 per property. Monthly maintenance fee: $200 per property.'
WHERE name = 'Plan: Elite — Essentials';

UPDATE services
SET description =
  'Elite Assets & Legacy — Asset Management, Signature. For Investors with 4+ properties, applied to properties with monthly rent from $4,000 to $7,000 CAD. One-time fee: $1,410 per property. Monthly maintenance fee: $200 per property.'
WHERE name = 'Plan: Elite — Signature';

UPDATE services
SET description =
  'Elite Assets & Legacy — Asset Management, Luxury. For Investors with 4+ properties, applied to properties with monthly rent of $7,001 CAD or more. One-time fee: $1,650 per property. Monthly maintenance fee: $300 per property.'
WHERE name = 'Plan: Elite — Lujo';

-- ─── 2) Owner Preferred — Premier Tier: add "2-3 properties" ──
UPDATE services
SET description =
  'Owner Preferred — Premier Tier for Preferred Owners with 2–3 properties, committing to contracts longer than one year. Property 1: total service fee of 30% of the first month''s rent. Properties 2 and 3: total service fee of 28% of the first month''s rent per property. Premier installment benefit: 50% of the applicable total service fee is paid at the beginning, 30% three months later, and the remaining 20% three months after the second payment.'
WHERE name = 'Plan: Owner Preferred — Premier Tier';

-- Owner Preferred — Support Tier already correctly states "for 2–3
-- properties" (set in migration_v31_milestone4_final_decisions.sql) —
-- confirmed correct, intentionally left unchanged.

-- ─── 3) Low Price: add "exactly 1 property" eligibility ───────
UPDATE services
SET description =
  'Owner Basic — Low Price, for Basic tier owners with exactly 1 property. Total service fee: 35% of the first month''s rent. A $200 upfront deposit is required and is credited toward the total service fee; it is not an additional charge. The remaining balance is due after the tenant signs the lease. One-time service fee.'
WHERE name = 'Plan: Low Price';

-- ─── 4) Deactivate the duplicate legacy "Owner Preferred" row ─
UPDATE services
SET is_active = false, status = 'paused'
WHERE name = 'Plan: Owner Preferred';

-- ─── 5) Deactivate "Premium Tenant Concierge" ─────────────────
UPDATE services
SET is_active = false, status = 'paused'
WHERE name = 'Premium Tenant Concierge';

-- Verification (uncomment to inspect):
-- SELECT name, is_active, status, description
-- FROM services
-- WHERE name IN (
--   'Plan: Elite — Essentials', 'Plan: Elite — Signature', 'Plan: Elite — Lujo',
--   'Plan: Owner Preferred — Support Tier', 'Plan: Owner Preferred — Premier Tier',
--   'Plan: Low Price', 'Plan: Owner Preferred', 'Premium Tenant Concierge'
-- )
-- ORDER BY name;
