# Privacy & Consent Card Removed From Tenant Profile

`src/app/(dashboard)/dashboard/profile/page.tsx` is the **single shared
"My Profile" page for every role** — there is only one route
(`/dashboard/profile`, one sidebar link, no per-role variant) and, before
this change, no role branching inside the file at all. The "Privacy &
Consent" card (Data Processing / Image Usage / Marketing Communications /
Third-Party Sharing toggles, backed by `consent_logs` via
`handleConsentChange` → `logConsents()`) rendered unconditionally for
every profile that loaded this page.

Fix: added `isTenantRole` (`profile.role === "inquilino" ||
"inquilino_premium"`) and wrapped the entire Consent Management `<Card>`
in `{!isTenantRole && (...)}`. A Tenant now never sees this card — not
even a stripped-down version — while Owner/Investor/PYME still see the
exact same card as before, unchanged.

This is a role-gate, not a deletion of the component: the toggle markup,
`CONSENT_DESCRIPTIONS`, `ConsentState`, `handleConsentChange`, and the
consent-log loading effect are all still in the file, intact, so Owner/
Investor/PYME behavior is byte-for-byte identical to before. Nothing about
registration-time consent capture was touched — Terms of Service, Privacy
Policy, etc. checkboxes on `/forms/inquilino`, `/forms/propietario`, etc.
are a completely separate code path (`logConsents` called at registration
time, not this page) and were not modified.

# Same Pattern Found On Other Roles? (report only)

**Yes — this is not a separate "same pattern," it is the literal same
component and route.** `/dashboard/profile/page.tsx` had zero role
branching before this change, so Property Owner, Investor, and PYME
profiles all render the identical "Privacy & Consent" toggle card today,
including:

- The same "Image Usage" toggle worded *"Allow us to use uploaded
  property images in marketing materials"* — this literally applies to
  Property Owner/Investor (they upload property images), so it's not
  obviously wrong for them the way it was for Tenant, but it's still the
  same after-the-fact-revocable-toggle design the task flags as a
  compliance risk in general.
- The same "Data Processing," "Marketing Communications," and
  "Third-Party Sharing" toggles, with the same "changes take effect
  immediately" framing, for PYME as well — none of these are currently
  gated by role.

Per instructions, **I did not touch this for Owner/Investor/PYME.** The
card still renders for them exactly as it did before this change. This is
flagged as a finding for a decision: is the toggle-based revocable-consent
design only wrong for Tenant (because of the Image Usage copy mismatch),
or is it wrong everywhere (because consent shouldn't be revocable via a
simple toggle post-registration, per the task's own stated reasoning,
which doesn't mention Tenant specifically)? If the latter, the same
`isTenantRole`-style gate (or an outright deletion of the whole card) can
be extended to Owner/Investor/PYME on request.

# Files Modified

- `src/app/(dashboard)/dashboard/profile/page.tsx` — added `isTenantRole`
  check; wrapped the "Privacy & Consent" `<Card>` in
  `{!isTenantRole && (...)}`. No other section of this page was changed.

# Expected Result

- A Tenant (`inquilino` or `inquilino_premium`) visiting
  `/dashboard/profile` sees only "Personal Information" — no "Privacy &
  Consent" card, no toggles, no "Image Usage" copy that doesn't apply to
  them.
- Property Owner, Investor, and PYME profiles are completely unchanged —
  same Privacy & Consent card, same four toggles, same behavior as before
  this change.
- Registration-time consent checkboxes (Terms of Service, Privacy Policy,
  etc. on `/forms/inquilino`, `/forms/propietario`, `/forms/pymes`) are
  untouched and remain the sole mechanism for capturing those consents.

## Not verified

No `node_modules` are installed in this environment, so I could not run a
type-check, build, or the dev server to visually confirm the Tenant vs.
non-Tenant profile view in a browser. The change is a single conditional
wrap around existing, previously-working JSX with no new dependencies, so
risk is low, but a quick smoke test as a Tenant and as an Owner is still
worth doing before merging.
