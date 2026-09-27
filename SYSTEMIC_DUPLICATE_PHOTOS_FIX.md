# Systemic Duplicate Photos Fix

**Same constraint as prior reports:** this sandbox has no database access
(no `psql`/Supabase CLI, no `.env.local`, no service-role key in the
environment — verified again for this task). I did not re-run the
already-confirmed visual evidence and I'm not asking you to re-verify it.
What follows is: the exact review query to run (mirroring migration
v51's own "review before delete" pattern), the migration itself (written
generically against the two given `property_id`s — it does not require
me to have seen the actual rows, unlike a task that needs judgment calls
on ambiguous content), and independently-verified code evidence for the
recurrence-prevention question, re-checked against the current source
files rather than assumed from the redesign doc.

---

# All Duplicate/Mislabeled Rows Found (both properties, all categories)

Not retrieved — no DB access. This is the query to run to get them (also
Part 1 of the migration file below):

```sql
SELECT
  id, property_id, room_category, original_filename, file_size_bytes,
  status, uploaded_at, image_url
FROM property_images
WHERE property_id IN (
  '0848dcc5-38c7-47e4-8fa8-61516ac31244',  -- 12 Dani St, Burnaby, condo
  '8cbc5014-4c12-4e2f-bd34-e03331ec5226'   -- 23 George St, Surrey, penthouse
)
ORDER BY property_id, uploaded_at ASC;
```

Taking the user-confirmed counts as given (9 rows / 5 required for
Burnaby, 8 rows / 5 required for Surrey), the fix below is written to
reduce each property to exactly its 5 required-room rows.

**Grouping key used to define "the same bug," per your own description
in step 2** (same-category repeats *and* same-file-different-category
both count): `property_id` + **normalized** `room_category`
(`lower(regexp_replace(trim(room_category), '\s+', '_', 'g'))` — the same
normalization migration v20 already applies to this column), ordered by
`uploaded_at ASC`. Deliberately **not** including
`original_filename`/`file_size_bytes` in the partition key this time
(unlike v51) — v51 was matching *exact* duplicates within the same
category; here the same physical file can carry a *different*
`room_category` label across rows (the bathtub photo appearing as
`kitchen` and `exterior` too), so grouping by category alone is what
catches "5 categories, oldest wins" regardless of which file ended up
under which label.

---

# Root Cause (batch re-insertion via old Update Preferences submissions)

This is the same mechanism already established in
`REMAINING_DUPLICATE_PHOTOS_DIAGNOSTIC.md` — in fact, **the Burnaby condo
and Surrey penthouse in that report are these same two properties**
(matched by city + property_type). That report's Section 3 traced the
exact bug: the old "Update Preferences" flow
(`src/app/forms/propietario/page.tsx`, investor path) re-matched a
resubmitted investor's properties to existing DB rows **by array
position** (`currentProperties[i]`, oldest-created-first) rather than by
a stable id, and re-ran its photo-upload block against whatever
`property_id` that position pointed to. If the investor re-entered
properties in a different order than they were originally created in,
each property's photo batch — normally one file per required room,
uploaded within seconds of each other — landed as a whole on the
*wrong* property's row.

That's why this shows up as "nearly every category duplicated at once"
rather than one category randomly duplicating: it isn't independent
per-photo corruption, it's one whole 5-photo batch getting attached a
second time to a property that already had its own (correct) 5-photo
batch from an earlier submission. Whichever categories the two batches'
underlying files got tagged with in that second, buggy pass explains
both the raw count (5 + 5 = up to 10, minus however many the mislabeling
happened to double up in the same category) and the specific mislabeling
pattern (a bathroom-content file inserted a second time isn't guaranteed
to land back on `"bathroom"` — it depends on whatever room the investor
picked in that resubmission's form for that slot).

**To confirm this directly against the real data** (batch clustering by
`uploaded_at`), run this — also included as Part 0 of the migration file:

```sql
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
```

**Prediction if the hypothesis is correct:** each property shows exactly
2 batches, each with ~4–5 photos uploaded within seconds of each other,
the first batch's timestamp roughly matching that property's
`properties.created_at`, the second batch's timestamp matching a later
date (an "Update Preferences" resubmission). If instead the real output
shows more than 2 batches, or single stray rows scattered outside any
tight cluster, treat those as **not** explained by this mechanism and
flag them for manual review rather than assuming the fix below covers
them.

---

# Migration File Created

`supabase/migration_v54_dedupe_multiproperty_room_photos.sql` (next
number after `migration_v53_investor_photo_reattribution_review.sql`).

Same two-part structure as v51 (SELECT to review, then DELETE), scoped
to only these 2 `property_id`s:

- **Part 0** — the batch-clustering root-cause query above (read-only).
- **Part 1** — pre-delete review `SELECT`: every row that is *not* the
  earliest `uploaded_at` within its `(property_id, normalized
  room_category)` group. For the confirmed counts, this should return 4
  rows for the Burnaby condo and 3 for the Surrey penthouse.
- **Part 2** — the matching `DELETE`, identical grouping/ordering logic.
- **Verification query** — confirms exactly 5 rows (one per required
  category: `living_room`, `kitchen`, `bathroom`, `bedroom`/`master
  bedroom` variant present in the data, `exterior`) remain per property.

**Known limitation of a DELETE-only fix — flagging, not guessing:** this
rule keeps whichever row is *oldest* in each category. That correctly
resolves every case in your evidence where a category has more than one
row (the actual duplicates). It does **not** fix a category that has
only a *single* row which is itself content-wise wrong — your own
evidence for the Surrey penthouse says the single `bathroom(1)` row is
visually a bedroom photo. If the true, correctly-labeled bathroom photo
for that unit exists at all in this data, it's most likely sitting
mislabeled under one of the other duplicated categories (`exterior(2)`
or `kitchen(2)`) rather than under `bathroom` — but confirming *which*
one requires looking at the actual images, which I can't do here. **Run
Part 1's SELECT, open the `image_url` for the surviving `bathroom` row
plus both `exterior` and `kitchen` rows for the Surrey property, and
visually confirm before running Part 2** — if the true bathroom photo is
one of the `exterior`/`kitchen` rows, add one manual `UPDATE
property_images SET room_category = 'bathroom' WHERE id = '<that
row's id>'` before deleting, so the fix doesn't delete the only correct
copy along with its wrong label.

---

# Confirmation: Current Update Preferences Fix Prevents Recurrence

**Yes — verified directly against the current source, not just the
redesign doc's claims:**

1. **No more array-position matching.** The new flow loads exactly one
   property, scoped by its real id and owner:
   `src/app/(dashboard)/dashboard/preferences/[id]/page.tsx:26-30` —
   `.eq("id", id).eq("owner_id", user.id).single()`, `notFound()`
   otherwise. There is no `currentProperties[i]` array walk anywhere in
   this path — confirmed by reading the file, not assumed.
2. **Saving updates that one row only**, by id:
   `src/components/property/property-edit-form.tsx:295-332` —
   `.update({...}).eq("id", property.id).eq("owner_id", user.id)`. No
   surplus-deletion pass exists in this component at all (the old
   `currentProperties.slice(propertyCount)` → bulk `DELETE` step that
   used to cascade-delete a whole property's photos is gone from this
   flow — it was specific to `src/app/forms/propietario/page.tsx`'s
   multi-property loop, which this new flow doesn't call).
3. **Photo uploads still route through the one existing dedup guard,
   now correctly scoped.** The edit form doesn't touch
   `property_images` itself — it links to
   `/dashboard/images?property=<id>` (confirmed: no `property_images`
   insert anywhere in `property-edit-form.tsx`). That page loads only
   the selected property's own images
   (`src/app/(dashboard)/dashboard/images/page.tsx:106-111`, `.eq(
   "property_id", selectedProperty)`) into local state, and before
   every insert checks the new file's `(normalizeRoom(room_category),
   original_filename, file_size_bytes)` fingerprint against that
   already-loaded, correctly-scoped list
   (`images/page.tsx:237-249`) — skipping the upload if it matches. Since
   `selectedProperty` is always the one real id the investor picked from
   the property list, this guard can no longer be fooled by a wrong
   `property_id` the way the old form's `propData.id` could be.
4. **The old buggy form still exists but is no longer reachable for this
   scenario.** `src/app/forms/propietario/page.tsx` is unmodified and
   still has the array-position logic — but the only remaining link to
   it from the dashboard
   (`src/app/(dashboard)/dashboard/page.tsx:526`) is the empty-state CTA
   shown only when an owner/investor has **no properties and no service
   tier yet** (first-time registration). At that point
   `currentProperties` is empty, so there is no existing row for the
   array-position bug to collide with — confirmed no other dashboard
   page links to `/forms/propietario` for an existing owner/investor
   (`grep` across `src/app/(dashboard)/` turns up only that one empty-state
   link, plus `properties/page.tsx`, `services/page.tsx`, and
   `preferences/page.tsx`, all of which point new/no-service users at
   registration, not existing-property editing).

**Conclusion:** for any property going forward, this specific
whole-batch-reinsertion pattern cannot recur through "Update
Preferences" — there is no array-index matching left in that path to
exploit. It remains only a historical artifact of submissions made
before this redesign shipped (commit `5ad122d`,
"Replace Update Preferences with per-property select-and-edit flow to
fix array-position property mismatch bug" — visible in this branch's
recent history), which is exactly what this migration cleans up.

---

# How To Apply (plain language)

1. Run Part 0 (batch clustering) and eyeball whether each property shows
   two tight batches, as predicted above. If it doesn't, stop and treat
   the extra rows as needing manual review instead of applying Part 2
   blindly.
2. Run Part 1 (the review `SELECT`) and confirm it returns exactly the 4
   Burnaby rows and 3 Surrey rows the counts imply. For the Surrey
   property specifically, also open the `image_url` for the *surviving*
   `bathroom` row and the `exterior`/`kitchen` rows before proceeding —
   per the flagged limitation above.
3. If the Surrey `bathroom` row is confirmed wrong and the true bathroom
   photo is found under another category, run one manual `UPDATE` to
   relabel it first.
4. Run Part 2 (the `DELETE`). It only touches `property_images` rows for
   these 2 `property_id`s — no Storage files, no other property, no
   other table.
5. Run the verification query and confirm each property now has exactly
   5 rows, one per required category.
6. This was not applied, committed, pushed, or deployed — that's a
   separate, deliberate step for whoever reviews this.

---

# Expected Result

Both properties (`0848dcc5-...` Burnaby condo, `8cbc5014-...` Surrey
penthouse) show exactly 5 `property_images` rows each — one per required
room category (`living_room`, `kitchen`, `bedroom`, `bathroom`,
`exterior`) — with no duplicate counts and no photo appearing under more
than one category. No Storage files are removed. No other property or
account is touched. Any residual single-row mislabeling that a
duplicate-count fix genuinely can't resolve on its own (the Surrey
`bathroom` case) is called out explicitly above rather than silently left
wrong or silently guessed at.
