-- ============================================================
-- Migration v18 — Expand consent_logs CHECK constraint
-- ============================================================
-- Steve 5/4 docx #7: "Logs, al seleccionar no me da resultados".
-- Two reasons logs were empty:
--   1. The registration forms (propietario / inquilino) never wrote
--      to consent_logs at all — only /dashboard/profile did.
--   2. The original v2 CHECK constraint allowed only four types
--      (data_processing, image_usage, marketing, third_party); any
--      tenant-specific consent (screening, references, truthfulness)
--      that we now want to log would be rejected by the database.
--
-- v18 widens the CHECK so the registration-form code (added in the
-- companion commit) can persist every consent the user actually
-- ticks. ip_address + user_agent columns already exist on the table
-- (since v2) and now feed the /admin/legal display.
-- ============================================================

ALTER TABLE consent_logs DROP CONSTRAINT IF EXISTS consent_logs_consent_type_check;

ALTER TABLE consent_logs
  ADD CONSTRAINT consent_logs_consent_type_check
  CHECK (consent_type IN (
    -- Original four (kept for backward compatibility with
    -- /dashboard/profile)
    'data_processing',
    'image_usage',
    'marketing',
    'third_party',
    -- Tenant registration consents
    'screening',
    'references',
    'truthfulness',
    'communications',
    -- Optional with-prefix variants used by some form code paths
    'consent_data_processing',
    'consent_image_usage',
    'consent_marketing',
    'consent_third_party',
    'consent_screening',
    'consent_references',
    'consent_truthfulness',
    'consent_communications'
  ));

-- ------------------------------------------------------------
-- Confirm RLS lets admins read everything (re-applied for safety)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can view all consent_logs" ON consent_logs;
CREATE POLICY "Admins can view all consent_logs" ON consent_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );
