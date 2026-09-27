-- ============================================================
-- Migration V53 — Investor photo reattribution: review + fix
-- ============================================================
--
-- Context: investor account owner_id 7d5bd7dd-9397-48c6-9f89-01bbf1b2114b
-- has 4 properties. Due to the (now-fixed) array-position bug in the
-- "Update Preferences" flow (see REMAINING_DUPLICATE_PHOTOS_DIAGNOSTIC.md),
-- some property_images rows currently attached to one of these 4
-- properties may actually belong, by content, to a different one of the
-- same investor's 4 properties.
--
-- See MISASSIGNED_PHOTOS_INVESTIGATION_AND_FIX.md for full reasoning.
-- This migration was written WITHOUT database access — no rows have
-- been seen, so Part 2 below is intentionally empty. Do not add
-- UPDATE statements to Part 2 unless they are backed by rows a human
-- has actually reviewed against Part 1's output.
--
-- ============================================================
-- PART 1 — DIAGNOSTIC (read-only, safe to run any time)
-- ============================================================

-- 1a. Raw property_images rows for the 4 properties, oldest first.
SELECT
  pi.id,
  pi.property_id,
  p.address,
  p.city,
  p.property_type,
  pi.room_category,
  pi.original_filename,
  pi.file_size_bytes,
  pi.image_url,
  pi.status,
  pi.uploaded_at
FROM property_images pi
JOIN properties p ON p.id = pi.property_id
WHERE pi.property_id IN (
  '7af10987-e962-4a7a-ba14-8b39f68618cb',  -- 123 Alex St, Vancouver, single_house
  '0848dcc5-38c7-47e4-8fa8-61516ac31244',  -- 12 Dani St, Burnaby, condo
  '8cbc5014-4c12-4e2f-bd34-e03331ec5226',  -- 23 George St, Surrey, penthouse
  '5ba1bb48-5713-4810-9613-c17fedb2f94f'   -- 123 David St, Richmond, penthouse
)
ORDER BY pi.uploaded_at ASC, pi.property_id;

-- 1b. The 4 properties themselves, with created_at/updated_at, used as
-- circumstantial evidence in 1d below.
SELECT id, address, city, property_type, price, bedrooms, bathrooms,
       created_at, updated_at
FROM properties
WHERE owner_id = '7d5bd7dd-9397-48c6-9f89-01bbf1b2114b'
ORDER BY created_at ASC;

-- 1c. Auto-clustering: groups property_images rows (across all 4
-- properties combined) into upload batches by tight uploaded_at
-- proximity, regardless of current property_id. Adjust the
-- INTERVAL '60 seconds' threshold if real data shows tighter/looser
-- batches (e.g. large files taking longer to upload).
WITH imgs AS (
  SELECT
    pi.id,
    pi.property_id AS current_property_id,
    pi.room_category AS current_room_category,
    pi.original_filename,
    pi.file_size_bytes,
    pi.status,
    pi.uploaded_at
  FROM property_images pi
  WHERE pi.property_id IN (
    '7af10987-e962-4a7a-ba14-8b39f68618cb',
    '0848dcc5-38c7-47e4-8fa8-61516ac31244',
    '8cbc5014-4c12-4e2f-bd34-e03331ec5226',
    '5ba1bb48-5713-4810-9613-c17fedb2f94f'
  )
),
gapped AS (
  SELECT *,
    uploaded_at - LAG(uploaded_at) OVER (ORDER BY uploaded_at, id) AS gap_from_prev
  FROM imgs
),
clustered AS (
  SELECT *,
    SUM(CASE WHEN gap_from_prev IS NULL OR gap_from_prev > INTERVAL '60 seconds'
             THEN 1 ELSE 0 END)
      OVER (ORDER BY uploaded_at, id ROWS UNBOUNDED PRECEDING) AS cluster_id
  FROM gapped
)
SELECT cluster_id, id, current_property_id, current_room_category,
       original_filename, uploaded_at
FROM clustered
ORDER BY cluster_id, uploaded_at;

-- 1d. Candidate scoring: for each cluster found in 1c, ranks the 4
-- properties by how close the cluster's timestamp is to that
-- property's created_at (original upload) or updated_at (a later
-- resubmission that touched that row). Smallest seconds_from_* wins;
-- treat a match as confident only if it is dramatically closer than
-- the runner-up (seconds/minutes vs. hours/days) AND differs from
-- current_property_ids_in_cluster (otherwise nothing is actually wrong
-- for that cluster).
WITH imgs AS (
  SELECT
    pi.id, pi.property_id AS current_property_id, pi.uploaded_at
  FROM property_images pi
  WHERE pi.property_id IN (
    '7af10987-e962-4a7a-ba14-8b39f68618cb',
    '0848dcc5-38c7-47e4-8fa8-61516ac31244',
    '8cbc5014-4c12-4e2f-bd34-e03331ec5226',
    '5ba1bb48-5713-4810-9613-c17fedb2f94f'
  )
),
gapped AS (
  SELECT *,
    uploaded_at - LAG(uploaded_at) OVER (ORDER BY uploaded_at, id) AS gap_from_prev
  FROM imgs
),
clustered AS (
  SELECT *,
    SUM(CASE WHEN gap_from_prev IS NULL OR gap_from_prev > INTERVAL '60 seconds'
             THEN 1 ELSE 0 END)
      OVER (ORDER BY uploaded_at, id ROWS UNBOUNDED PRECEDING) AS cluster_id
  FROM gapped
),
cluster_summary AS (
  SELECT cluster_id, MIN(uploaded_at) AS cluster_time,
         array_agg(DISTINCT current_property_id) AS current_property_ids_in_cluster
  FROM clustered GROUP BY cluster_id
),
props AS (
  SELECT id AS property_id, address, created_at, updated_at
  FROM properties
  WHERE owner_id = '7d5bd7dd-9397-48c6-9f89-01bbf1b2114b'
)
SELECT
  cs.cluster_id, cs.cluster_time, cs.current_property_ids_in_cluster,
  p.property_id AS candidate_property_id, p.address,
  ABS(EXTRACT(EPOCH FROM (cs.cluster_time - p.created_at))) AS seconds_from_created_at,
  ABS(EXTRACT(EPOCH FROM (cs.cluster_time - p.updated_at))) AS seconds_from_updated_at
FROM cluster_summary cs
CROSS JOIN props p
ORDER BY cs.cluster_id,
         LEAST(ABS(EXTRACT(EPOCH FROM (cs.cluster_time - p.created_at))),
               ABS(EXTRACT(EPOCH FROM (cs.cluster_time - p.updated_at))));

-- ============================================================
-- PART 2 — CORRECTIVE UPDATES (DO NOT RUN AS SHIPPED)
-- ============================================================
--
-- Intentionally empty. Populate this section ONLY after:
--   1. Running Part 1 above against the real database.
--   2. Filling in the "Proposed Corrected Mapping" table in
--      MISASSIGNED_PHOTOS_INVESTIGATION_AND_FIX.md with real row ids,
--      using the confidence bar described there.
--   3. For every row that clears that bar, adding one UPDATE below,
--      following this exact pattern:
--
--   UPDATE property_images
--   SET property_id = '<verified-correct-property-uuid>',
--       room_category = '<verified-correct-room-category>'
--   WHERE id = '<real-row-uuid-from-part-1-output>';
--
-- Do NOT add an UPDATE for any row still listed under "Rows Flagged
-- For Manual Visual Confirmation" in the report. Do not touch any
-- table other than property_images, and never DELETE a row here —
-- this migration only corrects property_id/room_category attribution.
