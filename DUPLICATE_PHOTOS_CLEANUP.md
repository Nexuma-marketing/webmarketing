# Duplicate Photos Cleanup

Follow-up to `PAYMENT_HISTORY_AND_DUPLICATE_PHOTOS_FIX.md` (Bug 2), which
diagnosed the duplication mechanism, shipped a dedup guard to stop new
duplicates, and left a read-only query to find existing ones. This task
acts on that query's confirmed results. **Nothing in this task was
applied, deleted, committed, pushed, or deployed** — everything below is
a file for manual, deliberate execution.

---

# Duplicate Groups Confirmed (count, properties affected)

Per the prior diagnostic query (grouping `property_images` by
`property_id, room_category, original_filename, file_size_bytes`),
confirmed:

- **12 duplicate groups**, across **4 properties**.
- Every group has **exactly 2 rows** — the same upload inserted twice,
  never more.
- **Confirmed by the user**: none of these 12 groups have a `status`
  that differs between the two rows (i.e. none have already been
  individually approved/rejected by admin review) — so keeping one and
  deleting the other does not discard any admin decision.
- I have no direct database access in this sandbox, so I could not
  re-run or independently re-verify the diagnostic query myself — this
  task takes the user-confirmed 12/4 count as given, and the migration
  below is written to reproduce that exact grouping logic so its Part 1
  SELECT (see below) can be checked against that count before anything
  is deleted.

---

# Database Deletion Logic (keep oldest, delete rest)

Same grouping as the original diagnostic query. Within each group
(`property_id, room_category, original_filename, file_size_bytes`), rank
rows by `uploaded_at` ascending (oldest first), tiebreaking on `id` for
determinism if two rows ever shared a timestamp. Keep rank 1 (the
original upload), delete every other rank in that group. Since every
confirmed group has exactly 2 rows, this deletes exactly one row per
group — 12 rows total, if the count is unchanged when this is run.

Nothing outside a duplicate group is touched, and no other table is
touched.

---

# Migration File Created

`supabase/migration_v51_dedupe_property_images.sql` (next number after
the existing `migration_v50_payments_property_id.sql`).

It contains two parts, meant to be run **separately, in order**:

- **Part 1 — a SELECT**, using the same `ROW_NUMBER() OVER (PARTITION
  BY ...)` grouping described above, returning every row that Part 2
  would delete: `id, property_id, room_category, original_filename,
  file_size_bytes, status, uploaded_at, image_url`, plus a derived
  `storage_path` column (see next section for how that's derived).
- **Part 2 — the DELETE**, using identical grouping/ordering logic,
  removing exactly the rows Part 1 showed.

The file is **not applied** — see "How To Apply" below.

---

# Exact Storage File Paths To Remove (per duplicate row)

**Confirmed column and format** (from the actual upload code, not
guessed):

- Table: `property_images`, column `image_url` — confirmed in
  `supabase/migration_v2_mvp.sql` (table definition) and in every
  upload call site.
- Upload code (`src/app/forms/propietario/page.tsx`, both the investor
  and single-owner blocks, and `src/app/(dashboard)/dashboard/images/page.tsx`)
  all write to the same Storage bucket, **`property-images`**, at a
  path shaped like:
  ```
  properties/<property_id>/<timestamp>-<random>.<ext>
  ```
  (the manual Image Gallery uploader omits the `-<random>` suffix, but
  the folder structure — `properties/<property_id>/...` — is identical).
- `image_url` is **not** a raw Storage path — it's the full public URL
  returned by `supabase.storage.from("property-images").getPublicUrl(path)`,
  shaped like:
  ```
  https://<project-ref>.supabase.co/storage/v1/object/public/property-images/properties/<property_id>/<timestamp>-<random>.<ext>
  ```

So the exact Storage path for each duplicate row is everything after
`/property-images/` in its `image_url`. Migration v51's Part 1 SELECT
computes this for you as the `storage_path` column, via:

```sql
substring(image_url from '/property-images/(.*)$')
```

**I cannot list the actual 12 paths in this document** — this sandbox
has no database access (no `psql`/Supabase CLI/env vars available), so
the real `image_url` values for these specific rows are only visible by
running Part 1 against the real database. Run it, and its `storage_path`
column is the exact, ready-to-use list.

---

# Storage Cleanup Procedure (step-by-step, manual execution)

**Do this only after the "How To Apply" order below — database first,
always.**

1. In the Supabase SQL Editor, run **Part 1** of
   `supabase/migration_v51_dedupe_property_images.sql` by itself.
2. Visually confirm every row returned is one you expect to remove —
   12 rows, 4 properties, matching the earlier diagnostic. Confirm the
   `status` column doesn't look like an approved/reviewed row you'd
   regret losing.
3. **Export or copy the `storage_path` column values now**, one per
   line, into a local text file (e.g. `dup-paths.txt`). This is your
   only record of which Storage files correspond to these rows — once
   Part 2 deletes them, the database no longer has this mapping.
4. Run **Part 2** of the same migration file to delete the database
   rows. Run the verification query at the bottom of the file — it
   should return zero rows.
5. Only now, with the database deletion confirmed, clean up Storage.
   Two options, either is fine — do NOT skip step 4 first:

   **Option A — Supabase Dashboard (simplest, fully manual):**
   Storage → `property-images` bucket → navigate into each
   `properties/<property_id>/` folder named in `dup-paths.txt` → locate
   and delete the specific file by its exact filename from that list.

   **Option B — the provided script (for reviewing/removing many at
   once):**
   ```bash
   # Dry run first — lists what would be removed, deletes nothing:
   node --env-file=.env.local scripts/cleanup-duplicate-property-images-storage.mjs dup-paths.txt

   # Only after reviewing the dry-run output, actually delete:
   node --env-file=.env.local scripts/cleanup-duplicate-property-images-storage.mjs dup-paths.txt --confirm
   ```
   The script (`scripts/cleanup-duplicate-property-images-storage.mjs`)
   defaults to a no-op dry run that only prints the paths it read from
   your file; it only calls Storage's `remove()` when you pass
   `--confirm` explicitly. It uses the same `NEXT_PUBLIC_SUPABASE_URL` /
   `SUPABASE_SERVICE_ROLE_KEY` env vars as the existing
   `scripts/create-admin-user.mjs`.

I did not run either option myself — Storage deletion is irreversible
and I have no way to verify the outcome in this sandbox.

---

# How To Apply (plain language — database first, then Storage, in that order)

1. **Database rows, Part 1 (review):** Run the SELECT half of
   `supabase/migration_v51_dedupe_property_images.sql` in the Supabase
   SQL Editor. Confirm the output matches the expected 12 rows / 4
   properties, and save the `storage_path` values somewhere (a text
   file) before continuing.
2. **Database rows, Part 2 (delete):** Run the DELETE half of the same
   file. Run the verification query underneath it and confirm it
   returns zero rows.
3. **Storage files (only after step 2 is confirmed):** Use the saved
   `storage_path` list from step 1 to remove the corresponding files
   from the `property-images` bucket, via the Dashboard or the provided
   script's dry-run-then-`--confirm` flow described above.
4. Never reverse this order — never delete a Storage file before its
   matching database row has been deleted and verified as a true
   duplicate. If step 1's review ever shows something unexpected (more
   or fewer than 12 rows, or a row whose `status` looks
   reviewed/approved differently from its sibling), stop and re-check
   before proceeding to Part 2.

Nothing here was applied for you. All of this is yours to run manually,
in the Supabase SQL Editor and your own shell, whenever you're ready.

---

# Expected Result

- After Part 2: `property_images` has exactly 12 fewer rows, one per
  confirmed duplicate group, each group's oldest (`uploaded_at`) row
  kept intact — same `id`, same `image_url`, unaffected by this
  cleanup.
- The verification query returns zero duplicate groups.
- After the Storage cleanup step: the 12 now-orphaned files are removed
  from the `property-images` bucket, freeing storage with no visible
  effect on the app — the remaining (kept) row's photo is unaffected,
  since it points to a different Storage object.
- No property loses its required room photos: for every group, one
  fully valid copy remains in both the database and Storage.
- No row outside these 12, and no other table, is affected.
