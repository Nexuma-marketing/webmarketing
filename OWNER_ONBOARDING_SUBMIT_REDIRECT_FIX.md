# Observed Runtime Problem

After a newly registered property owner completed the final owner onboarding submit, the flow did not remain on the authenticated dashboard path. The submit completed its persistence and email steps, but the browser was sent back through a client-side route transition that could drop the active session context and land the user at the sign-in experience instead of the dashboard.

# Root Cause

The final owner onboarding submit was navigating the user with a client-side router transition to the dashboard area. In this baseline, that transition was too weak for the post-submit auth state handoff and could leave the owner on the sign-in path after the onboarding completion request finished. The minimal root cause was the redirect mechanism used at the end of the owner onboarding submit flow.

# Files Modified

- src/app/forms/propietario/page.tsx

# Exact Fix Applied

- Added a small helper in the owner onboarding form submit flow that performs a full browser navigation to /dashboard after the final submit succeeds.
- Replaced the previous client-side redirect target at the end of the owner onboarding completion flow with that full navigation so the owner stays on the authenticated dashboard path immediately after submit.
- Kept the existing email send, lead creation, profiling, and persistence logic intact.

# What Was Intentionally Not Changed

- No auth redesign.
- No middleware changes.
- No Supabase schema or migration changes.
- No RLS changes.
- No email sending logic changes.
- No dashboard architecture changes.
- No business-rule or form-question changes.

# Expected Preview Result

After a new owner completes the final owner onboarding submit, the browser should navigate directly to /dashboard while preserving the existing authenticated session, without forcing the user to sign in again.

# Remaining Limitations

This fix is intentionally scoped to the owner onboarding completion redirect path only. It does not change broader auth behavior outside this submit completion flow.
