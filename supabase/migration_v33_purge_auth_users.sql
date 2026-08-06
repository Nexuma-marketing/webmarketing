-- ============================================================
-- Migration v33 — purge orphaned auth.users for the 20 test accounts
-- ============================================================
-- ⚠️  DESTRUCTIVE — must be run as the postgres / service_role user
-- in the Supabase SQL Editor.
--
-- Context: v32 deleted the 20 test rows from `profiles`, which
-- triggered CASCADE on properties / leads / payments / etc. But the
-- corresponding rows in `auth.users` were intentionally left because
-- there is no FK from auth.users → profiles, so the cascade does not
-- reach them. The client's May 20 docx then reported:
--
--    "si entro con uno correo de esos, me dice que el perfil aun
--     existe"
--
-- That's the orphaned auth.users blocking re-registration with the
-- same email. v33 removes them so those 20 emails become available
-- for fresh test signups again.
--
-- The list is identical to v32 so it stays auditable.
-- ============================================================

-- ─── Preview what will be affected (uncomment to dry-run first) ──
-- SELECT id, email, created_at, last_sign_in_at
-- FROM auth.users
-- WHERE LOWER(email) IN (
--   'alexsmarke@gmail.com',
--   'jacreingenieria@gmail.com',
--   'jalexss2025@gmail.com',
--   'pdf0jacreingenieria@gmail.com',
--   'permi@gmail.com',
--   'produccionulf@gmail.com',
--   'e2e4test@gmail.com',
--   'owner-test-422b@test.com',
--   'tenant422@test.com',
--   'investor-test-422@test.com',
--   'test@gmail.com',
--   'investor-test@example.com',
--   'tony-test-nonadmin@example.com',
--   'pepe@hotmail.com',
--   'johnsontakashi4522@gmail.com',
--   'johnsontakashi45@gmail.com',
--   'aupwork00@gmail.com',
--   'test@example.com',
--   'verify@test.com',
--   'admin@nexuma.ca'
-- );
-- Expected: between 1 and 20 rows depending on which still exist.

-- ─── Actual deletion ─────────────────────────────────────────
-- auth.users has no FK pointing back to profiles, so we already
-- removed everything that depended on the deleted profile in v32.
-- This statement is the last piece — frees the email address for
-- re-registration.
DELETE FROM auth.users
WHERE LOWER(email) IN (
  'alexsmarke@gmail.com',
  'jacreingenieria@gmail.com',
  'jalexss2025@gmail.com',
  'pdf0jacreingenieria@gmail.com',
  'permi@gmail.com',
  'produccionulf@gmail.com',
  'e2e4test@gmail.com',
  'owner-test-422b@test.com',
  'tenant422@test.com',
  'investor-test-422@test.com',
  'test@gmail.com',
  'investor-test@example.com',
  'tony-test-nonadmin@example.com',
  'pepe@hotmail.com',
  'johnsontakashi4522@gmail.com',
  'johnsontakashi45@gmail.com',
  'aupwork00@gmail.com',
  'test@example.com',
  'verify@test.com',
  'admin@nexuma.ca'
);

-- ─── Verification ─────────────────────────────────────────────
-- After running, none of the 20 emails should exist anywhere:
--
-- SELECT email FROM auth.users
-- WHERE LOWER(email) IN (
--   'alexsmarke@gmail.com', 'jacreingenieria@gmail.com',
--   'jalexss2025@gmail.com', 'pdf0jacreingenieria@gmail.com',
--   'permi@gmail.com', 'produccionulf@gmail.com',
--   'e2e4test@gmail.com', 'owner-test-422b@test.com',
--   'tenant422@test.com', 'investor-test-422@test.com',
--   'test@gmail.com', 'investor-test@example.com',
--   'tony-test-nonadmin@example.com', 'pepe@hotmail.com',
--   'johnsontakashi4522@gmail.com', 'johnsontakashi45@gmail.com',
--   'aupwork00@gmail.com', 'test@example.com',
--   'verify@test.com', 'admin@nexuma.ca'
-- );
-- Expected: 0 rows.
--
-- And the surviving admin should still work:
-- SELECT email, last_sign_in_at FROM auth.users
-- WHERE email = 'alexsanabria33@hotmail.com';
-- Expected: 1 row, last_sign_in_at within current session.
