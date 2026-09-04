# Payment History and Duplicate Photos Fix

Two unrelated bugs, investigated and fixed independently. Neither fix
touches Elite pricing/CFP/Payback/recurring-billing logic, Acquire
buttons, or Tenant/PYME/Basic/Preferred flows. No migration was applied,
no data was deleted, nothing was committed/pushed/deployed.

---

# Bug 1 — Payment History Root Cause and Fix

**Root cause: the `payments` insert for this Elite purchase most likely
failed silently at the database level, and separately, the page that
displays Payment History had a fragile read path that could hide every
row (not just this one) if it failed.**

### The write side (webhook)

`src/app/api/stripe/webhook/route.ts`, `checkout.session.completed`
handler, runs one shared `payments` insert for **every** checkout type
(Basic, Preferred, Elite, PYMES). Since the prior task
(`ELITE_RECURRING_BILLING_FIX.md`), that insert unconditionally includes
`property_id: metadata.property_id || null` — a column that only exists
once `supabase/migration_v50_payments_property_id.sql` (created, but
explicitly **not applied**, in that same prior task) has been run
against the database.

**If that migration has not yet been applied**, this INSERT fails at
the Postgres level with `column "property_id" of relation "payments"
does not exist` — for every checkout, not only Elite ones, though this
investor's Elite purchase is the one that was actually tested. The
webhook's own error handling made this invisible:

```ts
const { data: paymentData, error: paymentError } = await supabaseAdmin
  .from("payments").insert({ ... });
console.log("[webhook-diag] Payment insert completed", {
  data: paymentData, error: paymentError,   // ← logged, never escalated
});
```

Nothing inspected `paymentError` — it was just handed to `console.log`
at the same severity as a success, and the handler's outer `catch`
always returns `NextResponse.json({ received: true })` regardless (by
design, to stop Stripe retries on handler bugs — see the comment at the
end of the file). So the payment can be genuinely charged in Stripe,
the success page can correctly show "Payment Successful," and the
`payments` row can simply never exist — with zero visible error
anywhere except a buried `console.log` in Vercel's function logs. This
is the exact class of bug already documented elsewhere in this repo
(`WEBHOOK_SILENT_EARLY_EXIT_DIAGNOSTIC.md`, `SERVICE_ROLE_...` diagnostics).

I could not confirm from this sandbox whether migration v50 was applied
(no database access here — no `psql`/Supabase CLI/env vars available),
but this is the single most likely explanation given the timeline:
this exact column was added by that migration, in the immediately
preceding task, and explicitly deferred for manual application.

### The read side (Payment History page)

Separately — and this would matter even after the migration is applied
— the previous task's fix to `src/app/(dashboard)/dashboard/payments/page.tsx`
added an **embedded** relation to the query:

```ts
.select(`*, services:service_id (name), pymes_plans:pymes_plan_id (name),
  properties:property_id (address, city)`)
```

An embedded PostgREST relation query fails as **one atomic request** —
if the `property_id` foreign key isn't recognized yet (missing column,
or a schema-cache reload lag right after the migration is applied,
which is a known, separate PostgREST gotcha), the *entire* query
returns an error and `payments` comes back `undefined`, hiding **every**
payment row for that user, not just the Elite one. The page never
checked for a query error either — it just rendered "No payments yet."
For an investor whose only payment so far was this Elite purchase, that
looks exactly like "this one payment doesn't show up."

### Fix applied

1. **`src/app/api/stripe/webhook/route.ts`** — the main
   `checkout.session.completed` insert and the new `elite_maintenance`
   insert (from the prior task) now explicitly check their error and
   `console.error` it loudly with the session/subscription id and full
   metadata, instead of only `console.log`-ing an unchecked result. This
   doesn't change the "always return 200 to Stripe" behavior (out of
   scope to redesign here), but the next time any payments insert fails
   for any reason, it will be unmistakable in the logs instead of
   buried.
2. **`src/app/(dashboard)/dashboard/payments/page.tsx`** — replaced the
   embedded `properties:property_id (...)` join with a **separate**
   query for property labels (same "fetch once, build a lookup map"
   pattern already used for `property_images` in
   `dashboard/services/page.tsx`). Now, if `property_id` doesn't exist
   yet or the relationship isn't recognized, only the property's
   address/city label is missing for that row — every other payment
   (and the row itself, once it exists) still renders. Also added
   explicit error logging on both queries (`payments`, `properties`)
   instead of silently swallowing a failed fetch.
3. **`src/app/api/admin/stripe/reconcile/route.ts`** — this pre-existing
   admin tool (Stripe is source of truth; walks Stripe Checkout sessions
   and inserts any missing from `payments`) now also carries
   `property_id` from the session metadata into the recovered row, so a
   backfilled Elite payment still gets attributed to its property.

### Recovering the specific missing $1,650 payment

Once migration v50 is applied (see the prior task's report for the
exact SQL Editor steps), the already-completed Stripe charge for this
purchase can be recovered **without any manual data entry** by running
the existing reconciliation tool from `/admin/reports` (the "sync from
Stripe" action that calls `POST /api/admin/stripe/reconcile`) — it
matches Stripe's checkout sessions against `payments` by
`stripe_session_id` and inserts anything missing, now including
`property_id`. I did not run this myself (no admin session/DB access
here, and it's a financial-ledger write best triggered deliberately by
an admin).

---

# Bug 2 — Duplicate Photos Root Cause (data vs display) and Fix

**Verdict: DATA problem, not a display bug.** Both the Property Details
page and the Image Gallery page render a single flat `.map()` over
whatever `property_images` rows they fetch, keyed by the row's own
`id` — no double-mapping, no array concatenation, no nested-then-flat
re-render. If they show a photo twice, it's because the row genuinely
exists twice in the database.

### Root cause

`src/app/forms/propietario/page.tsx` — the owner/investor registration
wizard — is explicitly **also** the "update your preferences" flow for
existing owners (its own comment confirms this: *"This form is also the
owner/investor preference-update flow. Update the current brief instead
of creating a duplicate brief every time it is submitted."*). Accordingly,
the `properties` row is written correctly either way:

```ts
currentProperties[i]
  ? await supabase.from("properties").update(propertyPayload).eq("id", currentProperties[i].id)...
  : await supabase.from("properties").insert({ owner_id: user.id, ...propertyPayload })...
```

But the photo-upload code right after it has **no equivalent logic** —
it was a plain, unconditional insert loop on every submission:

```ts
for (const img of propertyImages) {
  ... upload to Storage ...
  await supabase.from("property_images").insert({ property_id: propData.id, room_category: img.room, ... });
}
```

Two things compound this into a near-guaranteed bug for any returning
owner:

1. `propertyImages` / `investorPropertyImages` are plain
   `useState<ImageWithMeta[]>([])` — **nothing preloads a returning
   owner's already-uploaded photos** when they reopen this form. It
   always starts empty.
2. Step-5 validation (`missingRoomsFor`, around line 468) blocks
   progressing to Submit unless the *in-memory* array covers all 5
   required rooms — even though the actual required photos are already
   safely stored in the database from the first submission. This
   **forces** the owner to re-add a photo per required room before they
   can save even an unrelated change (e.g., updating the rent).

Net effect: any owner who reopens `/forms/propietario` to edit anything
is required by the form itself to re-select a photo for every required
room, and submitting inserts a brand-new, fully redundant set of
`property_images` rows on top of the untouched originals — one full
duplicate set per resubmission. There is also no database constraint
that would have stopped this (`property_images` has no unique
constraint on `property_id` + `room_category` + filename or similar).

### Fix applied (prevents future duplicates, touches no existing data)

Added a **dedup guard** immediately before each `property_images`
insert, in both places this form writes images
(`src/app/forms/propietario/page.tsx`, the investor per-property loop
and the single-owner block): before inserting, it fetches the
property's already-stored `(room_category, original_filename,
file_size_bytes)` once, and skips (both the Storage upload and the DB
insert) any staged photo whose room + original filename + file size
already matches an existing row. Room-category comparison is normalized
(lowercase, non-alphanumerics stripped) so cosmetic differences like
`"Living Room"` vs `"living_room"` don't defeat the check.

The same guard was added to the Image Gallery's own single-file upload
handler (`src/app/(dashboard)/dashboard/images/page.tsx`,
`handleUpload`) for defense-in-depth, checking against the images
already loaded for that property and showing an inline "already
uploaded — skipped" message instead of silently duplicating.

**This does not fix the underlying UX problem** that a returning owner
is still forced to re-select a photo per required room every time they
reopen the form (the validation still checks the empty in-memory
array) — it only stops that friction from polluting the database. A
proper fix for the UX itself (preloading existing photos into the
form, or relaxing step-5 validation when `currentProperties[i]` already
has covered rooms in the DB) is a larger, riskier change — it touches a
submission gate that blocks real owners from saving at all if done
incorrectly, and I could not run the app here to verify it end-to-end.
I did not attempt it in this pass; see "What Was Intentionally Not
Changed" below.

`src/app/forms/propietario/add-property/page.tsx` (the separate "add
one more property" flow) has the same unconditional insert loop, but is
**insert-only by design** — it never re-associates with an existing
property id, so the specific resubmission mechanism above doesn't apply
to it the same way. Left unmodified.

### Existing duplicate rows — needs manual review, not deleted

I did not delete anything. To find rows that are already duplicated
under this exact definition (same property, room, filename, and size),
run this **read-only** query in the Supabase SQL Editor:

```sql
SELECT property_id, room_category, original_filename, file_size_bytes,
       COUNT(*) AS duplicate_count,
       array_agg(id ORDER BY uploaded_at) AS row_ids_oldest_first
FROM property_images
GROUP BY property_id, room_category, original_filename, file_size_bytes
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;
```

Each returned group is a set of rows that are byte-for-byte the same
upload repeated. If confirmed, the usual safe cleanup is to keep the
first id in `row_ids_oldest_first` (the original upload) and delete the
rest — but that's a decision for whoever owns this data, not something
I should do unilaterally. Two things to check before deleting anything:
whether any duplicate has already been individually approved/rejected
by admin review (`status` column) in a way that differs from its
sibling rows, and whether Storage cleanup (the now-orphaned uploaded
files) is also wanted — this query only looks at the `property_images`
table, not Storage.

---

# Bug 2 — Category Mixing Investigated

This is a **separate, real issue** from the duplication above, not the
same root cause — it comes from two independent, uncoordinated
room-category vocabularies feeding the same `room_category` column:

- `src/components/forms/image-upload.tsx` (registration wizard):
  hardcoded local list — `living_room, bedroom, kitchen, bathroom,
  dining_room, office, balcony, exterior, common_areas, parking`.
- `src/lib/constants.ts`'s `ROOM_CATEGORIES` (Image Gallery's upload
  dropdown): `Living Room, Kitchen, Master Bedroom, Bedroom 2, Bedroom
  3, Bathroom, Balcony/Terrace, Exterior, Common Areas, Other`,
  canonicalized at write time to lowercase-with-underscores.

These are not the same taxonomy: registration writes plain `"bedroom"`
and `"balcony"`; the Image Gallery writes `"master_bedroom"` /
`"bedroom_2"` / `"bedroom_3"` and `"balcony/terrace"` — there's no
1:1 mapping. A photo the owner considers "the bedroom" can end up
labeled completely differently depending on which of the two upload
entry points they used, which reads as "photos mixed into the wrong
category" even though each individual row is labeled exactly as its
own uploader intended.

**I did not unify these two lists in this pass.** The registration
form's required-rooms submission gate
(`REQUIRED_ROOMS_FOR_FORM = ["living_room", "kitchen", "bedroom",
"bathroom", "exterior"]`, `src/app/forms/propietario/page.tsx` line
~468) does an **exact string match** against whatever vocabulary
`image-upload.tsx` produces. Swapping that component's list for
`constants.ts`'s Title-Case list would remove the literal value
`"bedroom"` entirely (replaced by `master_bedroom`/`bedroom_2`/
`bedroom_3`), which would make it **impossible for any owner to pass
the required-rooms check and submit the form** — a change I could not
safely verify end-to-end without a running dev server in this
environment. Unifying the taxonomy is a real fix worth doing, but it
needs to also update (or make tolerant, the way
`dashboard/images/page.tsx`'s `matchesRoom` already loosely handles
"bedroom\*") the required-rooms gate at the same time, as one
deliberate, testable change — not bundled into this bug-fix pass.

Secondary, minor contributor also observed: the Image Gallery's manual
uploader has one shared "Room Category" dropdown for all uploads in a
session; it isn't reset per file, so uploading several different rooms'
photos in a row without changing the dropdown between each would file
them all under whichever category was last selected. This is normal
single-select-then-upload UX (not obviously a bug to "fix" — resetting
it after each upload could equally be seen as annoying), so I left it
as-is and am only noting it here as something to watch for.

---

# Files Modified

- `src/app/api/stripe/webhook/route.ts` — explicit `console.error` on
  the main `checkout.session.completed` payments insert and the
  `elite_maintenance` recurring-invoice insert when they fail.
- `src/app/(dashboard)/dashboard/payments/page.tsx` — replaced the
  embedded `properties:property_id (...)` join with a decoupled
  fetch-and-merge (same pattern as `property_images` elsewhere in the
  app); added error logging on both queries.
- `src/app/api/admin/stripe/reconcile/route.ts` — carries `property_id`
  from Stripe session metadata into a recovered/backfilled payment row.
- `src/app/forms/propietario/page.tsx` — added `normalizeRoomForDedup`
  / `imageFingerprint` helpers and a dedup guard before each of the two
  `property_images` insert loops (investor per-property, single owner).
- `src/app/(dashboard)/dashboard/images/page.tsx` — added the same
  dedup guard to the manual single-file upload handler; extended the
  local `PropertyImage` type with `original_filename`/`file_size_bytes`
  (already selected via `select("*")`, just not previously typed) so
  the guard can read them.

# What Was Intentionally Not Changed

- Elite portfolio breakdown, Acquire buttons, CFP/Payback, and
  recurring-billing subscription logic — not touched.
- Tenant, PYMES, and unrelated Basic/Preferred Owner code paths — not
  touched.
- `supabase/migration_v50_payments_property_id.sql` was not applied
  (still requires manual application in the Supabase SQL Editor, per
  the prior task's instructions).
- No existing `payments` or `property_images` row was deleted, updated,
  or backfilled — the missing payment can be recovered via the existing
  `/admin/reports` → Stripe reconcile action once the migration is
  applied; existing duplicate photo rows are reported with a read-only
  query for manual review, not deleted.
- The room-category taxonomy mismatch was diagnosed but not unified,
  because doing so safely also requires updating the required-rooms
  submission gate, and I had no way to verify that change end-to-end in
  this environment (no Node/npm installed, no dev server).
- `src/app/forms/propietario/add-property/page.tsx` was reviewed but
  not modified (insert-only flow, doesn't share the same
  resubmission-duplication mechanism).
- No commit, push, or deploy.

# Expected Result

- Once `migration_v50_payments_property_id.sql` is applied and the
  missing $1,650 payment is recovered via the admin Stripe-reconcile
  action, it will appear in Payment History labeled by the property's
  address, exactly like Basic/Preferred purchases already do.
- Any future payments-recording failure (missing column, RLS/grant
  issue, or otherwise) will now log loudly as `console.error` instead
  of disappearing into an unchecked `console.log`.
- A failed or stale property-label lookup on the Payment History page
  can no longer hide a user's entire payment list — only that one row's
  address label would be missing.
- Reopening the owner/investor registration form to edit a property no
  longer creates a duplicate set of `property_images` rows for photos
  already on file; genuinely new or replaced photos still upload
  normally.
- Existing duplicate rows (if the SQL check above confirms any) remain
  in place until a human reviews and decides what to clean up.
- The category-vocabulary mismatch is documented with a clear,
  actionable next step, but intentionally not changed in this pass to
  avoid risking the required-rooms submission gate without the ability
  to test it live.

**Not verified in a running environment:** as in the prior two tasks,
this sandbox has no Node/npm installed, so none of these changes could
be exercised in a browser or against a real Supabase instance. Recommend
testing, before merging: (1) resubmitting the owner form for an existing
property with the same photos staged, confirming no new
`property_images` rows appear; (2) a fresh Stripe test purchase after
applying migration v50, confirming it now appears in Payment History
immediately; (3) running the read-only duplicate-detection query against
the real database to see the actual scope of existing duplicates.
