# Add Property Flow — Email Code Found (existing but broken, or missing)

The four-step **New Property** flow is `src/app/forms/propietario/add-property/page.tsx`. After saving the property, images, profile count, and profiling result, it calls `POST /api/owner-submit-email` with the current owner type, property count, tier, city, and rent (`source: "add_property"`).

Email code therefore already existed. The shared route, `src/app/api/owner-submit-email/route.ts`, creates the commercial-team notification and the owner confirmation using the established Resend templates and recipients.

Before this fix, each `resend.emails.send(...)` call used `.catch(...)` but was not awaited. The route immediately returned `{ success: true }`, so a serverless invocation could finish before either Resend request completed. This is the same lifecycle defect fixed in `/api/tenant-submit-email`.

# Original 6-Step Registration Flow — Email Status Re-Verified

The original Property Owner onboarding submit in `src/app/forms/propietario/page.tsx` also calls the same `POST /api/owner-submit-email` route after the Discovery Brief insert. It does not use a separate owner-email route or template.

Consequently, the missing emails reported for the original six-step registration have the same root cause, not a separate regression: both flows reached the same shared route with its un-awaited Resend sends. With the route fixed, both flows now wait for the Resend operations to settle before that API request returns.

# Fix Implemented

Updated `src/app/api/owner-submit-email/route.ts` to match the proven `/api/tenant-submit-email` and `/api/apply-property` pattern:

- Collect commercial and owner `resend.emails.send(...)` operations in `sends`.
- `await Promise.allSettled(sends)` before returning the API response.
- Log an explicit fulfilled or rejected result for each recipient category.
- Return `emailSent` based on whether at least one send completed successfully.

The commercial recipient configuration, owner recipient selection, subjects, and HTML templates are unchanged. Tenant, Investor, and PYME flows were not changed.

# Files Modified

- `src/app/api/owner-submit-email/route.ts`
- `PROPERTY_OWNER_EMAIL_DIAGNOSTIC_AND_FIX.md`

# Expected Result

After either a four-step New Property submission or an original six-step Property Owner registration reaches `/api/owner-submit-email`, the serverless function remains active until both the commercial notification and authenticated owner's confirmation have settled with Resend. Runtime logs identify the result for each recipient, so a delivery/API failure is visible instead of being silently lost when the function returns early.

Static diff validation (`git diff --check`) passed. The workspace does not contain the Node/npm executable or installed `node_modules`, so the project lint command could not be run in this environment.
