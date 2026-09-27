# Exact Save Failure

The first required final-Submit write, `discovery_briefs.insert`, was failing because `discovery_briefs.user_id` references `profiles.id`, while the latest registration path only verified auth metadata and did not ensure the canonical `profiles` row existed. That thrown insert error entered the generic catch and displayed `Failed to save. Please try again.` before property, profiling, lead creation, or Dashboard navigation.

# Files Modified

- `src/app/(auth)/register/page.tsx`
- `src/app/forms/propietario/page.tsx`
- `OWNER_FINAL_SUBMIT_SAVE_FIX.md`

# Exact Fix Implemented

- Registration now performs a non-selecting self-insert of the authenticated user's canonical profile using the role selected in Form 1. PostgreSQL duplicate code `23505` is accepted because it means the existing auth trigger already created the row; every other error blocks role-specific routing with an internal operation error and clear UI message.
- Final owner Submit performs the same narrow profile-row repair for preview accounts created before this correction. It uses only the authenticated user's registration metadata role and never derives or overwrites the base role from onboarding answers.
- The required discovery-brief and standard-owner property inserts now log their exact operation/error and show operation-specific UI messages instead of falling into the generic save error.
- Navigation remains the existing `router.push("/dashboard/properties")` and occurs only after the required Submit path and final authenticated-user check complete.

# What Was Not Changed

Onboarding structure/order, questions, registration UI and role choices, middleware, login, dashboard architecture, Tenant and Business flows, email/Resend, schema, migrations, RLS, Stripe/payments, pricing, scoring, service tiers, and unrelated property/image logic were not changed. No email verification was added.

# Expected Preview Result

A new Property Owner receives a canonical profile at registration, completes the unchanged onboarding, and successfully saves the discovery brief and property. Existing emails continue to send, the authenticated session remains active, and the existing Dashboard destination opens without the generic save failure.
