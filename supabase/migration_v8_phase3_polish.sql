-- ============================================================
-- WebMarketing v8 — Milestone 3 polish: founders counter + admin role + lead transitions
-- Run this in Supabase Dashboard → SQL Editor → New query
--
-- Steve 4/27 Phase 3 prep:
-- 1. Seed app_config with founders_plan.taken / .limit so the urgency
--    banner on /dashboard/services is editable from /admin/pricing
-- 2. Promote alexsanabria33@hotmail.com to admin role (per Steve's
--    confirmation in the 4/27 PDF item #7)
-- 3. Server-side trigger that rejects illegal lead status transitions
--    (defense in depth — the dialog dropdown already restricts this on
--    the client, but the trigger guarantees the DB stays consistent
--    even if a malformed request slips through)
-- ============================================================

-- ============================================================
-- 1. FOUNDERS PLAN COUNTER — seed default rows
-- ============================================================
INSERT INTO app_config (category, key, value) VALUES
  ('founders_plan', 'taken', '0'),
  ('founders_plan', 'limit', '20')
ON CONFLICT (category, key) DO NOTHING;

-- ============================================================
-- 2. ADMIN ROLE for Steve's commercial email
-- ============================================================
-- Only fires if the profile already exists (i.e. Steve has signed up
-- with that email). If not, run the same UPDATE later once he registers.
UPDATE profiles
SET role = 'admin'
WHERE email = 'alexsanabria33@hotmail.com'
  AND role <> 'admin';

-- ============================================================
-- 3. LEAD STATUS TRANSITION GUARD
-- ============================================================
-- Allowed transitions (matches LEAD_STATUS_TRANSITIONS in src/lib/constants.ts):
--   nuevo       -> contactado
--   contactado  -> en_proceso, cerrado
--   en_proceso  -> cerrado
--   cerrado     -> (none)
CREATE OR REPLACE FUNCTION enforce_lead_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'nuevo' AND NEW.status = 'contactado' THEN
    RETURN NEW;
  ELSIF OLD.status = 'contactado' AND NEW.status IN ('en_proceso', 'cerrado') THEN
    RETURN NEW;
  ELSIF OLD.status = 'en_proceso' AND NEW.status = 'cerrado' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Illegal lead status transition: % -> %', OLD.status, NEW.status
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS lead_status_transition_guard ON leads;
CREATE TRIGGER lead_status_transition_guard
  BEFORE UPDATE OF status ON leads
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION enforce_lead_status_transition();

-- ============================================================
-- DONE! After running, verify with:
--   SELECT * FROM app_config WHERE category = 'founders_plan';
--   SELECT email, role FROM profiles WHERE email = 'alexsanabria33@hotmail.com';
--   SELECT tgname FROM pg_trigger WHERE tgrelid = 'leads'::regclass;
-- ============================================================
