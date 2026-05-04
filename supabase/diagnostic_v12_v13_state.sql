-- ============================================================
-- Diagnostic — Run in Supabase SQL Editor.
-- Returns ONE result table (15 rows) so every check is visible.
-- Read-only, safe to re-run.
-- ============================================================
-- Each row has:
--   check    : human-readable name of what we're verifying
--   status   : ✓ OK / ❌ MISSING / ⚠️ PARTIAL / ℹ️ INFO
--   details  : counts, lists, or sample text
-- ============================================================

WITH
-- 1. Founders counter (need 2 rows: taken + limit)
q1 AS (
  SELECT 1 AS sort,
         '01. app_config founders_plan' AS check,
         CASE WHEN COUNT(*) >= 2 THEN '✓ OK' ELSE '❌ MISSING' END AS status,
         COALESCE(string_agg(key || '=' || value, ', '), '(no rows)') AS details
  FROM app_config WHERE category = 'founders_plan'
),
-- 2. plan_features:* (need 6 rows)
q2 AS (
  SELECT 2, '02. app_config plan_features (need >=6)',
         CASE WHEN COUNT(*) >= 6 THEN '✓ OK'
              WHEN COUNT(*) > 0 THEN '⚠️ PARTIAL'
              ELSE '❌ MISSING' END,
         COUNT(*)::text || ' rows; categories: ' ||
           COALESCE(string_agg(DISTINCT category, ', '), '(none)')
  FROM app_config WHERE category LIKE 'plan_features:%'
),
-- 3. plan_timing:* (need 3 rows)
q3 AS (
  SELECT 3, '03. app_config plan_timing (need 3)',
         CASE WHEN COUNT(*) >= 3 THEN '✓ OK'
              WHEN COUNT(*) > 0 THEN '⚠️ PARTIAL'
              ELSE '❌ MISSING' END,
         COUNT(*)::text || ' rows: ' ||
           COALESCE(string_agg(category || '=' || value, ' | '), '(none)')
  FROM app_config WHERE category LIKE 'plan_timing:%'
),
-- 4. RLS policy "Public read app_config"
q4 AS (
  SELECT 4, '04. app_config RLS public-read policy',
         CASE WHEN bool_or(policyname = 'Public read app_config'
                       OR policyname = 'Authenticated can read public app_config')
              THEN '✓ OK' ELSE '❌ MISSING' END,
         COALESCE(string_agg(policyname, ', '), '(no policies)')
  FROM pg_policies WHERE tablename = 'app_config'
),
-- 5. plan-level services (need 9)
q5 AS (
  SELECT 5, '05. plan-level services rows (need 9)',
         CASE WHEN COUNT(*) >= 9 THEN '✓ OK'
              WHEN COUNT(*) > 0 THEN '⚠️ PARTIAL'
              ELSE '❌ MISSING' END,
         COUNT(*)::text || ' rows; names: ' ||
           COALESCE(string_agg(name, ' | '), '(none)')
  FROM services WHERE category = 'plan'
),
-- 6. forms_dynamic (must include lead_sales_calculator + business_acquisition)
q6 AS (
  SELECT 6, '06. forms_dynamic includes empresas forms',
         CASE WHEN bool_or(slug = 'lead_sales_calculator')
                  AND bool_or(slug = 'business_acquisition') THEN '✓ OK'
              WHEN bool_or(slug = 'lead_sales_calculator')
                  OR bool_or(slug = 'business_acquisition') THEN '⚠️ PARTIAL'
              ELSE '❌ MISSING' END,
         'slugs: ' || COALESCE(string_agg(slug, ', ' ORDER BY slug), '(empty)')
  FROM forms_dynamic
),
-- 7. pymes_diagnosis questions (need 10 with q1..q7)
q7 AS (
  SELECT 7, '07. pymes_diagnosis questions (need 10)',
         CASE WHEN COUNT(*) = 10 THEN '✓ OK'
              WHEN COUNT(*) > 0 THEN '⚠️ PARTIAL'
              ELSE '❌ MISSING' END,
         COUNT(*)::text || ' questions; fields: ' ||
           COALESCE(string_agg(field_key, ', ' ORDER BY position), '(none)')
  FROM form_questions
  WHERE form_id = (SELECT id FROM forms_dynamic WHERE slug = 'pymes_diagnosis')
),
-- 8. lead_sales_calculator question count
q8 AS (
  SELECT 8, '08. lead_sales_calculator questions',
         CASE WHEN COUNT(*) >= 7 THEN '✓ OK'
              WHEN COUNT(*) > 0 THEN '⚠️ PARTIAL'
              ELSE '❌ MISSING' END,
         COUNT(*)::text || ' questions'
  FROM form_questions
  WHERE form_id = (SELECT id FROM forms_dynamic WHERE slug = 'lead_sales_calculator')
),
-- 9. business_acquisition question count
q9 AS (
  SELECT 9, '09. business_acquisition questions',
         CASE WHEN COUNT(*) >= 5 THEN '✓ OK'
              WHEN COUNT(*) > 0 THEN '⚠️ PARTIAL'
              ELSE '❌ MISSING' END,
         COUNT(*)::text || ' questions'
  FROM form_questions
  WHERE form_id = (SELECT id FROM forms_dynamic WHERE slug = 'business_acquisition')
),
-- 10. Legal docs status (privacy_policy)
q10 AS (
  SELECT 10, '10. legal_documents privacy_policy',
         CASE WHEN content IS NULL THEN '❌ MISSING'
              WHEN content ILIKE '%goes here%' THEN '❌ STILL PLACEHOLDER'
              WHEN length(content) < 200 THEN '⚠️ TOO SHORT'
              ELSE '✓ OK' END,
         'length=' || length(COALESCE(content,'')) || '; preview: ' || left(content, 60)
  FROM legal_documents WHERE type = 'privacy_policy'
  UNION ALL
  SELECT 10, '10. legal_documents privacy_policy', '❌ MISSING', '(no row)'
  WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE type = 'privacy_policy')
),
-- 11. Legal docs status (terms_of_service)
q11 AS (
  SELECT 11, '11. legal_documents terms_of_service',
         CASE WHEN content IS NULL THEN '❌ MISSING'
              WHEN content ILIKE '%goes here%' THEN '❌ STILL PLACEHOLDER'
              WHEN length(content) < 200 THEN '⚠️ TOO SHORT'
              ELSE '✓ OK' END,
         'length=' || length(COALESCE(content,'')) || '; preview: ' || left(content, 60)
  FROM legal_documents WHERE type = 'terms_of_service'
  UNION ALL
  SELECT 11, '11. legal_documents terms_of_service', '❌ MISSING', '(no row)'
  WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE type = 'terms_of_service')
),
-- 12. consent_logs RLS admin policy
q12 AS (
  SELECT 12, '12. consent_logs admin SELECT policy',
         CASE WHEN bool_or(policyname = 'Admins can view all consent_logs')
              THEN '✓ OK' ELSE '❌ MISSING' END,
         COALESCE(string_agg(policyname, ', '), '(no policies)')
  FROM pg_policies WHERE tablename = 'consent_logs'
),
-- 13. site_content branding rows
q13 AS (
  SELECT 13, '13. site_content branding (logo+cover+name)',
         CASE WHEN bool_or(key = 'site_brand_name')
                  AND bool_or(key = 'site_cover_image_url') THEN '✓ OK'
              WHEN COUNT(*) > 0 THEN '⚠️ PARTIAL'
              ELSE '❌ MISSING' END,
         COUNT(*)::text || ' keys: ' ||
           COALESCE(string_agg(key, ', '), '(none)')
  FROM site_content WHERE section = 'branding'
),
-- 14. leads.role NULL count
q14 AS (
  SELECT 14, '14. leads.role NULL count (want 0)',
         CASE WHEN COUNT(*) FILTER (WHERE role IS NULL) = 0 THEN '✓ OK'
              ELSE '⚠️ ' || COUNT(*) FILTER (WHERE role IS NULL)::text || ' rows still NULL'
         END,
         'total leads=' || COUNT(*)::text ||
           ', NULL=' || COUNT(*) FILTER (WHERE role IS NULL)::text
  FROM leads
),
-- 15. property_images count and distinct rooms
q15 AS (
  SELECT 15, '15. property_images',
         CASE WHEN COUNT(*) > 0 THEN 'ℹ️ INFO' ELSE '❌ EMPTY' END,
         COUNT(*)::text || ' images; rooms: ' ||
           COALESCE(string_agg(DISTINCT room_category, ', ' ORDER BY room_category), '(none)')
  FROM property_images
)
SELECT check, status, details
FROM (
  SELECT * FROM q1 UNION ALL
  SELECT * FROM q2 UNION ALL
  SELECT * FROM q3 UNION ALL
  SELECT * FROM q4 UNION ALL
  SELECT * FROM q5 UNION ALL
  SELECT * FROM q6 UNION ALL
  SELECT * FROM q7 UNION ALL
  SELECT * FROM q8 UNION ALL
  SELECT * FROM q9 UNION ALL
  SELECT * FROM q10 UNION ALL
  SELECT * FROM q11 UNION ALL
  SELECT * FROM q12 UNION ALL
  SELECT * FROM q13 UNION ALL
  SELECT * FROM q14 UNION ALL
  SELECT * FROM q15
) all_checks
ORDER BY sort;
