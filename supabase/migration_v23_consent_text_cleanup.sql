-- ============================================================
-- Migration v23 - clean up consent text rows after Test 5
-- ============================================================
-- Steve 5/7: two cleanup tasks left after the live admin/legal
-- wiring test (Test 5 of the 6 May DOCX checklist).
--
-- 1. The Test 5 admin edit prepended "[TEST 5/7 STEVE] CHANGED FROM
--    ADMIN PANEL." to the consent_marketing row to prove that admin
--    edits propagate to the public form. Test passed; revert the row
--    to the original v17 wording so production users do not see the
--    test marker.
--
-- 2. The inquilino form requests legal_documents.consent_communications
--    for the CASL "Read full document" expansion, but v17 never seeded
--    that row (it only seeded consent_marketing for the propietario's
--    optional marketing CASL). Add the row using the same text that was
--    hardcoded in src/app/forms/inquilino/page.tsx LEGAL_DOCS so the
--    overlay hook now resolves it from the DB and admin/legal becomes
--    the single source of truth.
--
-- Idempotent: each statement writes the same value every run.
-- ============================================================

-- 1. Restore consent_marketing to the v17 original wording.
UPDATE legal_documents
SET content = E'I consent to receive electronic communications (CASL).\n\nUnder the Canadian Anti-Spam Legislation, we ask for your express consent before sending you marketing emails or SMS messages about new services, promotions, market reports or events.\n\nYou can withdraw consent at any time using the Unsubscribe link in any of our emails or by replying STOP to any SMS.',
    updated_at = now()
WHERE type = 'consent_marketing';

-- 2. Seed consent_communications (CASL — inquilino electronic
--    communications) using the same text inquilino's LEGAL_DOCS holds.
INSERT INTO legal_documents (type, content, version) VALUES
  ('consent_communications',
    E'In compliance with Canada''s Anti-Spam Legislation (CASL), you consent to receive commercial electronic messages from Nexuma marketing ltd including service updates, property match notifications, and relevant information about your tenancy search. You may unsubscribe at any time.',
    '1.0')
ON CONFLICT (type) DO NOTHING;

-- Verification:
-- SELECT type, version, length(content) AS chars, left(content, 80) AS preview
-- FROM legal_documents
-- WHERE type IN ('consent_marketing','consent_communications')
-- ORDER BY type;
