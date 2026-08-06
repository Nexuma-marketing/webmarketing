-- ============================================================
-- Migration v27 - seed the 3 owner-form consents that were missing
--                 from legal_documents
-- ============================================================
-- Steve 5/8 docx: "Pendiente: 1. Los consentimientos legales en
-- propietarios, los ajustes no se reflejan, y hay 3 consentimientos
-- que se piden en el formulario de propietarios que no están en el
-- panel administrador (1. Legal representation, 2. limitation of
-- liability y 3. electronic signatures)".
--
-- Root cause: v17 seeded image_usage / data_processing / marketing /
-- third_party for the owner block but not the additional 3 consents
-- introduced for Steve 4/21 #16. The propietario form uses
-- useLegalDocsOverlay() to pull text from legal_documents, but with
-- no rows present the hook returned nothing, so admin edits could not
-- exist (rows weren't editable) and the form fell back to the
-- hardcoded LEGAL_DOCS constant.
--
-- v27 inserts the missing rows using the same text the form had
-- hardcoded in src/app/forms/propietario/page.tsx so the public
-- wording does not change. After this runs, /admin/legal lists the
-- three rows and edits to them propagate to the propietario form.
--
-- ON CONFLICT DO NOTHING so re-runs do not overwrite admin edits.
-- ============================================================

INSERT INTO legal_documents (type, content, version) VALUES
  ('consent_legal_representation',
    E'By accepting this consent, you authorize Nexuma marketing ltd to act as your designated representative for all matters related to the marketing, leasing, and tenant placement of the listed property/properties. This representation is limited to the scope of services outlined in your selected plan and does not include legal advice, litigation, or acts requiring power of attorney. You retain full ownership and decision-making authority over the property at all times. This authorization may be revoked at any time with 30 days written notice.',
    '1.0'),

  ('consent_liability_limitation',
    E'You acknowledge and agree that Nexuma marketing ltd provides marketing and matching services and is not a party to any lease agreement between the property owner and the tenant. To the maximum extent permitted by law, Nexuma marketing ltd''s total liability arising from the services shall not exceed the fees paid by you in the twelve (12) months preceding the claim. Nexuma marketing ltd is not liable for: tenant default, property damage caused by tenants, indirect or consequential damages, or outcomes outside of our direct control. This limitation does not exclude liability that cannot be excluded by law.',
    '1.0'),

  ('consent_electronic_signature',
    E'By checking this box and submitting this form, you agree that your electronic check-box action constitutes a valid and binding electronic signature under the Personal Information Protection and Electronic Documents Act (PIPEDA) and British Columbia''s Electronic Transactions Act. You consent to conduct this transaction by electronic means and agree that electronic records and signatures have the same legal effect as handwritten signatures on paper documents. You acknowledge having the ability to access, read, and retain a copy of these consents at any time.',
    '1.0')
ON CONFLICT (type) DO NOTHING;

-- Verification:
-- SELECT type, version, length(content) AS chars
-- FROM legal_documents
-- WHERE type IN (
--   'consent_legal_representation',
--   'consent_liability_limitation',
--   'consent_electronic_signature'
-- )
-- ORDER BY type;
