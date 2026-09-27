# Remaining Duplicate Photos Diagnostic

**Diagnostic only. Nothing was queried, modified, deleted, or fixed in
this task** — this sandbox has no database access (no `psql`/Supabase
CLI/env vars available), so I could not run the queries below myself.
Everything under "Full property_images Rows" is the exact query to run,
not actual results. Everything else is a code trace of
`src/app/forms/propietario/page.tsx`, cross-checked against the two
prior reports that touch this exact flow
(`PAYMENT_HISTORY_AND_DUPLICATE_PHOTOS_FIX.md`,
`DISCOVERY_BRIEF_UPDATE_NOT_DUPLICATE_FIX.md`).

**Bottom line, up front:** this is very likely **not** a leftover from
the original bug. It looks like a **second, still-live** bug in the
*same* "Update Preferences" flow — introduced by the very fix that was
meant to stop investor properties from duplicating
(`DISCOVERY_BRIEF_UPDATE_NOT_DUPLICATE_FIX.md`). See Section 3/4 for why.

---

# Full property_images Rows For Both Affected Properties

I don't have the property IDs, so run this by address/city/type match
first to identify them, then pull every row:

```sql
-- Step 1: find the two properties by the identifying details given.
SELECT id, owner_id, address, city, property_type, monthly_rent,
       created_at
FROM properties
WHERE (city ILIKE '%burnaby%' AND property_type ILIKE '%condo%')
   OR (city ILIKE '%surrey%' AND property_type ILIKE '%penthouse%')
ORDER BY owner_id, created_at;

-- Step 2: once you have their ids (or just reuse the WHERE above via a
-- join), pull every property_images row for both.
SELECT pi.id, pi.property_id, p.address, p.city,
       pi.room_category, pi.original_filename, pi.file_size_bytes,
       pi.image_url, pi.uploaded_at, pi.status
FROM property_images pi
JOIN properties p ON p.id = pi.property_id
WHERE (p.city ILIKE '%burnaby%' AND p.property_type ILIKE '%condo%')
   OR (p.city ILIKE '%surrey%' AND p.property_type ILIKE '%penthouse%')
ORDER BY p.address, pi.room_category, pi.uploaded_at;
```

**Also run this** — it matters for Section 3/4's hypothesis. Pull every
property belonging to the *same owner* as these two (not just these
two), ordered by `created_at`, and check `property_type`/`monthly_rent`
against what you know is actually true for each unit:

```sql
SELECT id, address, city, property_type, monthly_rent, bedrooms,
       bathrooms, elite_tier, created_at
FROM properties
WHERE owner_id = (
  SELECT owner_id FROM properties
  WHERE city ILIKE '%burnaby%' AND property_type ILIKE '%condo%'
  LIMIT 1
)
ORDER BY created_at ASC;
```

If this owner has **4 or more properties** and the Condo/Penthouse are
two of them, that's the scenario Section 3 below describes — go
straight there. If this owner has fewer than 4 properties, the investor
per-property code path in Section 3 never runs for them at all (it's
gated on `propertyCount >= 4`), and the explanation must be something
else — re-check the single-owner branch (`src/app/forms/propietario/page.tsx`
lines 777-874) instead, and treat Section 3/4 as inapplicable.

---

# Why These Weren't Caught By The Original Exact-Duplicate Query

The original diagnostic query (and the dedup guard shipped in
`PAYMENT_HISTORY_AND_DUPLICATE_PHOTOS_FIX.md`) both group/match on the
**same four columns**: `property_id, room_category, original_filename,
file_size_bytes`. Any repeat that differs on even one of those columns
is invisible to both:

- **Different `room_category`** — the reported mislabeling (a bathroom
  photo appearing as both `"kitchen"` and `"living_room"`) means, by
  definition, these two rows do **not** share `room_category`. The
  original query's `GROUP BY` would never put them in the same group,
  and the dedup guard's fingerprint (`room + filename + size`) would
  never match them either — both would treat these as two unrelated,
  legitimate photos, not a duplicate.
- **Different `property_id`** — if these rows are attached to a
  *different* property than the one the user originally uploaded them
  for (see Section 3), the query's `PARTITION BY property_id` /
  `GROUP BY property_id` never compares them against each other at all,
  even if everything else matched.

So this isn't a gap in the counting logic (still exactly the same
grouping, still correct for what it's designed to catch) — it's that
these rows most likely never had matching `room_category` and/or
`property_id` in the first place, for the reason in the next section.
`kitchen` and `living_room` are not two spellings of the same room in
either known vocabulary (`image-upload.tsx`'s
`living_room/bedroom/kitchen/bathroom/...` or `constants.ts`'s
`ROOM_CATEGORIES`) — they're unrelated categories — which argues
against the already-documented taxonomy-casing mismatch being the
explanation here (more on this in Section 5).

---

# Update Preferences Flow Traced Step-By-Step (does the dedup guard actually check against previously-saved photos, or only within the current submission?)

The dedup guard **does** check against the database, not just the
current in-memory submission — confirmed by reading
`src/app/forms/propietario/page.tsx` lines 719-761 (investor path) and
830-874 (single-owner path): immediately before each upload loop, it
runs `supabase.from("property_images").select(...).eq("property_id",
propData.id)` and skips any staged photo whose `(room, filename, size)`
already matches a row already in the database for `propData.id`. That
part works as designed, **provided `propData.id` is the correct
property.**

The bug is one level up — in how `propData.id` is decided for the
investor multi-property path:

1. On submit, the code fetches this owner's existing `properties` rows,
   ordered by `created_at ascending`, into `currentProperties` (line
   615-622). It does **not** fetch or preload any of their existing
   *field data* (address, rent, photos, etc.) into the form —
   `investorProps` starts as `useState<InvestorPropertyData[]>([])`
   (line 279) and is only ever populated by whatever the user types
   into the form **this session** (`syncInvestorProps`, around lines
   378-416). There is no `useEffect` anywhere in this file that loads
   an existing property's data back into `investorProps` for editing.
2. The investor then re-enters their properties into the multi-property
   wizard (Property 1 of N, Property 2 of N, ...) **from a blank form,
   in whatever order they happen to fill them in this time.**
3. On submit, `for (let i = 0; i < propertyCount; i++)` walks
   `investorProps[i]` (this session's re-entered data, in this
   session's order) and matches it against `currentProperties[i]`
   (the database's oldest-first order) **purely by array index** — line
   700: `currentProperties[i] ? update(...).eq("id", currentProperties[i].id) : insert(...)`.
   There is no address, no stable ID carried from the database into the
   form, no matching key at all besides "which slot is this in the
   array right now."
4. **If the investor enters their properties in a different order this
   time than the order those rows were originally created in**, step 3
   silently `UPDATE`s the wrong `properties` row — e.g. the Penthouse's
   freshly re-entered data gets written onto the Condo's original row
   (`currentProperties[0]`, the oldest), because it happened to be
   filled in as "Property 1" this time.
5. Immediately after, the per-property photo block (line 719 onward)
   runs the dedup guard against `propData.id` — which is now the
   **wrong physical property's row**. The guard correctly finds no
   fingerprint match (it's comparing e.g. the Penthouse's new bathroom
   photo against whatever the Condo's bathroom photo fingerprints are),
   so it inserts the "new" photo anyway — attached to the Condo's
   `property_id`, carrying whatever `room_category` the user picked for
   it in *this* session.

Net effect over two or more "Update Preferences" resubmissions with
inconsistent re-entry order: a single `properties` row can accumulate
photos (and field data) from **more than one real-world unit**,
labeled with whatever room categories were correct for whichever
submission actually produced them. Viewed on that property's page, this
reads exactly as "duplicated bathroom photo" (multiple bathrooms from
different real units) and "wrong room label" (a photo that's correctly
labeled for the property it was *actually* uploaded for, but is now
attached to a different one) — without ever tripping the exact-duplicate
check, because `room_category` and/or `property_id` genuinely differ
between the rows.

This also explains why this is specific to the **investor,
multiple-properties** path and not the single-owner path: the
single-owner branch (line 814, `currentProperties[0]`) only ever has one
candidate row, so there's no ordering to get wrong. It's also specific
to accounts with **4+ properties**, since `isInvestorSubmit` requires
`propertyCount >= 4` (line 562) — matching that the original 12
duplicate rows already spanned exactly 4 properties, and raising the
real possibility that all 4 of those original properties belong to the
same one investor account, not four unrelated owners.

The **surplus-deletion step right after** (line 767:
`currentProperties.slice(propertyCount)` → `DELETE ... IN
(surplusPropertyIds)`, cascading to that row's `property_images`) is
the same index-trust taken to its most destructive extreme: if a
resubmission has *fewer* properties than before, whichever DB rows land
past the new `propertyCount` in the `created_at`-ordered list are
deleted outright — regardless of whether they're actually the "same"
properties the user meant to keep, if re-entry order shifted. I did not
find evidence this specific case is what happened here (both properties
still exist), but it's the same root cause and worth naming since it's
strictly more destructive than photo mislabeling.

---

# Forward-Looking Safety: Would Clicking "Update Preferences" Today Reproduce This?

**Yes — this is still live, for any Investor with 4+ properties, right
now.** Nothing in the codebase changed between the original 12-row
cleanup and today that touches this matching logic. The specific
trigger is: **the investor re-entering their properties in "Update
Preferences" in a different order than those properties were originally
created in** (or, equivalently, in a different order than
`currentProperties`'s `created_at ASC` sort). The form gives the
investor no cues about what order to use — it doesn't show their
existing properties or preload any of their data — so there is nothing
stopping this from happening on the very next submission, by any
investor, at any time, with no error or warning shown.

**Not affected by this specific bug:** Property Owners with a single
property (the `currentProperties[0]` branch has no ordering to get
wrong), and Investors resubmitting in the *same* order every time
(they'd keep getting lucky, is all — nothing about the code guarantees
this, it's just quieter when it happens to align).

This is the single most important finding in this report: **the fix
should be applied, or "Update Preferences" should be disabled for
multi-property investors, before any more of these resubmissions
happen** — every one is a chance to further scramble a 4+-property
investor's portfolio.

---

# Room Category Mislabeling Investigated

Not the already-documented taxonomy mismatch. That prior finding
(`PAYMENT_HISTORY_AND_DUPLICATE_PHOTOS_FIX.md`, "Bug 2 — Category
Mixing") is about the **same conceptual room** getting different
*spellings* depending on upload entry point — e.g. `"bedroom"` vs.
`"master_bedroom"`/`"bedroom_2"`/`"bedroom_3"`, or `"balcony"` vs.
`"balcony/terrace"`. It does not produce `"kitchen"` or `"living_room"`
as an alternate spelling of `"bathroom"` — those are simply different
rooms in both known vocabularies, not variants of each other.

The far more likely explanation, consistent with everything in Section
3: the photo genuinely **was** a kitchen or living-room photo, correctly
labeled, for a *different* one of this investor's properties — and
landed on the Condo/Penthouse property only because of the index-based
`property_id` misattribution during a resubmission. From the affected
property's page, that shows up as "a photo that doesn't belong here,
mislabeled" even though the label was correct for whatever property it
was actually uploaded against. The two rows pulled in Section 1 (real
`image_url` values) would confirm this directly: if the "duplicate"
bathroom-looking photo's `image_url` points to a Storage path under
`properties/<a-different-property-id>/...` rather than the affected
property's own id, that's conclusive.

---

# Recommended Fix (describe only, do not implement)

1. **Stop matching properties by array position.** `investorProps` (and
   the DOM/state array behind it) needs a stable identifier — the
   simplest is to preload `currentProperties` into `investorProps` when
   "Update Preferences" opens (pairing each pre-filled form slot with
   its real `property.id`) instead of starting from an empty array the
   investor re-fills blind. Then match on that carried `id` at submit
   time, never on `currentProperties[i]` vs `investorProps[i]` by index.
2. **Until that's done, treat "Update Preferences" as unsafe for any
   investor with more than one property** — it doesn't just risk
   duplicate photos, it can silently overwrite one property's saved
   details (rent, address, amenities, everything in `propertyPayload`)
   with another's, and (via the surplus-deletion step) can delete an
   entire property + its photos if the re-submitted count is smaller
   than before and the ordering has drifted. Worth flagging to whoever
   owns this data as a "don't use this button for multi-property
   investors yet" heads-up, independent of the photo cleanup.
3. Once fixed, this specific investor's portfolio (and any other
   investor who has used "Update Preferences" more than once) should be
   manually re-audited — the fix stops *new* mismatches, it doesn't
   un-scramble whatever has already happened to `properties` field data
   or `property_images` attribution from past resubmissions. The
   queries in Section 1, run against every 4+-property investor
   (not just this one), would surface anyone else already affected.
4. Once the property-matching bug is fixed, the *existing* mislabeled
   photos found in Section 1 can be re-run through the same
   review-then-migrate process as `migration_v51_dedupe_property_images.sql`
   — but this time the "duplicate" definition needs a human to confirm
   which property each photo actually belongs to (by content, not by
   `room_category` string matching), since the rows themselves may
   currently sit on the wrong `property_id` rather than being a clean
   exact-duplicate group. That's a data-repair task, not a schema
   migration, and shouldn't be automated without someone visually
   confirming each photo's true property.
