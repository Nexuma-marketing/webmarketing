# Fix Implemented (reused consultation flow, Owner-specific subject text)

The "Schedule a Free Consultation" footer CTA on Recommended Services
([dashboard/services/page.tsx:1201-1230](<src/app/(dashboard)/dashboard/services/page.tsx#L1201-L1230>))
already had a role-based branch routing Tenant to the authenticated
`/dashboard/consultation` flow while every other role — including
Property Owner/Preferred Owner/Investor — fell through to
`/#contact`, the public/anonymous Contact Us form (no pre-fill, and it
redirects back to the public homepage on submit, since that form's own
success handling isn't dashboard-aware).

**No new page or component was built.** Extended the existing
condition to include Owner/Investor:

```tsx
href={isTenantRole || isOwnerRole ? "/dashboard/consultation" : "/#contact"}
```

`isOwnerRole` was already computed earlier in this same file (covers
`propietario` / `propietario_preferido` / `inversionista`). PYME is
untouched here — it still uses `/#contact` on this specific footer
button, since PYME's own working authenticated flow lives on its
dedicated plan card elsewhere (`pymes-plan-card.tsx`, `?plan=` entry
point), exactly as before.

**Subject-line logic** in the shared consultation page
([dashboard/consultation/page.tsx](<src/app/(dashboard)/dashboard/consultation/page.tsx>))
was extended with a new Owner/Investor branch, following the exact
same shape as the existing Tenant branch (top-matched-property
reference) and PYME branch (`?plan=` query param):

```tsx
let ownerTierName: string | null = null;
if (isOwnerRole && !planName) {
  if (isInvestor) {
    ownerTierName = OWNER_TIERS.elite.name; // "Elite Assets & Legacy"
  } else if (isOwnerNotInvestor) {
    const { count: propertyCount } = await supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id);
    ownerTierName =
      (propertyCount || 0) >= 2 ? OWNER_TIERS.preferred_owners.name : OWNER_TIERS.basic.name;
  }
}
```

This reuses the exact same tier-resolution rule already used on
Dashboard home and Recommended Services (investor is always Elite;
Property Owner is capped at Basic/Preferred Owners by property count,
never auto-promoted to Elite) — no new business logic was invented,
just referenced the shared `OWNER_TIERS` constant already used
elsewhere in the app.

The default subject now reads, in priority order (unchanged priority
order — Owner slots into the existing `planName` → `isTenantRole` →
`isOwnerRole` → generic chain):

- `"Consultation request — Preferred Owners plan"` (or `Basic` /
  `Elite Assets & Legacy`, matching the customer's actual assigned
  tier)
- Falls back to the generic `"Consultation request"` only if
  `ownerTierName` somehow can't be resolved (defensive; in practice
  every `isOwnerRole` user resolves to one of the three tiers).

Everything else on the consultation page — the pre-filled/editable
name, phone, email fields, the hidden `role`/`redirect_to` fields, the
"skip I am a..." picker, and the redirect back to
`/dashboard/consultation` (the dashboard, not the public homepage)
after submit — was already generalized and required no changes.

# Files Modified

- [src/app/(dashboard)/dashboard/services/page.tsx](<src/app/(dashboard)/dashboard/services/page.tsx>) — footer "Schedule a Free Consultation" CTA now also routes Owner/Preferred Owner/Investor to `/dashboard/consultation` (was public `/#contact`). PYME's behavior on this button, and Tenant's existing behavior, are unchanged.
- [src/app/(dashboard)/dashboard/consultation/page.tsx](<src/app/(dashboard)/dashboard/consultation/page.tsx>) — added an Owner/Investor branch to the shared subject-line resolution, reusing `OWNER_TIERS` from `src/lib/constants.ts`. Tenant's and PYME's existing subject logic is untouched.

The anonymous Contact Us form (`src/app/page.tsx#contact`, `/api/contact`) was not touched.

# Expected Result

- Property Owner, Preferred Owner, and Investor clicking "Schedule a
  Free Consultation" on Recommended Services now land on
  `/dashboard/consultation` instead of the public Contact Us form.
- Name, phone, and email are pre-filled from their profile/auth user
  (editable), with no "I am a..." role picker — identical UX to what
  Tenant and PYME already get.
- Subject is pre-filled with their actual tier, e.g. `"Consultation
  request — Preferred Owners plan"` for a 2–3 property Owner,
  `"Consultation request — Basic plan"` for a single-property Owner,
  or `"Consultation request — Elite Assets & Legacy plan"` for an
  Investor — editable before sending.
- After submitting, the user is redirected back to
  `/dashboard/consultation` (the dashboard), not the public homepage.
- Tenant's and PYME's consultation entry points and subject text are
  completely unaffected. `npx tsc --noEmit` passes with no new errors
  on either modified file. No commit, push, or deploy was performed.
