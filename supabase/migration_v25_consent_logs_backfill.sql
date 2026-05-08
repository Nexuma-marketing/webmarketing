-- ============================================================
-- Migration v25 - backfill consent_logs for every existing user
-- ============================================================
-- Steve 5/7: 7 May DOCX item [158-160].
--
-- "Solo pusiste el ejemplo que te di ayer de mi usuario como
--  propietario pero falta que traiga todos (inquilinos, inversionistas,
--  propietarios) todos han dado consentimientos y debería aparecer
--  aca."
--
-- The customer expected /admin/legal Logs to show every user that ever
-- registered. Reality: logConsents() was only ever called from the
-- inquilino / propietario form submissions and the /dashboard/profile
-- toggles. /register did not log anything, so historical sign-ups had
-- ZERO rows in consent_logs.
--
-- This migration:
--   1. Expands the consent_type CHECK constraint to allow
--      'terms_of_service' and 'privacy_policy' (the new types
--      written by the updated /register page).
--   2. Inserts a backfill row per existing profile for both
--      terms_of_service and privacy_policy at the profile's
--      created_at, granted = true, ip_address = NULL (we did not
--      capture IP at signup historically).
--
-- ON CONFLICT DO NOTHING + WHERE NOT EXISTS guards make this safe to
-- re-run; users who already have those rows will not get duplicates.
-- ============================================================

-- 1. Expand the CHECK constraint so the new register-time types pass.
ALTER TABLE consent_logs DROP CONSTRAINT IF EXISTS consent_logs_consent_type_check;

ALTER TABLE consent_logs
  ADD CONSTRAINT consent_logs_consent_type_check
  CHECK (consent_type IN (
    -- Profile toggles
    'data_processing',
    'image_usage',
    'marketing',
    'third_party',
    -- Tenant registration consents
    'screening',
    'references',
    'truthfulness',
    'communications',
    -- Owner registration consents (with consent_ prefix variant)
    'consent_data_processing',
    'consent_image_usage',
    'consent_marketing',
    'consent_third_party',
    'consent_screening',
    'consent_references',
    'consent_truthfulness',
    'consent_communications',
    'consent_legal_representation',
    'consent_liability_limitation',
    'consent_electronic_signature',
    -- Steve 5/7: signup-time consents
    'terms_of_service',
    'privacy_policy'
  ));

-- 2. Backfill: one row per profile per type, anchored to the
--    profile's created_at. Skip profiles that already have a
--    matching row (so re-running never duplicates).
INSERT INTO consent_logs (user_id, consent_type, granted, granted_at, ip_address, user_agent)
SELECT
  p.id,
  'terms_of_service',
  true,
  COALESCE(p.created_at, now()),
  NULL,
  'backfill: signup before consent logging existed'
FROM profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM consent_logs cl
  WHERE cl.user_id = p.id AND cl.consent_type = 'terms_of_service'
);

INSERT INTO consent_logs (user_id, consent_type, granted, granted_at, ip_address, user_agent)
SELECT
  p.id,
  'privacy_policy',
  true,
  COALESCE(p.created_at, now()),
  NULL,
  'backfill: signup before consent logging existed'
FROM profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM consent_logs cl
  WHERE cl.user_id = p.id AND cl.consent_type = 'privacy_policy'
);

-- Verification:
-- SELECT consent_type, COUNT(*) FROM consent_logs GROUP BY consent_type ORDER BY 2 DESC;
