# Fix Implemented

The bottom "Ready to Get Started?" section on Recommended Services (`/dashboard/services`) has a single shared "Schedule a Free Consultation" button whose destination already branched by role:

```tsx
href={isTenantRole || isOwnerRole ? "/dashboard/consultation" : "/#contact"}
```

PYME fell through to the `"/#contact"` else-branch — the anonymous, public Contact Us form — even though this is a different button from the one already fixed in `PYME_SCHEDULE_CONSULTATION_FIX.md` (that one lives on the PYME plan card and was left untouched because it was only confirmed to send emails correctly, not pre-fill).

The branch now also routes `isPymesRole` to the same authenticated `/dashboard/consultation` page used by Tenant/Owner/Investor and PYME's other button:

```tsx
href={
  isTenantRole || isOwnerRole
    ? "/dashboard/consultation"
    : isPymesRole
      ? `/dashboard/consultation${pymesPlanDetails ? `?plan=${encodeURIComponent(pymesPlanDetails.name)}` : ""}`
      : "/#contact"
}
```

`isPymesRole` and `pymesPlanDetails` were already computed earlier in the same `ServicesPage` component (used to render the `PymesPlanCard` above), so no new data fetching was needed — this only reused values already in scope.

The `?plan=<name>` query param is the exact same one `pymes-plan-card.tsx`'s "Schedule a Consultation" link already sends, so `/dashboard/consultation` (unmodified — it already generalizes on `?plan=` for any entry point) resolves the pre-filled Subject to `Consultation request — {planName} plan` for a PYME customer with an assigned plan, identical to the already-fixed button's behavior. A PYME customer with no plan assigned yet (`pymesPlanDetails` is `null`) still lands on `/dashboard/consultation` with no `?plan=`, falling back to the page's existing generic `"Consultation request"` subject — the same graceful fallback Tenant already gets when they have no matched property yet.

Name/phone/email pre-fill (editable), skipping the "I am a..." picker (hidden `role` input sends `profile.role`, which is `"pymes"`), and redirecting back to `/dashboard/consultation` (not the public homepage) after submission all come for free from the existing, unmodified consultation page and `/api/contact` route.

# Files Modified

- [src/app/(dashboard)/dashboard/services/page.tsx](<src/app/(dashboard)/dashboard/services/page.tsx>) — bottom "Schedule a Free Consultation" `<Link href>` now routes PYME to `/dashboard/consultation` (with `?plan=` when a plan is assigned), instead of `/#contact`. No other logic in this file touched.

Not touched (per task): the anonymous Contact Us form, PYME's other (already-correct) consultation button on the plan card, `/dashboard/consultation/page.tsx` itself, `/api/contact/route.ts`, and Tenant/Property Owner/Investor's consultation flows — all of which were already routing correctly and needed no changes.

# Expected Result

A PYME customer clicking "Schedule a Free Consultation" in the bottom "Ready to Get Started?" card on `/dashboard/services` now lands on the same authenticated consultation page as every other role and as PYME's other consultation button: name, phone, and email pre-filled from their account (still editable), no repeated "I am a..." question, and a Subject pre-filled with their actual recommended plan (e.g. "Consultation request — Growth plan") when they have one, or a generic consultation request subject if they haven't taken the diagnosis yet. Submitting sends through the same lead-insert/email logic as before and returns them to `/dashboard/consultation` with a success confirmation instead of the public marketing homepage.
