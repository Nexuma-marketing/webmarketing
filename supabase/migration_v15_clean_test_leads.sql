-- ============================================================
-- Migration v15 — Clean up the 7 NULL-role test leads
-- ============================================================
-- The 5/4 diagnostic showed 7 leads with role=NULL out of 43.
-- Inspection of those rows showed they are ALL test data, not
-- real customer submissions:
--
--   VERIFICATION_TEST_1776701429   verify@test.com         (auto)
--   TEST_DEPLOYMENT_VERIFICATION   test@example.com        (auto)
--   Alex prueba con Jac            jalexss2025@gmail.com   (manual)
--   Test contact                   alexsanabria33@…        (manual)
--   Alex                           alexsanabria33@…        (manual)
--   Jaime  ×2                      alexsanabria33@…        (manual)
--
-- The two ALL-CAPS rows are produced by the CI / Vercel deployment
-- smoke-test that hits /api/contact and verifies a row gets
-- inserted. They have no business meaning — DELETE them.
--
-- The five lowercase manual tests are owner/admin probing the
-- public contact button. Setting role='pymes' is the safest default:
-- the public contact form lives on the empresas marketing landing
-- and the visitor was treated as a business lead until profiled.
-- ============================================================

-- 1. Delete deployment-verification leads (clear automated tests)
DELETE FROM leads
WHERE role IS NULL
  AND (
    full_name LIKE 'VERIFICATION\_TEST\_%' ESCAPE '\'
    OR full_name = 'TEST_DEPLOYMENT_VERIFICATION'
    OR email IN ('verify@test.com', 'test@example.com')
  );

-- 2. Set the remaining NULL-role contact_form leads to 'pymes'.
--    They came in before the role select existed; the contact form
--    funnels into the pymes / empresas pipeline by default.
UPDATE leads
SET role = 'pymes'
WHERE role IS NULL
  AND source = 'contact_form';

-- 3. Final safety net — any lead still NULL gets the role inferred
--    from its source, otherwise stays NULL (none expected).
UPDATE leads
SET role = CASE source
  WHEN 'pymes_schedule_rescue' THEN 'pymes'
  WHEN 'pymes_diagnosis'       THEN 'pymes'
  WHEN 'pymes_captacion'       THEN 'pymes'
  WHEN 'tenant_apply'          THEN 'inquilino'
  WHEN 'owner_form'            THEN 'propietario'
  ELSE NULL
END
WHERE role IS NULL;

-- Verification
SELECT 'After v15 cleanup' AS check_name,
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE role IS NULL) AS still_null,
       string_agg(DISTINCT role, ', ') AS roles_present
FROM leads;
