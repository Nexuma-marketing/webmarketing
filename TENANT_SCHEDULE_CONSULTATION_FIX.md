# Fix Implemented (reused consultation flow, Tenant-specific subject text)

## Where the button lived

Tenant's "Schedule a Free Consultation" button is the generic footer CTA
at the bottom of `/dashboard/services`
(`src/app/(dashboard)/dashboard/services/page.tsx`, `id="contact"`
section) — shared by every role. Before this fix it always linked to
`/#contact` (the public homepage's anonymous Contact Us form), for
Tenant and every other role alike.

## Generalizing the consultation page instead of duplicating it

`src/app/(dashboard)/dashboard/consultation/page.tsx` (built for PYME)
previously hardcoded `<input type="hidden" name="role" value="pymes" />`
and only computed a subject from an optional `?plan=` query param. Per
the task, this was **generalized in place, not duplicated**:

1. **Role is now read from the authenticated profile** instead of
   hardcoded: `select("full_name, phone, role, is_premium_tenant")`, and
   the hidden `role` field now sends `profile?.role` directly. For a PYME
   user this value is still literally `"pymes"` — same string, same
   downstream behavior in `/api/contact` (same `ALLOWED_ROLES` set
   already includes `inquilino`/`inquilino_premium`/`pymes`), so **PYME's
   functional output is unchanged**.
2. **Subject text is now role-aware**:
   - `?plan=<name>` present (PYME's entry point, unchanged) →
     `"Consultation request — <name> plan"` — identical to before.
   - No `plan` param, Tenant role → reuses `matchPropertiesForTenant()`
     from `src/lib/profiling.ts` (the exact same matching logic already
     used for the tenant-facing "Matched Properties" list on
     `/dashboard/services`, not a reimplementation) to check for an
     existing top match:
     - Match found → `"Consultation request — interested in <address>"`.
     - No match yet → `"Consultation request — Tenant"` or
       `"Consultation request — Premium Tenant"` (based on
       `profile.is_premium_tenant`, same premium-labeling convention used
       elsewhere in the dashboard).
   - Any other case (no plan, not a tenant) → `"Consultation request"`,
     the original fallback, unchanged.
   - All subject values still pass through the existing
     `sanitizeForSubject()` newline-stripping guard, unchanged.
3. Everything else on the page — pre-filled name/phone/email (editable),
   no "I am a..." role picker, `redirect_to=/dashboard/consultation`,
   the three `contact=success/email_pending/error` status banners, the
   `/api/contact` submit target — is untouched.

## Wiring Tenant's button

In `src/app/(dashboard)/dashboard/services/page.tsx`, the footer link's
`href` is now conditional on the already-existing `isTenantRole` flag:

```tsx
href={isTenantRole ? "/dashboard/consultation" : "/#contact"}
```

Owner, Investor, and PYME still get `/#contact` from **this specific
button** — only Tenant was in scope for this pass. PYME's own dedicated
"Schedule a Consultation" button on their plan card
(`src/components/dashboard/pymes-plan-card.tsx`) was not touched and
still links to `/dashboard/consultation?plan=<name>` exactly as before.

# Files Modified

- `src/app/(dashboard)/dashboard/consultation/page.tsx` — generalized:
  role now read from `profiles.role` instead of hardcoded `"pymes"`;
  added Tenant-specific default-subject logic (matched-property lookup
  via the existing `matchPropertiesForTenant()`, Premium/standard
  labeling); updated comments to reflect the page now serves multiple
  roles. PYME's `?plan=` behavior and output are unchanged.
- `src/app/(dashboard)/dashboard/services/page.tsx` — the footer
  "Schedule a Free Consultation" link's `href` is now conditional on
  `isTenantRole`; no other change to that section or any other role's
  behavior in this file.

# Expected Result

- A Tenant clicking "Schedule a Free Consultation" on
  `/dashboard/services` now lands on `/dashboard/consultation` with:
  - Name, phone, and email pre-filled from their profile (editable).
  - No "I am a..." role picker — role is sent as a hidden field with
    their actual role.
  - Subject pre-filled with `"Consultation request — interested in
    <address>"` when they have a matched property, otherwise
    `"Consultation request — Tenant"` / `"— Premium Tenant"` — fully
    editable.
  - Submitting sends through the same `/api/contact` flow as PYME
    (lead insert + `sendContactNotification`, commercial + customer
    emails, redirect back to `/dashboard/consultation?contact=...`).
- PYME's existing consultation flow (via their plan card) behaves
  identically to before — same URL shape, same hidden role value
  (`"pymes"`), same plan-named subject.
- Property Owner and Investor's footer "Schedule a Free Consultation"
  button still goes to the public `/#contact` form, unchanged.
- The anonymous public Contact Us form itself was not touched.

## Not verified

No `node_modules` are installed in this environment, so I could not run
a type-check, build, or the dev server to click through this flow as a
Tenant or re-confirm PYME's unchanged behavior in a browser. The PYME
path was reasoned through line-by-line to confirm identical output
(same hidden role string, same subject format when `?plan=` is present),
and the new Tenant path reuses an already-working matching function
verbatim — but an end-to-end smoke test (as a Tenant with and without a
match, and as PYME via their plan card) is worth doing before merging.
