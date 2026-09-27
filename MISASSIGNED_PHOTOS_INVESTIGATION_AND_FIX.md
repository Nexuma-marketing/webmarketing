# Misassigned Photos — Investigation And Fix

**Read this before the sections below.** This sandbox has **no database
access** — no `psql`, no Supabase CLI, no `.env.local`, no
`SUPABASE_SERVICE_ROLE_KEY`/`NEXT_PUBLIC_SUPABASE_URL` in the environment
(verified: checked for env files, checked shell env vars, checked for a
Supabase MCP tool — none exist). This is the same constraint documented in
`REMAINING_DUPLICATE_PHOTOS_DIAGNOSTIC.md`. **Nothing below was queried,
reassigned, deleted, applied, committed, or pushed.**

Given that constraint, I could not do what the task asked for literally
(pull the real rows, eyeball the `uploaded_at` clusters, and hand-pick a
corrected mapping). Fabricating a plausible-looking table of row IDs and
confidence levels for data I've never seen would be actively dangerous —
if anyone later trusted it and ran corresponding `UPDATE`s, it would
silently corrupt real property attribution based on invented evidence.

So instead, this report gives you a **ready-to-run, self-clustering SQL
tool** that does the grouping and candidate-scoring described in the task
(steps 1–3) automatically, in one query, against the real data — and a
migration file that is **diagnostic-only** (safe `SELECT`s) plus a
clearly-gated `UPDATE` template that must be filled in with real,
human-reviewed row IDs before anything is applied. No blind corrective
`UPDATE`s are included, because no cluster has actually been confirmed
against real data yet.

---

# All property_images Rows For These 4 Properties (raw data)

Not retrieved — no DB access. Run this yourself (or hand it to an agent
that has DB access) to get it:

```sql
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
```

Also pull the properties themselves — `created_at` **and** `updated_at`
are both load-bearing for step 3's reasoning (see next section):

```sql
SELECT id, address, city, property_type, price, bedrooms, bathrooms,
       created_at, updated_at
FROM properties
WHERE owner_id = '7d5bd7dd-9397-48c6-9f89-01bbf1b2114b'
ORDER BY created_at ASC;
```

---

# Clusters Identified And Reasoning

No clusters identified yet — there's no data to cluster. What follows is
the **methodology**, implemented as a runnable query (also embedded in
the migration file below), so whoever runs it gets the actual clusters
and candidate matches directly, rather than a description of how to do it
by hand.

**Why `uploaded_at` gaps are the right clustering key:** per
`REMAINING_DUPLICATE_PHOTOS_DIAGNOSTIC.md`, the misattribution bug fires
per-submission — one "Update Preferences" click loops over up to 4
properties and, for each one, uploads that property's photos to whatever
`property_id` the array-index bug matched it to. So photos from one real
unit's one real upload batch land together, within seconds of each other,
on a single (possibly wrong) `property_id` — they don't get scattered
row-by-row. That makes gap-based clustering (a photo more than N seconds
after the previous one starts a new cluster) a sound way to reconstruct
"what was uploaded in the same submission," independent of which
`property_id` the rows currently sit under.

**Cluster-detection query** (classic gaps-and-islands; `60 seconds` is a
reasonable starting gap threshold — widen it if the real data shows
batches that took longer to upload, e.g. large files):

```sql
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
```

**Cluster-to-property candidate scoring** — for each cluster, rank the 4
properties by how close the cluster's timestamp sits to that property's
`created_at` (suggests: this is the original, correctly-attributed
upload batch, made right when the property was first added) or
`updated_at` (suggests: this is a later "Update Preferences" resubmission
that touched this property's row):

```sql
WITH imgs AS ( /* same as above */ ),
gapped AS ( /* same as above */ ),
clustered AS ( /* same as above */ ),
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
```

Read the output as: for each `cluster_id`, the candidate property with
the smallest `seconds_from_created_at` or `seconds_from_updated_at` is
the strongest circumstantial match. A cluster is **confident** only if
one candidate is dramatically closer in time than the other three (e.g.
seconds vs. hours/days) **and** that candidate is not the same as
`current_property_ids_in_cluster` (if it *is* the same, the cluster was
never actually misattributed — nothing to fix). Anything closer than
that — multiple candidates within the same rough window, or the
timestamp evidence pointing to a property whose `property_type` obviously
can't match circumstantial hints in the filenames — is **not**
confident.

---

# Proposed Corrected Mapping (table: row id, current property_id/room, corrected property_id/room, confidence)

Not populated — this requires the actual query output above, which I
don't have. Do not fill this table in by guessing; run the two queries
above, then for each cluster that clears the "dramatically closer"
confidence bar, add a row here (row id, current `property_id`/room,
corrected `property_id`/room, confidence, one-line reasoning) **before**
touching the migration's `UPDATE` section.

| row id | current property_id / room | corrected property_id / room | confidence | reasoning |
|---|---|---|---|---|
| _(pending real query output)_ | | | | |

---

# Rows Flagged For Manual Visual Confirmation (if any)

Effectively **all rows**, until the clustering query is run against real
data and produces at least one high-confidence match. Beyond that:

- Any cluster where two or more candidate properties are within the same
  rough time window of the cluster (timestamp evidence doesn't clearly
  favor one property) stays flagged — do not guess between them.
- Any cluster whose strongest candidate is only marginally closer than
  the runner-up (e.g. minutes apart, not orders of magnitude) stays
  flagged.
- Per `REMAINING_DUPLICATE_PHOTOS_DIAGNOSTIC.md`'s own conclusion, this
  is fundamentally "a data-repair task... shouldn't be automated without
  someone visually confirming" — timestamp/filename evidence can narrow
  candidates but a human glancing at the actual photo (does it look like
  a penthouse living room or a single-family-house living room?) is the
  only way to close genuinely ambiguous cases.

---

# Migration File Created

`supabase/migration_v53_investor_photo_reattribution_review.sql` (next
number after `migration_v52_property_level_objectives.sql`).

It contains:

- **Part 1** — the two read-only diagnostic queries above (raw rows +
  auto-clustering + candidate-scoring), safe to run any time, changes
  nothing.
- **Part 2** — an empty, clearly-labeled `UPDATE` template with a big
  warning comment. It has **no real row IDs in it** — filling it in
  requires pasting in rows from your own completed "Proposed Corrected
  Mapping" table above, one `UPDATE ... WHERE id = '<real-row-uuid>'`
  per confident row. It is not runnable as shipped, on purpose.

---

# How To Apply (plain language)

1. Get someone/something with real Supabase access (service-role key or
   the Supabase SQL editor) to run Part 1 of the migration file.
2. Look at the cluster + candidate-scoring output. For each cluster that
   clears the confidence bar described above, fill in a row in this
   report's mapping table.
3. For clusters that don't clear the bar, leave them in the "needs
   manual visual confirmation" list — open the actual photos
   (`image_url`) side by side with what each real property is (address/
   type/rent) and confirm by eye.
4. Only after the mapping table is filled in with real, reviewed rows,
   add the corresponding `UPDATE` statements into Part 2 of the migration
   file (one per confident row), and apply Part 2 manually.
5. This task explicitly says not to apply, commit, or push — so stop
   after writing the filled-in migration and hand it back for review.

---

# Expected Result

Once a human has run the diagnostic query, filled in the mapping table
with real data, added the corresponding `UPDATE`s to Part 2, and someone
has applied that migration: each of the 4 properties
(`7af10987-...`, `0848dcc5-...`, `8cbc5014-...`, `5ba1bb48-...`) should
show only `property_images` rows whose content and `room_category`
genuinely belong to that unit. No rows are deleted (only `property_id`/
`room_category` are corrected), no other table is touched, and any row
that couldn't be confidently resolved from timestamp/filename evidence
alone stays exactly as it is pending a manual visual check.
