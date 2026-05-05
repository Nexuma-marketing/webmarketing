-- ============================================================
-- Migration v17 — Add the actual published consent texts to
--                 legal_documents so /admin/legal lists them
-- ============================================================
-- Steve 5/4 docx: "Los consentimientos legales que se dejaron en
-- panel no son, no corresponden a los publicados".
--
-- /admin/legal previously showed only privacy_policy /
-- terms_of_service / cookie_policy, but the actual checkbox-style
-- consents that propietarios / inversionistas / inquilinos /
-- empresas tick on the registration forms (and that drive
-- consent_logs) were hard-coded inside each form file. Admin had no
-- visibility into them and couldn't change the wording.
--
-- v17 inserts one legal_documents row per published consent. The
-- existing /admin/legal Edit dialog will list them automatically
-- because it queries `legal_documents` ORDER BY type. ON CONFLICT
-- DO NOTHING so re-runs don't overwrite admin edits.
-- ============================================================

INSERT INTO legal_documents (type, content, version) VALUES
  -- Property owner / investor consent block (used on
  -- /forms/propietario and /forms/propietario/add-property)
  ('consent_image_usage',
    E'I consent to image usage and editing for marketing purposes.\n\nBy ticking this box, you authorize WebMarketing / Nexuma Marketing to:\n  • Use the photographs you upload for the purpose of advertising your property on our marketing channels (website, social media, listing portals, email campaigns).\n  • Apply standard editing such as cropping, color correction, watermarking and exposure adjustment to improve presentation, without altering the substance of the unit.\n  • Retain the images for as long as the property is actively listed plus 90 days after the listing ends.\n\nYou retain ownership of your images at all times. You can revoke this consent and request deletion at any time by contacting privacy@nexuma.ca.',
    '1.0'),

  ('consent_data_processing',
    E'I consent to data collection and processing (PIPA / PIPEDA).\n\nWe collect the personal information you provide on this form (name, contact details, property details) and process it solely to:\n  • Match your property with qualified tenants.\n  • Coordinate visits, screening and lease signing.\n  • Send you transactional updates about your listing.\n\nYour data is stored on infrastructure located in Canada and is protected with encryption in transit and at rest. We comply with the British Columbia Personal Information Protection Act (PIPA) and the federal Personal Information Protection and Electronic Documents Act (PIPEDA).',
    '1.0'),

  ('consent_marketing',
    E'I consent to receive electronic communications (CASL).\n\nUnder the Canadian Anti-Spam Legislation, we ask for your express consent before sending you marketing emails or SMS messages about new services, promotions, market reports or events.\n\nYou can withdraw consent at any time using the Unsubscribe link in any of our emails or by replying STOP to any SMS.',
    '1.0'),

  ('consent_third_party',
    E'I accept the Terms and Conditions of Service.\n\nThis includes:\n  • The general Terms of Service governing your use of the platform.\n  • The fee structure of the plan you have selected (Founder / Basic / Preferred / Elite).\n  • The dispute-resolution and governing-law clauses (British Columbia, Canada).\n\nIf you have questions about any clause please contact legal@nexuma.ca before submitting the form.',
    '1.0'),

  -- Tenant consent block (used on /forms/inquilino)
  ('consent_screening',
    E'I consent to a background and credit screening (tenant).\n\nYou authorize WebMarketing / Nexuma Marketing and the property owner to perform a tenant screening that may include:\n  • Credit history check (e.g., Equifax / TransUnion soft pull).\n  • Verification of employment or income source you have declared.\n  • Search of public records (BC Online, court records) for prior eviction or judgment history.\n\nResults are shared only with the property owner whose listing you applied to. The screening report is destroyed 6 months after the application is closed.',
    '1.0'),

  ('consent_references',
    E'I consent to reference verification.\n\nYou authorize us to contact the personal and / or professional references you provided in the application to verify the information you have submitted. Reference responses are confidential and used only to assess your suitability as a tenant for the specific property you applied to.',
    '1.0'),

  ('consent_truthfulness',
    E'Declaration of truthfulness.\n\nI confirm that the information I have provided in this application is true, complete and not misleading to the best of my knowledge. I understand that providing false information may result in:\n  • Immediate cancellation of my application.\n  • Termination of any lease that may have been signed on the basis of false information.\n  • Liability for damages caused by the misrepresentation.',
    '1.0')
ON CONFLICT (type) DO NOTHING;
