# Implemented Fix

The Property Owner Submit now verifies that the computed owner role was persisted, requires successful owner profiling, and refreshes and validates the existing Supabase session once immediately before navigating to the protected Dashboard.

The owner profiling helper now throws profile read/update errors so the existing profiling API catch returns an accurate failure response.

# Files Modified

- `src/app/forms/propietario/page.tsx`
- `src/lib/profiling.ts`
- `OWNER_ONBOARDING_AUTH_IMPLEMENTATION.md`

# Exact Behavior Changed

- The `profiles` update selects the persisted `role` and requires it to equal the computed `propietario`, `propietario_preferido`, or `inversionista` role.
- A failed or mismatched role update displays an error and prevents Dashboard navigation.
- The `/api/profiling` response must be successful; a non-2xx response displays an error and prevents navigation.
- `profileOwner()` now propagates errors from its relevant profile read and profile update.
- Immediately before the existing `router.push("/dashboard/properties")`, Submit awaits exactly one `auth.refreshSession()` call and requires a session user.
- A failed session refresh reports that the submitted information was saved but the session could not be confirmed, and does not navigate.

# What Was Intentionally Not Changed

Middleware, dashboard architecture, login, registration and email-confirmation UX, email/Resend behavior, routing mechanism, schema, migrations, RLS, Stripe, payments, pricing, scoring, form questions, service tiers, and unrelated property/image logic were not changed.

# Expected Preview Result

A new Property Owner can register, complete and submit all six onboarding steps, continue receiving the existing customer email, retain a verified authenticated session, and enter `/dashboard/properties` with the persisted Property Owner role instead of appearing as Tenant.

# Remaining Known Limitations

If final role verification, profiling, or session refresh fails, the user remains on the completed form with a retry message. Earlier discovery-brief/property writes may already exist because the existing Submit flow is not transactional or idempotent. The pre-existing investor branch also continues to log individual property insert failures instead of failing the whole Submit.
