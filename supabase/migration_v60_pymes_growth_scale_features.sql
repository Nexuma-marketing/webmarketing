-- ============================================================
-- Migration v60 — Fix PYMES Growth/Scale feature lists
-- ============================================================
-- Steve — PYME_GROWTH_SCALE_FEATURES_FIX.md.
--
-- Confirmed business decision:
--   Growth: ADD "Direct 1-on-1 advisory sessions",
--           REMOVE "Lead tracking system implementation"
--   Scale:  ADD "Direct 1-on-1 advisory sessions",
--           ADD "Marketing strategy development & execution",
--           ADD "Lead tracking system implementation"
-- Rescue is untouched. No price, payment term, or scoring logic touched.
--
-- Why this migration is required in addition to the src/lib/constants.ts
-- PYMES_PLANS edit: migration_v11_steve_4_29_fixes.sql seeded
-- `app_config` rows (category='plan_features:pymes_growth' /
-- 'plan_features:pymes_scale', key='features') with the OLD feature
-- text, and no migration since has touched them. getPymesPlanForUser()
-- (src/lib/pymes-plan-display.ts — the single source Dashboard home and
-- Recommended Services both call) reads this app_config row as an
-- override whenever it exists and prefers it over PYMES_PLANS's
-- features. Since that override row already exists, fixing only
-- PYMES_PLANS would have had **no visible effect** on those two
-- surfaces — the stale app_config value would keep winning. This
-- migration corrects that same override text so all three consumers
-- (PYMES_PLANS default, the app_config override, and the admin editor's
-- pre-fill) agree.
-- ============================================================

UPDATE app_config
SET value = E'Complete business diagnosis & sales leak analysis\nMarketing strategy development & execution\nConversion rate optimization\nCampaign structure & ad management\nMarket positioning analysis\nDirect 1-on-1 advisory sessions\nBi-weekly KPI performance reports'
WHERE category = 'plan_features:pymes_growth' AND key = 'features';

UPDATE app_config
SET value = E'Complete business diagnosis & sales leak analysis\nMarketing strategy development & execution\nAdvanced multi-channel optimization\nChannel expansion & new market entry\nGrowth strategy & scaling roadmap\nLead tracking system implementation\nOpportunity & competitor analysis\nDirect 1-on-1 advisory sessions\nWeekly KPI performance reports'
WHERE category = 'plan_features:pymes_scale' AND key = 'features';

-- Verification (uncomment to inspect):
-- SELECT category, key, value
-- FROM app_config
-- WHERE category IN ('plan_features:pymes_growth', 'plan_features:pymes_scale')
-- ORDER BY category, key;
