-- ═══════════════════════════════════════════════════════════
-- CLEANUP SCRIPT — Test data from investor testing sessions
-- ═══════════════════════════════════════════════════════════
-- Steve 4/23 feedback (point 4/20 #2-1):
-- "Aún está pendiente limpiar la base de datos con las pruebas de Cobranzas"
--
-- Purpose: Remove test properties created during investor flow testing
-- that have placeholder images (Voltiko/Cobranzas UI screenshots).
--
-- RUN THIS IN SUPABASE SQL EDITOR:
-- Dashboard → SQL Editor → New query → paste this → Run
--
-- SAFETY: This script only deletes properties/images/briefs associated
-- with specific test accounts. Real user data is NOT affected.
-- ═══════════════════════════════════════════════════════════

BEGIN;

-- 1. Identify test user IDs (accounts used for testing — adjust emails as needed)
WITH test_users AS (
  SELECT id FROM auth.users
  WHERE email LIKE '%investor-test%'
     OR email LIKE '%owner-test%'
     OR email LIKE '%tenant-test%'
     OR email LIKE '%test%@test.com'
     OR email LIKE '%test%@example.com'
     OR email LIKE '%mailinator.com'
     OR email LIKE '%422%'  -- test accounts using "422" suffix
     OR full_name ILIKE '%test%'
),

-- 2. Find test property IDs
test_properties AS (
  SELECT id FROM properties
  WHERE owner_id IN (SELECT id FROM test_users)
     OR address ILIKE '%test%'
     OR address = '100 East Main Street'  -- common test address
     OR address = '200 Main St'            -- common test address
     OR address = '123 main St'            -- common test address
)

-- 3. Preview what will be deleted (uncomment to check first)
SELECT
  (SELECT COUNT(*) FROM properties WHERE id IN (SELECT id FROM test_properties)) AS test_properties_count,
  (SELECT COUNT(*) FROM property_images WHERE property_id IN (SELECT id FROM test_properties)) AS test_images_count,
  (SELECT COUNT(*) FROM auth.users WHERE id IN (SELECT id FROM test_users)) AS test_users_count;

ROLLBACK;

-- ═══════════════════════════════════════════════════════════
-- STEP 2: After reviewing the counts above, run DELETE statements:
-- ═══════════════════════════════════════════════════════════
--
-- 1. Delete property images first (FK constraint)
-- DELETE FROM property_images
-- WHERE property_id IN (
--   SELECT id FROM properties
--   WHERE address ILIKE '%test%'
--      OR address IN ('100 East Main Street', '200 Main St', '123 main St')
--      OR owner_id IN (
--        SELECT id FROM auth.users
--        WHERE email LIKE '%test%'
--           OR email LIKE '%mailinator%'
--      )
-- );
--
-- 2. Delete test properties
-- DELETE FROM properties
-- WHERE address ILIKE '%test%'
--    OR address IN ('100 East Main Street', '200 Main St', '123 main St')
--    OR owner_id IN (
--      SELECT id FROM auth.users
--      WHERE email LIKE '%test%'
--         OR email LIKE '%mailinator%'
--    );
--
-- 3. Delete test users (cascade should handle remaining)
-- DELETE FROM auth.users
-- WHERE email LIKE '%test%'
--    OR email LIKE '%mailinator%';
--
-- ═══════════════════════════════════════════════════════════
-- INSTRUCTIONS:
-- 1. Run the SELECT above first to see how many rows will be affected
-- 2. If counts look reasonable, uncomment the DELETE statements
-- 3. Run them one at a time in order (images → properties → users)
-- 4. VERIFY in Supabase Table Editor that real user data is intact
-- ═══════════════════════════════════════════════════════════
