# Runtime Error Observed

Vercel Preview returned HTTP 500 on `/dashboard` because the dashboard layout threw `Unable to load the authenticated user's profile role` whenever the customer-context `profiles` read returned an error or no role. Registration also reported that the selected profile type could not be saved because the latest change redundantly updated and selected the trigger-created profile through that same customer RLS path.

# Files Modified

- `src/app/(auth)/register/page.tsx`
- `src/app/(dashboard)/layout.tsx`
- `src/app/(dashboard)/dashboard/page.tsx`
- `OWNER_ROLE_RUNTIME_FIX.md`

# Exact Fix

- Removed the redundant client-side `profiles.update(...).select(...)` from registration. The existing `signUp` continues sending the selected role in user metadata, and the existing synchronous `handle_new_user` database trigger remains responsible for persisting it to canonical `profiles.role`.
- Registration now verifies that the authenticated Supabase user's role metadata matches the selected role before following the unchanged role-specific route.
- Dashboard still prefers canonical `profiles.role`. If that read is unavailable, it uses the authenticated user's existing role metadata instead of throwing HTTP 500 or inventing Tenant.
- The `/dashboard` page uses the same fallback instead of redirecting an authenticated user to Sign In after the layout succeeds.
- If neither role source exists, the authenticated user is safely redirected to the existing public home route without being signed out or misclassified.

# What Was Not Changed

Middleware, login, registration UI and role choices, role-specific routing, onboarding, dashboard architecture, email/Resend, schema, migrations, RLS, Stripe, payments, pricing, scoring, and unrelated business logic were not changed. No email verification was added.

# Expected Preview Result

A new user registers with an active session, the existing signup trigger persists the selected canonical profile role, and the existing role-specific flow opens. Dashboard requests no longer return HTTP 500 when the profile read is unavailable, authenticated users remain signed in, and no missing role is mislabeled as Tenant.
