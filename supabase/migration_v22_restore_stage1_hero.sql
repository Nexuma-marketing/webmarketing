-- ============================================================
-- Migration v22 - restore Stage 1 approved homepage hero
-- ============================================================
-- Steve 5/6: the public homepage hero section drifted away from the
-- design that was approved at Stage 1. The current site_content rows
-- contain "We turn marketing into rentals." and a different Unsplash
-- cover image, both of which Steve flagged with "No se ha cambiado /
-- please leave it as it was before (and as it was approved before)."
--
-- The companion code change (src/app/page.tsx) hardcodes the Stage 1
-- hero JSX so the section cannot drift again. This migration cleans
-- up the DB rows so admin and DB are consistent with that decision.
--
-- 1. UPDATE site_content.site_cover_image_url to the Stage 1 photo so
--    branding.coverImageUrl (used by api/health checks and any future
--    surface) reports the approved value.
-- 2. UPDATE the landing_hero rows to the approved text so an admin
--    visiting /admin/content sees the right copy even though the rows
--    are no longer rendered on the public page.
--
-- Idempotent: each UPDATE writes the same value every run.
-- ============================================================

-- 1. Cover image — flip from the temp Unsplash photo back to the
--    Stage 1 BC luxury property photo.
UPDATE site_content
SET value = 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&h=1000&fit=crop&crop=center',
    updated_at = now()
WHERE section = 'branding' AND key = 'site_cover_image_url';

-- 2. Hero text rows — restore the Stage 1 wording. The page no longer
--    reads these rows (hero is hardcoded), but the admin panel still
--    surfaces them; keeping them aligned with the rendered output
--    avoids confusion.
UPDATE site_content
SET value = 'Grow Your Property & Business',
    updated_at = now()
WHERE section = 'landing_hero' AND key = 'hero_title';

UPDATE site_content
SET value = 'We connect property owners, investors, tenants, and businesses with tailored marketing strategies. Diagnose, recommend, and transform your results.',
    updated_at = now()
WHERE section = 'landing_hero' AND key = 'hero_subtitle';

-- Verification:
-- SELECT section, key, value FROM site_content
-- WHERE (section = 'branding' AND key = 'site_cover_image_url')
--    OR (section = 'landing_hero' AND key IN ('hero_title','hero_subtitle'));
