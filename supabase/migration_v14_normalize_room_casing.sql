-- ============================================================
-- Migration v14 — Normalize property_images.room_category casing
-- ============================================================
-- The 5/4 diagnostic showed 89 property_images split across nine
-- different casings of the same 5-6 rooms:
--
--   kitchen     17  | exterior     17  | living_room   17
--   bedroom     16  | bathroom     15  | dining_room    4
--   Bathroom     1  | Kitchen       1  | office         1
--
-- Two upload paths existed:
--   * /forms/propietario(/add-property) — wrote lowercase+underscore
--     ("living_room", "kitchen", …)
--   * /dashboard/images — wrote Title Case ("Bathroom", "Kitchen", …)
--
-- The 5/4 frontend fix (commit 716a6de) compares both with
-- alphanumerics only ("livingroom" === "livingroom") so the owner
-- checklist correctly matches every casing. v14 normalises the data
-- itself to lowercase+underscore so future code can stop having to
-- defensively normalise on read.
--
-- Mapping rules (safe — only collapses obvious synonyms):
--   "Living Room"   → "living_room"
--   "Kitchen"       → "kitchen"
--   "Master Bedroom"→ "master_bedroom"   (kept as its own room)
--   "Bedroom"       → "bedroom"
--   "Bathroom"      → "bathroom"
--   "Exterior"      → "exterior"
--   "Dining Room"   → "dining_room"
--   "Office"        → "office"
--   anything else   → lower-snake-case of input
-- ============================================================

UPDATE property_images
SET room_category = lower(regexp_replace(trim(room_category), '\s+', '_', 'g'))
WHERE room_category IS NOT NULL
  AND room_category <> lower(regexp_replace(trim(room_category), '\s+', '_', 'g'));

-- Verification (read-only — output goes to NOTICE / RAISE)
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT room_category, COUNT(*) AS n
    FROM property_images
    GROUP BY room_category
    ORDER BY n DESC
  LOOP
    RAISE NOTICE 'room_category: % (% images)', rec.room_category, rec.n;
  END LOOP;
END $$;
