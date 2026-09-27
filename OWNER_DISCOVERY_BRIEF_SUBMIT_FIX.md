# Previous Failed Submit Changes Reverted

Removed the unsuccessful final-Submit registration-role gate, profiling/lead response gates, and property-specific return path introduced by the recent Submit-fix attempts. The downstream profiling role-preservation behavior was retained because it protects the working registration-selected base role and is not involved in the failing discovery insert. The working registration, authentication, post-registration role routing, onboarding UI, and Dashboard fixes were not reverted or modified.

# Root Cause Identified

The failing operation is the authenticated browser insert into `discovery_briefs` in `src/app/forms/propietario/page.tsx`. Its payload supplies all existing NOT NULL columns (`user_id`, `property_objective`, `property_type`, `current_state`, `main_challenge`, and `property_count`) with schema-compatible values. The blocker is the existing RLS policy chain: `supabase/migration_v2_mvp.sql` defines `Admins can view all discovery briefs` as `FOR ALL` with a `profiles` subquery, while the deployed profile-read behavior is failing and the profile SELECT policy is self-referential. That policy is evaluated for the insert and rejects/errors before the row is saved. This is not a missing payload field or router/session failure.

# Exact Fix Implemented

No database bypass was implemented because the root fix requires changing the RLS policy and this task expressly prohibits RLS, migration, and schema changes. The existing user-facing discovery-brief error was preserved. Its call-site logging now emits the full Supabase error object plus explicit `message`, `code`, `details`, and `hint`, allowing the Vercel/browser log to show the precise Postgres policy error.

# Files Modified

- `src/app/forms/propietario/page.tsx` — reverted failed Submit-only changes and expanded the failing discovery insert log without changing its UI message.
- `OWNER_DISCOVERY_BRIEF_SUBMIT_FIX.md` — records the exact blocker and scope-limited outcome.

# What Was Intentionally Not Changed

Registration, session creation, authentication, base-role handling, post-registration routing, Dashboard access, earlier onboarding steps, Legal Consents UI/validation, other profile types, email/Resend, Stripe/payments, pricing, scoring, service tiers, schema, migrations, and RLS were not modified.

# Expected Result

The current permitted code change exposes the complete Supabase/Postgres failure details while preserving the completed form and authenticated session. The requested successful discovery-brief save and Dashboard navigation cannot occur until the blocking `discovery_briefs`/`profiles` RLS policy chain is corrected outside this task's allowed scope.

# Remaining Known Limitation

Owner discovery-brief insertion remains blocked by the existing RLS policy. A narrowly scoped RLS migration/policy correction is required before final Submit can save and continue to the Dashboard; this task explicitly prohibited implementing it.
