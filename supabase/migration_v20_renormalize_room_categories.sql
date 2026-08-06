-- ============================================================
-- Migration v20 - re-normalize property_images.room_category
-- ============================================================
-- Steve 5/6: the admin Image Library Room filter dropdown showed
-- duplicates ("Living Room" + "living_room", "Kitchen" + "kitchen",
-- ...). v14 normalized everything that existed at the time, but the
-- /dashboard/images upload UI kept saving Title Case from the
-- ROOM_CATEGORIES constant, so new uploads since v14 reintroduced
-- mixed casing.
--
-- v20 re-runs the same trim+lowercase+underscore normalization on
-- whatever rows look out of canonical form. Idempotent. Safe to
-- re-apply.
--
-- The companion code commit also fixes the dashboard upload UI to
-- write canonical lowercase + underscore at insert time so this drift
-- does not happen again.
-- ============================================================

UPDATE property_images
SET room_category = lower(regexp_replace(trim(room_category), '\s+', '_', 'g'))
WHERE room_category IS NOT NULL
  AND room_category <> lower(regexp_replace(trim(room_category), '\s+', '_', 'g'));

-- Verification
SELECT room_category, COUNT(*) AS image_count
FROM property_images
GROUP BY room_category
ORDER BY image_count DESC;
