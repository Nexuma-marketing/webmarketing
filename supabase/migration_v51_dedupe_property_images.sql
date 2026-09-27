-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  Migration V51 — Remove confirmed duplicate property_images rows ║
-- ║                                                                  ║
-- ║  Cleans up exact-duplicate photo rows created by the pre-fix     ║
-- ║  resubmission bug documented in                                  ║
-- ║  PAYMENT_HISTORY_AND_DUPLICATE_PHOTOS_FIX.md (Bug 2) — reopening ║
-- ║  the owner/investor registration form re-inserted every already- ║
-- ║  uploaded photo on each save, with no dedup guard at the time.   ║
-- ║  That form now has a dedup guard, so this migration only cleans  ║
-- ║  up rows that were already duplicated before that fix landed.    ║
-- ║                                                                  ║
-- ║  Scope: 12 duplicate groups across 4 properties, confirmed via   ║
-- ║  the read-only diagnostic query in that report — every group has ║
-- ║  exactly 2 rows sharing (property_id, room_category,             ║
-- ║  original_filename, file_size_bytes), i.e. the same upload       ║
-- ║  repeated once. Confirmed by the user: none of these rows have   ║
-- ║  been individually approved/rejected (status differs from its    ║
-- ║  sibling) before this migration was written. No row outside      ║
-- ║  these groups is touched. No other table is touched.             ║
-- ║                                                                  ║
-- ║  Rule: within each group, keep the OLDEST row (by uploaded_at,   ║
-- ║  id as a deterministic tiebreak) and delete the rest.            ║
-- ║                                                                  ║
-- ║  ⚠ THIS FILE IS NOT AUTO-APPLIED. Run Part 1 by itself first and ║
-- ║  visually confirm the rows listed are the ones you expect to     ║
-- ║  remove. SAVE that output (especially the storage_path column)  ║
-- ║  before running Part 2 — once the rows are deleted, the database ║
-- ║  no longer has a record of which Storage files they pointed to.  ║
-- ║                                                                  ║
-- ║  ⚠ This migration deletes DATABASE ROWS ONLY. The Storage files  ║
-- ║  those rows point to (bucket "property-images") are NOT deleted  ║
-- ║  here — see DUPLICATE_PHOTOS_CLEANUP.md for the separate, manual ║
-- ║  Storage cleanup procedure to run AFTER this migration has been  ║
-- ║  applied and verified.                                           ║
-- ╚══════════════════════════════════════════════════════════════════╝

-- ─── PART 1 — REVIEW FIRST: rows that WILL BE DELETED ────────────
-- Run this SELECT by itself first. `storage_path` is derived from
-- `image_url` (a full public Storage URL of the form
-- ".../object/public/property-images/<storage_path>", produced by
-- supabase.storage.from("property-images").getPublicUrl(path) in the
-- upload code — src/app/forms/propietario/page.tsx and
-- src/app/(dashboard)/dashboard/images/page.tsx) by stripping
-- everything up to and including "/property-images/". This is the
-- exact path the Storage cleanup script in
-- DUPLICATE_PHOTOS_CLEANUP.md needs — copy this column's values out
-- (e.g. export the result set) before running Part 2.

WITH ranked AS (
  SELECT
    id,
    property_id,
    room_category,
    original_filename,
    file_size_bytes,
    status,
    uploaded_at,
    image_url,
    substring(image_url from '/property-images/(.*)$') AS storage_path,
    ROW_NUMBER() OVER (
      PARTITION BY property_id, room_category, original_filename, file_size_bytes
      ORDER BY uploaded_at ASC, id ASC
    ) AS rn
  FROM property_images
)
SELECT
  id,
  property_id,
  room_category,
  original_filename,
  file_size_bytes,
  status,
  uploaded_at,
  image_url,
  storage_path
FROM ranked
WHERE rn > 1
ORDER BY property_id, room_category, original_filename, uploaded_at;

-- ─── PART 2 — DELETE the rows confirmed above ────────────────────
-- Only run this after Part 1's output has been visually confirmed
-- AND saved. Identical grouping/ordering logic — deletes every row
-- EXCEPT the oldest (rn = 1) in each exact-duplicate group.

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY property_id, room_category, original_filename, file_size_bytes
      ORDER BY uploaded_at ASC, id ASC
    ) AS rn
  FROM property_images
)
DELETE FROM property_images
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- ─── Verification (run after Part 2) ─────────────────────────────
-- Expect zero rows back — no exact-duplicate group should remain.
--
-- SELECT property_id, room_category, original_filename, file_size_bytes,
--        COUNT(*) AS remaining_count
-- FROM property_images
-- GROUP BY property_id, room_category, original_filename, file_size_bytes
-- HAVING COUNT(*) > 1;
