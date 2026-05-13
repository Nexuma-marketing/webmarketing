-- ============================================================
-- DIAGNOSTIC - why are admin edits not reflected on the public site?
-- ============================================================
-- Steve 5/11 docx: "when I modify things from the admin panel, the
-- changes aren't being reflected on the website". The May 11 query A
-- snapshot showed every non-v27 legal_documents row last touched on
-- May 7-9 — i.e. zero successful UPDATEs on May 11 from the admin
-- account. The most likely root cause is an RLS denial that the
-- Supabase JS client returns as "no error + 0 rows affected", which
-- the admin UI was previously treating as success.
--
-- Run every section below in the Supabase SQL Editor while logged in
-- as the *admin user account that is testing the panel* (so auth.uid()
-- resolves to their profile). Compare each result against EXPECTED.
-- ============================================================

-- ─── 1. Who am I right now? ───────────────────────────────
-- Note: in the Supabase SQL editor this runs as the postgres role
-- (auth.uid() is NULL). To run as a real user, use the "Run as
-- authenticated user" / "Impersonate" feature in the editor, OR run
-- the same queries from the /admin/legal page DevTools console.
SELECT
  auth.uid()                                            AS my_uid,
  (SELECT email FROM auth.users WHERE id = auth.uid())  AS my_email,
  (SELECT role  FROM profiles    WHERE id = auth.uid()) AS my_role;
-- EXPECTED for the admin user: my_role = 'admin'.
-- If my_role IS NULL or anything else, this account cannot edit any
-- admin-gated table. Fix with section 6 below.

-- ─── 2. All admin accounts in the DB ──────────────────────
SELECT p.id, u.email, p.full_name, p.role, p.created_at
FROM profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.role = 'admin'
ORDER BY p.created_at;
-- EXPECTED: at least one row for the client's admin email. If empty,
-- nobody on this project has admin write access right now.

-- ─── 3. RLS policies that gate admin writes ───────────────
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE tablename IN (
  'legal_documents', 'site_content', 'form_questions',
  'forms_dynamic', 'services', 'app_config', 'promotions'
)
ORDER BY tablename, policyname;
-- EXPECTED: each table has BOTH a "public read" policy AND an
-- "admin manage" / "admins can write" policy that checks
-- profiles.role = 'admin'.

-- ─── 4. Last update timestamps - did anything change today? ──
SELECT 'legal_documents' AS tbl, type AS row_key,
       updated_at, age(now(), updated_at) AS age
FROM legal_documents ORDER BY updated_at DESC LIMIT 5;

SELECT 'site_content' AS tbl, section || '/' || key AS row_key,
       updated_at, age(now(), updated_at) AS age
FROM site_content ORDER BY updated_at DESC LIMIT 5;

SELECT 'form_questions' AS tbl, field_key AS row_key,
       updated_at, age(now(), updated_at) AS age
FROM form_questions ORDER BY updated_at DESC LIMIT 5;

SELECT 'app_config' AS tbl, category || '/' || key AS row_key,
       updated_at, age(now(), updated_at) AS age
FROM app_config ORDER BY updated_at DESC LIMIT 5;
-- EXPECTED if admin edits really worked today: the top rows for the
-- table the admin edited should have an `age` measured in minutes/
-- hours, not days. If every age >= "2 days" while the client says
-- they edited today, the save silently failed.

-- ─── 5. End-to-end RLS test as the admin user ─────────────
-- Run this WHILE IMPERSONATING the admin user (use the editor's
-- impersonate feature) so RLS is evaluated with their auth.uid().
DO $$
DECLARE
  before_ts  timestamptz;
  after_ts   timestamptz;
  before_txt text;
  after_txt  text;
BEGIN
  SELECT updated_at, content INTO before_ts, before_txt
  FROM legal_documents WHERE type = 'consent_image_usage';

  UPDATE legal_documents
  SET content = content,  -- no-op write, just bump updated_at
      updated_at = now()
  WHERE type = 'consent_image_usage';

  SELECT updated_at, content INTO after_ts, after_txt
  FROM legal_documents WHERE type = 'consent_image_usage';

  RAISE NOTICE 'before %  /  after %  /  changed: %', before_ts, after_ts, (after_ts <> before_ts);
END $$;
-- EXPECTED with admin role: NOTICE shows changed: t (true).
-- If changed: f, RLS is blocking the UPDATE for this account.

-- ─── 6. Promote a user to admin (run as postgres / service role) ──
-- If section 1 returned a non-admin role for the client account, run
-- this with the user's email substituted in. Requires the service
-- role / SQL editor (postgres) — admin accounts cannot grant admin.
-- UPDATE profiles
-- SET role = 'admin'
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'PUT_CLIENT_EMAIL_HERE');
