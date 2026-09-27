-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  Migration V54 — Dedupe whole-batch-duplicated property_images    ║
-- ║  rows across ALL room categories, for 2 specific properties       ║
-- ║                                                                    ║
-- ║  Same root cause as migration_v51, one level broader: the old      ║
-- ║  array-position "Update Preferences" bug documented in             ║
-- ║  REMAINING_DUPLICATE_PHOTOS_DIAGNOSTIC.md re-inserted an            ║
-- ║  investor's whole per-property photo batch (one file per required  ║
-- ║  room, uploaded together) onto the wrong property_id on a          ║
-- ║  resubmission. v51 only caught EXACT duplicates (same room +       ║
-- ║  filename + size). Confirmed by the user (visual evidence,         ║
-- ║  screenshot counts) that for these 2 properties the same           ║
-- ║  underlying files also landed under DIFFERENT room_category        ║
-- ║  labels across the two batches, so v51's grouping key (which       ║
-- ║  requires filename/size AND category to match) missed these.       ║
-- ║                                                                    ║
-- ║  Scope: ONLY these 2 property_ids —                                ║
-- ║    0848dcc5-38c7-47e4-8fa8-61516ac31244 (12 Dani St, Burnaby)      ║
-- ║    8cbc5014-4c12-4e2f-bd34-e03331ec5226 (23 George St, Surrey)     ║
-- ║  No other property, account, or table is touched.                  ║
-- ║                                                                    ║
-- ║  Rule: within each (property_id, normalized room_category) group, ║
-- ║  keep the OLDEST row (by uploaded_at, id as tiebreak) and delete   ║
-- ║  the rest. Normalization matches migration_v20's own convention:   ║
-- ║  lower(regexp_replace(trim(room_category), '\s+', '_', 'g')).      ║
-- ║                                                                    ║
-- ║  ⚠ THIS FILE IS NOT AUTO-APPLIED. Run Part 0 and Part 1 first and  ║
-- ║  visually confirm the output before running Part 2 — see          ║
-- ║  SYSTEMIC_DUPLICATE_PHOTOS_FIX.md for a specific flagged case      ║
-- ║  (the Surrey property's surviving "bathroom" row may itself be a   ║
-- ║  mislabeled photo with no duplicate to compare against — a         ║
-- ║  DELETE-only dedup cannot fix that; check it manually first).      ║
-- ║                                                                    ║
-- ║  ⚠ Database rows only. No Storage files are deleted here.          ║
-- ╚══════════════════════════════════════════════════════════════════╝

-- ─── PART 0 — ROOT CAUSE CONFIRMATION (read-only) ────────────────
-- Clusters each property's photos into upload batches by tight
-- uploaded_at proximity (60s gap = new batch), independent of
-- room_category. Expect ~2 batches per property, each with ~5 photos,
-- confirming "whole set re-inserted once" rather than random per-photo
-- corruption. If the real output looks different, stop and review
-- manually before proceeding to Part 1/2.

WITH imgs AS (
  SELECT id, property_id, room_category, original_filename, uploaded_at
  FROM property_images
  WHERE property_id IN (
    '0848dcc5-38c7-47e4-8fa8-61516ac31244',
    '8cbc5014-4c12-4e2f-bd34-e03331ec5226'
  )
),
gapped AS (
  SELECT *,
    uploaded_at - LAG(uploaded_at) OVER (PARTITION BY property_id ORDER BY uploaded_at, id) AS gap_from_prev
  FROM imgs
),
clustered AS (
  SELECT *,
    SUM(CASE WHEN gap_from_prev IS NULL OR gap_from_prev > INTERVAL '60 seconds'
             THEN 1 ELSE 0 END)
      OVER (PARTITION BY property_id ORDER BY uploaded_at, id ROWS UNBOUNDED PRECEDING) AS batch_id
  FROM gapped
)
SELECT property_id, batch_id, MIN(uploaded_at) AS batch_start, COUNT(*) AS photos_in_batch,
       array_agg(room_category ORDER BY uploaded_at) AS categories_in_batch
FROM clustered
GROUP BY property_id, batch_id
ORDER BY property_id, batch_start;

-- ─── PART 1 — REVIEW FIRST: rows that WILL BE DELETED ────────────
-- Run this SELECT by itself first and visually confirm each row
-- (open image_url) before running Part 2. Expect 4 rows back for the
-- Burnaby property and 3 for the Surrey property, per the confirmed
-- counts (9→5 and 8→5).

WITH ranked AS (
  SELECT
    id,
    property_id,
    room_category,
    lower(regexp_replace(trim(room_category), '\s+', '_', 'g')) AS normalized_room_category,
    original_filename,
    file_size_bytes,
    status,
    uploaded_at,
    image_url,
    ROW_NUMBER() OVER (
      PARTITION BY property_id, lower(regexp_replace(trim(room_category), '\s+', '_', 'g'))
      ORDER BY uploaded_at ASC, id ASC
    ) AS rn
  FROM property_images
  WHERE property_id IN (
    '0848dcc5-38c7-47e4-8fa8-61516ac31244',
    '8cbc5014-4c12-4e2f-bd34-e03331ec5226'
  )
)
SELECT
  id, property_id, room_category, normalized_room_category,
  original_filename, file_size_bytes, status, uploaded_at, image_url
FROM ranked
WHERE rn > 1
ORDER BY property_id, normalized_room_category, uploaded_at;

-- ─── PART 2 — DELETE the rows confirmed above ────────────────────
-- Only run this after Part 0 and Part 1's output have been visually
-- confirmed (including the manual bathroom/exterior/kitchen check for
-- the Surrey property described in SYSTEMIC_DUPLICATE_PHOTOS_FIX.md).
-- Identical grouping/ordering logic — deletes every row EXCEPT the
-- oldest (rn = 1) per (property_id, normalized room_category).

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY property_id, lower(regexp_replace(trim(room_category), '\s+', '_', 'g'))
      ORDER BY uploaded_at ASC, id ASC
    ) AS rn
  FROM property_images
  WHERE property_id IN (
    '0848dcc5-38c7-47e4-8fa8-61516ac31244',
    '8cbc5014-4c12-4e2f-bd34-e03331ec5226'
  )
)
DELETE FROM property_images
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- ─── Verification (run after Part 2) ─────────────────────────────
-- Expect exactly 5 rows per property_id (one per required room:
-- living_room, kitchen, bedroom/master_bedroom, bathroom, exterior),
-- and zero groups with COUNT(*) > 1.

-- SELECT property_id, COUNT(*) AS remaining_count
-- FROM property_images
-- WHERE property_id IN (
--   '0848dcc5-38c7-47e4-8fa8-61516ac31244',
--   '8cbc5014-4c12-4e2f-bd34-e03331ec5226'
-- )
-- GROUP BY property_id;
--
-- SELECT property_id, lower(regexp_replace(trim(room_category), '\s+', '_', 'g')) AS normalized_room_category,
--        COUNT(*) AS remaining_count
-- FROM property_images
-- WHERE property_id IN (
--   '0848dcc5-38c7-47e4-8fa8-61516ac31244',
--   '8cbc5014-4c12-4e2f-bd34-e03331ec5226'
-- )
-- GROUP BY property_id, normalized_room_category
-- HAVING COUNT(*) > 1;
