A note before the per-role sections: the task description refers to a
shared component `src/components/profile/privacy-consent-card.tsx` and
"Property Owner, Investor, and PYME profile pages" as if these were
separate files/routes. Neither exists — as reported in
`TENANT_PROFILE_CONSENT_TOGGLES_REMOVED.md`, there is exactly **one**
shared route, `src/app/(dashboard)/dashboard/profile/page.tsx`, used by
every role, with the "Privacy & Consent" card inline in that file (not a
separate component). The previous pass gated the card out for Tenant only
via an `isTenantRole` check inside that one file. This pass extends the
same gate to Owner/Investor/PYME, which produces exactly the outcome the
task asks for — the sections below describe that outcome per role, even
though the underlying change is one shared conditional, not three
separate removals.

# Removed From Property Owner Profile

Added `isOwnerRole` (`profile.role === "propietario" ||
"propietario_preferido" || "inversionista"` — the same role grouping
used elsewhere in this codebase, e.g. `src/app/(dashboard)/dashboard/services/page.tsx`)
and included it in `hideConsentCard`. A Property Owner (and Preferred
Owner) visiting `/dashboard/profile` no longer sees the "Privacy &
Consent" card — same toggle set removed as for Tenant (Data Processing,
Image Usage, Marketing Communications, Third-Party Sharing).

# Removed From Investor Profile

Investor uses role `inversionista`, included in the same `isOwnerRole`
check above (Investor and Property Owner share this role group throughout
the codebase, e.g. the owner-tier logic in `/dashboard/services`). No
separate handling was needed — the same condition covers Investor.

# Removed From PYME Profile

Added `isPymesRole` (`profile.role === "pymes"`) and included it in
`hideConsentCard`. A PYME/Business Owner visiting `/dashboard/profile`
no longer sees the "Privacy & Consent" card.

---

The combined gate is:

```ts
const hideConsentCard = isTenantRole || isOwnerRole || isPymesRole;
...
{!hideConsentCard && (
  <Card>{/* Privacy & Consent */}</Card>
)}
```

The only role now still able to see the card (if it ever reaches this
page) is `admin` — left untouched since the task scope was Tenant (done
previously) + Owner/Investor/PYME (this pass), and admin was never
mentioned. The card's markup, `CONSENT_DESCRIPTIONS`, `ConsentState`,
`handleConsentChange`, and the consent-log loading effect are all still
present in the file, unchanged — this is a render-time gate, not a
deletion, so re-enabling it for any role later is a one-line change.

Registration-time consent checkboxes (Terms of Service, Privacy Policy,
etc. on `/forms/propietario`, `/forms/pymes`, `/forms/inquilino`) are a
separate code path entirely and were not touched.

# Files Modified

- `src/app/(dashboard)/dashboard/profile/page.tsx` — added `isOwnerRole`
  and `isPymesRole`, combined with the existing `isTenantRole` into a
  single `hideConsentCard` boolean gating the "Privacy & Consent" `<Card>`.
  No other section of the page was changed.

# Expected Result

- Property Owner, Preferred Owner, Investor, and PYME/Business Owner
  profiles at `/dashboard/profile` now show only "Personal Information" —
  no "Privacy & Consent" card, matching Tenant's already-fixed view.
- All four customer-facing roles (Tenant, Owner, Preferred Owner,
  Investor, PYME) now have an identical, toggle-free "My Profile" page.
- Registration-time consent checkboxes for every role are untouched and
  remain the sole mechanism for capturing those consents.

## Not verified

No `node_modules` are installed in this environment, so I could not run a
type-check, build, or the dev server to visually confirm each role's
profile view in a browser. The change extends the exact same, already-
applied conditional pattern from the Tenant pass to two more role checks,
so risk is low, but a quick smoke test as an Owner, an Investor, and a
PYME account is still worth doing before merging.
