-- ============================================================
-- Migration v34 — Two May-22 docx fixes bundled into one apply
-- ============================================================
-- ⚠️  Run as postgres / service_role in the Supabase SQL Editor.
--
-- Two separate items from the 2026-05-22 client feedback (Observaciones
-- desarrollo Steve), combined here because both are short:
--
--   (A) #7 — "No puedo comprar ningún plan, el enlace está roto."
--       The Founders Package + Low Price + Owner Preferred plan rows
--       in `services` were seeded with price = 0 (migrations v11/v12).
--       The owner-side CheckoutButton (services/page.tsx) refuses to
--       trigger Stripe for a $0 line item, so the buttons appeared to
--       do nothing. Per MILESTONE4_FINAL_DECISIONS.md the upfront fee
--       is **$200 CAD** for all four ("$200 system fee, balance after
--       tenant signs"). Set them so checkout works.
--
--   (B) #1 — "aun me aparecen los correos solicitados para limpiar"
--       v32 deleted the 20 test profiles. `leads.user_id` has
--       ON DELETE SET NULL, so the matching lead rows did NOT cascade
--       — they're still in /admin/leads with user_id = NULL but the
--       email column still pointing at the 20 test addresses. Client
--       sees 48 stale leads. This DELETE matches by email so the
--       cleanup is auditable against the same email list as v32/v33.
-- ============================================================


-- ─── (A) Upfront fees for the four owner plans ───────────────
-- Per client confirmation 2026-05-20: $200 system fee for Basic +
-- Preferred (Low Price, Founders, Support, Premier). Elite plans
-- (Essentials/Signature/Lujo) already have $900 / $1410 / $1650 and
-- are intentionally left alone.

UPDATE services
SET price = 200
WHERE name IN (
  'Plan: Low Price',
  'Plan: Founder Package — Visionary Owners',
  'Plan: Owner Preferred — Support Tier',
  'Plan: Owner Preferred — Premier Tier'
);

-- Verify (uncomment to inspect):
-- SELECT name, price, currency, is_active
-- FROM services
-- WHERE category = 'plan'
-- ORDER BY name;


-- ─── (B) Delete leads tied to the 20 purged test emails ──────
-- Match by lowercase email so case differences in old test data
-- ("Permi@gmail.com" vs "permi@gmail.com") all get caught.

DELETE FROM leads
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

-- Verify (uncomment to inspect):
-- SELECT COUNT(*) AS remaining_leads FROM leads;
-- SELECT email, full_name, role, created_at
-- FROM leads
-- ORDER BY created_at DESC
-- LIMIT 20;
-- Expected: a much smaller count (likely a handful of real leads from
-- the Test E2E account or anonymous form fills made after v32 ran).
