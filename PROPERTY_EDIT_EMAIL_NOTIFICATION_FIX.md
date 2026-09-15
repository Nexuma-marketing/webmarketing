# Email Added (customer + commercial content)

The per-property "Update Preferences" flow (`/dashboard/preferences/[id]`)
saved changes successfully but never sent any email. This adds two emails,
sent after a successful save:

- **Commercial team** — "Property Updated" notification with the customer's
  name, email, and the property's address/city. Per the task's own
  instruction not to over-engineer a diff, it does not attempt to compute
  which fields changed; the subject and body simply identify which property
  was updated (`Property Updated — {address}, {city}`).
- **Customer** — confirmation email ("Property updated") that repeats the
  property address/city so they know their save was received, with a link
  back to `/dashboard/preferences`.

Both reuse the addressed property's `address` and `city` as submitted in
the same form save (so the confirmation reflects the just-saved values, not
stale ones).

# Reused Pattern/Infrastructure

Reused verbatim from `owner-submit-email` / `tenant-submit-email`:

- Same Resend setup: `RESEND_API_KEY` env check → skip silently if absent
  (`{ success: true, skipped: true }`), `RESEND_FROM_EMAIL` /
  `COMMERCIAL_AREA_EMAIL` env vars with the same fallbacks.
- Same recipients: commercial team (comma-split `COMMERCIAL_AREA_EMAIL`) +
  the authenticated customer (`user.email` primary, `profile.email`
  fallback).
- Same send pattern: both emails queued into a `Promise.allSettled` array
  so one failing send never blocks the other.
- Same per-recipient result checking: iterate `results`, log
  fulfilled/rejected per recipient label, and only report `emailSent: true`
  if at least one actually sent.
- Same template style/colors (`#0B38D9` / `#0FA37F` gradient header, same
  table layout for details, same footer).

No existing route's logic (owner-submit-email, tenant-submit-email, or any
Tenant/PYME preferences email flow) was modified — this is a **new** route
that follows their pattern, since owner-submit-email is tied to
Discovery-Brief-registration-specific content (property count, tier,
cities/rents) and is already invoked from unrelated flows
(`propietario/page.tsx`, `add-property/page.tsx`). Reusing it directly
for "property updated" would have required branching its request/response
shape and risked those existing callers.

# Files Modified

- **New:** [src/app/api/property-edit-email/route.ts](src/app/api/property-edit-email/route.ts)
  — the new email route, modeled on `owner-submit-email/route.ts`.
- **Modified:** [src/components/property/property-edit-form.tsx](src/components/property/property-edit-form.tsx)
  — after `router.refresh()` / `setSaved(true)` in `onSubmit` (line ~349),
  added a fire-and-forget `fetch("/api/property-edit-email", …)` call with
  `.catch()` logging only, so a failed email can never surface as a save
  failure or block/alter the existing success UX. Save logic, validation,
  and the success banner/"Done" button flow are untouched.

# Expected Result

When a Property Owner, Preferred Owner, or Investor saves changes on
`/dashboard/preferences/[id]`:

1. The existing save (unchanged) persists to `properties` and re-runs
   profiling, exactly as before.
2. The success banner ("Property updated successfully.") still appears
   immediately — email sending does not block or gate it.
3. In the background, `/api/property-edit-email` fires: the commercial
   team receives a "Property Updated — {address}" notification, and the
   customer receives a "Your property update is confirmed" email
   confirming the address that was saved.
4. If `RESEND_API_KEY` is not configured (e.g. local dev), the route
   no-ops (`skipped: true`) — no error is thrown, matching the existing
   owner/tenant email routes' behavior.
5. If either send fails (bad recipient, Resend outage, etc.), it's logged
   server-side per recipient and does not affect the other send or the
   already-completed save/UX.
