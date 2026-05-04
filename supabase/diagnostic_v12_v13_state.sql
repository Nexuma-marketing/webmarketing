-- ============================================================
-- Diagnostic — Run this in Supabase SQL Editor.
-- Tells us EXACTLY which v11/v12/v13 changes actually landed.
-- Read-only. Each query prints a count or sample.
-- ============================================================

-- 1. Founders counter rows (need 2: taken + limit)
SELECT 'app_config founders_plan' AS check_name,
       COUNT(*) AS row_count,
       string_agg(key || '=' || value, ', ') AS values
FROM app_config WHERE category = 'founders_plan';

-- 2. plan_features:* — should be 6 rows (3 owner tiers × tagline+features)
SELECT 'app_config plan_features' AS check_name,
       COUNT(*) AS row_count,
       string_agg(DISTINCT category, ', ') AS categories
FROM app_config WHERE category LIKE 'plan_features:%';

-- 3. plan_timing:* — should be 3 rows
SELECT 'app_config plan_timing' AS check_name,
       COUNT(*) AS row_count,
       string_agg(category || '.' || key || '=' || value, ' | ') AS values
FROM app_config WHERE category LIKE 'plan_timing:%';

-- 4. RLS policies on app_config — must include "Public read app_config"
SELECT 'app_config RLS policies' AS check_name,
       string_agg(policyname, ', ') AS policies
FROM pg_policies WHERE tablename = 'app_config';

-- 5. Plan-level services rows — should be 9
SELECT 'plan-level services' AS check_name,
       COUNT(*) AS row_count,
       string_agg(name, ' | ') AS names
FROM services WHERE category = 'plan';

-- 6. Empresas forms — should include lead_sales_calculator + business_acquisition
SELECT 'forms_dynamic' AS check_name,
       string_agg(slug, ', ' ORDER BY slug) AS slugs
FROM forms_dynamic;

-- 7. PYMES form questions count (should be 10 with v12: business_name, sector,
--    monthly_revenue + 7 Likert q1..q7)
SELECT 'pymes_diagnosis questions' AS check_name,
       COUNT(*) AS question_count,
       string_agg(field_key, ', ' ORDER BY position) AS fields
FROM form_questions
WHERE form_id = (SELECT id FROM forms_dynamic WHERE slug = 'pymes_diagnosis');

-- 8. lead_sales_calculator + business_acquisition question counts
SELECT slug, COUNT(fq.id) AS question_count
FROM forms_dynamic fd
LEFT JOIN form_questions fq ON fq.form_id = fd.id
WHERE fd.slug IN ('lead_sales_calculator', 'business_acquisition')
GROUP BY slug;

-- 9. Legal documents — content length per type
SELECT 'legal_documents' AS check_name,
       type,
       length(content) AS content_length,
       CASE WHEN content ILIKE '%goes here%' THEN 'STILL PLACEHOLDER ❌'
            WHEN length(content) < 200 THEN 'TOO SHORT ⚠️'
            ELSE 'OK ✓' END AS status
FROM legal_documents ORDER BY type;

-- 10. consent_logs RLS policies — must include "Admins can view all consent_logs"
SELECT 'consent_logs RLS policies' AS check_name,
       string_agg(policyname, ', ') AS policies
FROM pg_policies WHERE tablename = 'consent_logs';

-- 11. site_content branding rows — should include logo/cover/favicon URLs
SELECT 'site_content branding' AS check_name,
       string_agg(key || '=' || left(value, 30), ' | ') AS keys
FROM site_content WHERE section = 'branding';

-- 12. Leads with NULL role (should be 0 after backfill)
SELECT 'leads.role NULL count' AS check_name,
       COUNT(*) FILTER (WHERE role IS NULL) AS null_count,
       COUNT(*) AS total_count
FROM leads;

-- 13. Sample of remaining NULL-role leads with notes (to see what's not caught)
SELECT 'remaining NULL-role leads' AS check_name,
       full_name, source, left(notes, 80) AS notes_preview
FROM leads WHERE role IS NULL ORDER BY created_at DESC LIMIT 5;

-- 14. property_images: how many rows + which room_category values exist
SELECT 'property_images' AS check_name,
       COUNT(*) AS image_count,
       string_agg(DISTINCT room_category, ', ' ORDER BY room_category) AS distinct_rooms
FROM property_images;

-- 15. property_images RLS — Anyone can SELECT (for owner gallery to work)
SELECT 'property_images RLS' AS check_name,
       string_agg(policyname, ', ') AS policies
FROM pg_policies WHERE tablename = 'property_images';
