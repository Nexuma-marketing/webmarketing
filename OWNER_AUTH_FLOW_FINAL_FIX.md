# Failed Changes Removed

Removed the failed implementation from commit `6eeda05` (`fix owner onboarding session and role`): the final-submit role round trip, profiling response check, forced `refreshSession()`, and profile-update error propagation. The final implementation separately checks the profile read only to prevent Tenant, Business, or missing roles from entering owner classification.

# Root Cause Addressed

With Supabase Confirm email now intentionally disabled, registration must establish a usable session before role-specific routing. Registration now verifies that session and persists the selected Form 1 role to canonical `profiles.role`. Property onboarding no longer directly decides or overwrites the base customer role.

# Files Modified

- `src/app/(auth)/register/page.tsx`
- `src/app/forms/propietario/page.tsx`
- `src/app/(dashboard)/layout.tsx`
- `OWNER_AUTH_FLOW_FINAL_FIX.md`

# Registration Flow Preserved

The existing registration UI, fields, role values, consent logging, and signup call remain. After signup, the code now requires a Supabase session, verifies the authenticated user, persists and confirms the selected `profiles.role`, and stops with a clear error if any required state is missing.

# Role Routing Preserved

The existing role map is unchanged: `propietario` routes to `/forms/propietario`, `inquilino` to `/forms/inquilino`, and `pymes` to `/forms/pymes`. Tenant and Business users are not sent through Property Owner onboarding.

# Property Owner Onboarding Preserved

All six existing steps, questions, validation, persistence, property/image behavior, profiling, lead creation, email behavior, tier logic, and final `/dashboard/properties` destination remain in their existing order. Only the direct Form 2 base-role overwrite was removed. The current authenticated user is verified immediately before protected navigation.

# Exact Fix Implemented

- Require and verify an authenticated Supabase session after `signUp`.
- Persist the Form 1 role to `profiles.role` and confirm the returned value matches.
- Route only after session and role verification succeeds.
- Stop Property Owner onboarding from directly deriving the base role from onboarding answers.
- Reject owner profiling for a missing, Tenant, or Business profile role instead of reclassifying it as an owner.
- Verify the current authenticated user immediately before the unchanged router navigation.
- Stop the dashboard layout from silently converting a missing/failed profile-role read into Tenant.

# What Was Intentionally Not Changed

No email-confirmation UX was added. Middleware, login, role route destinations, onboarding steps, questions, email/Resend behavior, profiling tiers, property/images, dashboard architecture, schema, migrations, RLS, Stripe, payments, pricing, and scoring were not redesigned or changed.

# Expected Preview Result

A new Property Owner registers without an email-verification interruption, receives a valid session, has `profiles.role = propietario`, enters the existing owner onboarding, completes all six steps, receives the existing emails, and opens `/dashboard/properties` while remaining signed in and displaying the correct owner role. Tenant and Business registrations continue to their existing role-specific forms.

# Remaining Known Limitation

Accounts created previously while Confirm email was enabled may remain unconfirmed and require operational cleanup or recreation in Supabase. This code does not add a confirmation or recovery flow for those historical accounts.
