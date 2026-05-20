-- ============================================================
-- Migration v32 — Purge test accounts before production launch
-- ============================================================
-- ⚠️  DESTRUCTIVE — does not run on its own. Review carefully then
-- execute manually in Supabase SQL Editor.
--
-- Source: feedback/MILESTONE4_FINAL_DECISIONS.md, client confirmation
-- 2026-05-20. Twenty test/dev accounts identified for removal.
--
-- Effect: deletes profiles rows + ON DELETE CASCADE propagates to:
--   - properties (and their property_images via FK)
--   - leads (.user_id FK)
--   - consent_logs
--   - payments
--   - tenant_preferences
--   - discovery_briefs
--   - service_recommendations
--   - any other table with user_id FK CASCADE
--
-- The matching rows in auth.users are NOT auto-deleted because
-- there's no FK from auth.users to profiles. Use the Supabase
-- Dashboard "Authentication → Users" to delete them after this
-- migration completes — OR uncomment the auth.users DELETE at the
-- bottom of this file (requires service_role / postgres).
--
-- KEPT (production accounts): alexsanabria33@hotmail.com is the
-- client's admin and is intentionally NOT in this list. Any real
-- customer signups since launch are also intentionally NOT in this
-- list — verify the visible list matches Alex's intent before
-- running.
-- ============================================================

-- ─── Show what will be affected (run this FIRST to preview) ──
-- Uncomment the SELECTs below to see what the DELETEs will hit.
--
-- SELECT id, email, full_name, role, created_at
-- FROM profiles
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
--
-- Expected: 20 rows (or fewer if some never existed).
-- If a row you DID NOT expect appears, STOP and reconcile first.

-- ─── Actual deletion ─────────────────────────────────────────
DELETE FROM profiles
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

-- ─── Optional: remove from auth.users too ────────────────────
-- Profiles table is the place to look from now on. The auth.users
-- rows remain orphaned after the DELETE above (no profile row).
-- Uncomment the block below if you also want to remove the auth
-- identities so the same emails can re-register cleanly.
--
-- WARNING: requires service_role. RLS does not protect auth.users
-- from postgres role, but this should still be reviewed.
--
-- DELETE FROM auth.users
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

-- ─── Post-cleanup verification ───────────────────────────────
-- After running, confirm only the client admin remains:
--
-- SELECT email, role FROM profiles WHERE role = 'admin';
-- Expected: 1 row — alexsanabria33@hotmail.com
--
-- SELECT COUNT(*) AS total_profiles FROM profiles;
-- Expected: small — only real customers + the admin
