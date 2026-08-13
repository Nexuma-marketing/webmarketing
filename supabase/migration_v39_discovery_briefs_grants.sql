-- ============================================================
-- WebMarketing v39 — discovery_briefs authenticated grants fix
--
-- Observed error: "permission denied for table discovery_briefs"
-- (PostgreSQL error code 42501).
--
-- The authenticated role was missing the base table-level SELECT, INSERT,
-- and UPDATE privileges. These privileges are a separate authorization layer
-- from row-level security (RLS), so PostgreSQL rejected requests before the
-- existing discovery_briefs RLS policies could be evaluated.
--
-- This migration adds only the missing table-level privileges required by
-- the existing authenticated-user SELECT, INSERT, and UPDATE RLS policies.
-- ============================================================

GRANT SELECT, INSERT, UPDATE
  ON TABLE public.discovery_briefs
  TO authenticated;
