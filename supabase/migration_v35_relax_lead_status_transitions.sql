-- ============================================================
-- Migration v35 — Relax lead status transition guard
-- ============================================================
-- ⚠️  Run in Supabase SQL Editor.
--
-- Context: client (Alex) reported 2026-06-04 (Item 4, Screenshot 6
-- of "4 Jun 26 Observaciones desarrollo Steve.docx"):
--   "No están todos los status en lead management ... solo sale en
--    proceso y cerrado"
--
-- Root cause: the strict workflow trigger from v8 only allowed the
-- transitions nuevo→contactado, contactado→en_proceso|cerrado,
-- en_proceso→cerrado. Once a lead was at `en_proceso`, the only
-- option in the UI dropdown was `cerrado`. Sales had no way to
-- revert a closed lead back to contactado, or correct a misclick.
--
-- Fix: drop the transition-guard trigger. The UI now exposes all 4
-- statuses (admin/leads/page.tsx 6/5). Any status can be set
-- manually.
-- ============================================================

DROP TRIGGER IF EXISTS lead_status_transition_guard ON leads;
DROP FUNCTION IF EXISTS enforce_lead_status_transition();

-- Verify (uncomment):
-- SELECT tgname FROM pg_trigger WHERE tgrelid = 'leads'::regclass;
-- Expected: no row named lead_status_transition_guard.
