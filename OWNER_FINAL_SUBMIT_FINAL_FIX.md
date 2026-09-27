# Exact Blocking Cause

Final Property Owner Submit was redundantly inserting the authenticated user into `profiles` even though successful registration had already established the profile and registration-selected role. That repeated customer-context insert could return a non-duplicate database/RLS error and stopped Submit before the existing discovery brief, property, profiling, lead, and Dashboard flow.

# Files Modified

- `src/app/forms/propietario/page.tsx`
- `src/app/api/profiling/route.ts`
- `src/lib/profiling.ts`
- `OWNER_FINAL_SUBMIT_FINAL_FIX.md`

# Exact Fix Implemented

- Removed only the redundant `profiles.insert()` from final Property Owner Submit.
- Retained the authenticated-user check and validation of the Property Owner role selected during registration; onboarding does not derive or overwrite the base role.
- Preserved the existing discovery brief, legal-consent, email, property/image, profiling, lead, session verification, and router navigation order.
- Required successful `/api/profiling` and `/api/leads` responses before navigation. Failures now log the exact response internally, show a meaningful operation-specific message, and keep the user on the form.
- Owner profiling still prefers canonical `profiles.role`; if that customer-context read fails, the API supplies the authenticated user's registration role. The existing owner-role guard rejects missing, Tenant, or Business roles instead of reclassifying them.
- The existing `router.push("/dashboard/properties")` runs only after required persistence APIs and the final authenticated-user check succeed.

# What Was Not Changed

Registration, post-registration role routing, Tenant and Business flows, login, middleware, dashboard architecture, onboarding structure, role model, email/Resend, schema, migrations, RLS, Stripe/payments, pricing, scoring, service tiers, and unrelated business logic were not changed. No email verification or alternate navigation mechanism was added.

# Expected Preview Result

A registered Property Owner completes the unchanged onboarding and submits without the redundant profile-write failure. Required discovery brief, property, profiling, and lead persistence complete; existing emails continue; the session remains authenticated; and the existing Property Owner Dashboard opens directly.
