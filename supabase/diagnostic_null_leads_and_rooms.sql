-- ============================================================
-- Targeted diagnostic — see EXACTLY what's left to fix.
-- Read-only.
-- ============================================================

-- A. The 7 leads still with NULL role: full row + notes preview
SELECT id,
       full_name,
       email,
       source,
       created_at,
       left(notes, 200) AS notes_preview
FROM leads
WHERE role IS NULL
ORDER BY created_at DESC;

-- B. Distinct property_images.room_category values + counts.
--    Confirms which casings exist so we can normalize them in DB.
SELECT room_category,
       COUNT(*) AS image_count
FROM property_images
GROUP BY room_category
ORDER BY image_count DESC;
