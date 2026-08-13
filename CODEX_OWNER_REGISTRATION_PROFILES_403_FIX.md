# Property Owner Registration `profiles` 403 Fix

## Summary

The Property Owner onboarding failure occurred after the discovery brief, property, and consent data had already been saved. The blocking step was the subsequent `POST /api/leads` request. That route attempted to read the authenticated user's `profiles` row through the separate server-side `supabaseAdmin` client instead of through the request's authenticated Supabase client.

The fix changes only that profile lookup. It now uses the cookie-context authenticated client that has already validated the caller. Internal `leads` reads and writes continue to use the existing privileged server client.

No production deployment was performed.

## Root Cause Identified

The final-submit sequence calls `/api/leads` after the property has been inserted and owner profiling has run. In the version that failed, `/api/leads` performed its first database query as follows:

```ts
supabaseAdmin
  .from("profiles")
  .select("full_name, email, phone, role")
  .eq("id", user.id)
  .single();
```

`supabaseAdmin` is a global Supabase client created with `SUPABASE_SERVICE_ROLE_KEY`. It does not carry the submitting user's cookie session or authenticated JWT. The live Preview request made through this client reached PostgreSQL with a database role that did not have effective `SELECT` permission on `profiles`, producing `permission denied for table profiles` and an HTTP 403.

This explains why granting `SELECT`, `INSERT`, and `UPDATE` on `profiles` to `authenticated` did not resolve this particular request: the failing request did not use the authenticated client or the authenticated role.

The concrete defect was therefore a server-side Supabase client/role mismatch for an own-profile lookup. It was not evidence that the successful browser GET/PATCH requests lacked grants, and it did not justify adding more `profiles` grants.

The code statically shows that the failing client is configured from `SUPABASE_SERVICE_ROLE_KEY`. The supplied runtime evidence proves that its effective Preview database role lacked the required table permission. Without inspecting the redacted request credential or Preview environment-variable value, static repository inspection alone cannot distinguish between a misconfigured Preview key and an unexpected privilege state for the intended service role. The implemented fix does not depend on that distinction because this own-profile read should use the authenticated request context in either case.

## Evidence Supporting the Root Cause

### Final-submit execution order

The Property Owner submit handler executes these relevant operations in order:

1. Validates the browser user with `supabase.auth.getUser()`.
2. Inserts `discovery_briefs`.
3. Starts consent logging and the owner email request.
4. Inserts the property or properties.
5. Uploads property images when present.
6. Calls `POST /api/profiling`.
7. Calls `POST /api/leads`.
8. Revalidates the browser user.
9. Redirects to `/dashboard/properties`.

The observed error text, `Your property was saved, but we couldn't complete your owner registration. Please try again.`, is the error branch associated with a non-successful `/api/leads` response in the baseline final-submit implementation. It occurs after property persistence.

### Client comparison

- Successful registration-flow `profiles` calls use the browser or server cookie-context Supabase client created with the public anon key plus the authenticated user's session.
- `/api/leads` first authenticates the caller with the cookie-context server client, proving that an authenticated user is available to the route.
- Before this fix, the route then discarded that authenticated context for the profile query and used `supabaseAdmin` instead.
- `supabaseAdmin` is created in `src/lib/supabase/admin.ts` with `SUPABASE_SERVICE_ROLE_KEY` and no user cookie session.
- The reported `/rest/v1/profiles` 403 and PostgreSQL `permission denied for table profiles` occurred at this post-save stage.
- The existing `authenticated` grants cannot authorize a request executing under a different database role.

### Why this was not treated as an RLS-policy failure

PostgreSQL's `permission denied for table profiles` indicates failure at the table-privilege layer. An RLS rejection normally filters rows or reports a row-level-security policy violation for a prohibited write. The supplied evidence also established that authenticated GET and PATCH operations against the same table succeeded during registration.

No RLS policy or grant was relaxed as part of this fix.

## Exact Changes Made

In `src/app/api/leads/route.ts`:

1. Changed the own-profile lookup from `supabaseAdmin.from("profiles")` to `supabase.from("profiles")`, where `supabase` is the request's cookie-context authenticated server client.
2. Captured `profileError` instead of silently treating every failed query as a missing profile.
3. Added an explicit JSON error response containing the Supabase error message when the authenticated lookup fails.
4. Left the existing `supabaseAdmin` operations on the internal `leads` table unchanged.

The resulting responsibility split is:

- Authenticated client: validate the caller and read that caller's own canonical profile.
- Privileged server client: check and create internal sales-lead records.

No submit-handler ordering, property payload, profile role calculation, service-tier calculation, consent operation, discovery-brief operation, email operation, or redirect target was changed by this fix.

## Files Modified

The code fix modified:

- `src/app/api/leads/route.ts`

This report adds:

- `CODEX_OWNER_REGISTRATION_PROFILES_403_FIX.md`

The worktree contains other modified and untracked files that predated this report and were not changed while creating it. They are listed under **Repository Status** below and must not be attributed automatically to this specific fix.

## Supabase Migration

No Supabase migration was created or modified for this fix.

Reason:

- The `authenticated` role already has the required `SELECT` privilege on `profiles`.
- Existing RLS permits a user to read their own profile row.
- The failure came from selecting the wrong Supabase client for the request, not from missing authenticated grants or an inadequate own-profile policy.
- Adding another `profiles` grant would not correct a request executing under the wrong role.

Because no database/security behavior was changed, representing this code-only correction in a migration would be inappropriate.

## Why the Fix Resolves the Specific `profiles` 403

The route already authenticates the request through the cookie-context `supabase` client and obtains `user.id`. The corrected query uses that same client and filters the lookup to `id = user.id`.

Consequently:

- PostgREST receives the authenticated user's JWT.
- PostgreSQL evaluates the request under the `authenticated` role.
- The verified `authenticated` table-level `SELECT` grant applies.
- The existing own-profile RLS policy authorizes the row because `auth.uid() = profiles.id`.
- The failing server-client `profiles` request is no longer issued.

Once the profile is returned, the route continues through its existing idempotent lead check. If a lead already exists, it returns success without inserting another lead; otherwise it creates one and returns success. The final submit can then continue to the existing authenticated-user verification and dashboard redirect.

## Preservation of Existing Behavior

The fix intentionally leaves these successful behaviors unchanged:

- Discovery brief insertion.
- Property insertion and its existing payload.
- Consent-log persistence.
- Property-image handling.
- Owner profiling.
- Canonical authenticated profile handling.
- Lead deduplication by existing lead lookup.
- Owner email behavior.
- Redirect to `/dashboard/properties`.
- Service tier selected by the onboarding flow and subsequently processed by owner profiling.

Because the previously failing post-property operation should now succeed on the first attempt, the UI should not present the retry message that could prompt a user to resubmit already-persisted property data.

## Tests and Checks Performed

### Passed

- Traced the complete final-submit path from the Property Owner form through `/api/profiling`, `/api/leads`, final session verification, and dashboard navigation.
- Matched the reported UI error to the `/api/leads` failure branch in the baseline submit path.
- Inspected the browser, server cookie-context, and admin Supabase client factories.
- Verified that the failing route used the admin client specifically for its `profiles` query.
- Reviewed the existing `profiles` grants and own-row RLS policy.
- Reviewed the `leads` schema and existing privileged access pattern.
- Ran `git diff --check`; it completed successfully with no whitespace errors.
- Re-inspected the final route diff and confirmed that only the profile-query client and its error handling changed.

### Not available in this workspace

- A full lint, TypeScript check, or Next.js production build could not be run because the workspace has no installed `node_modules` and the `npm` executable is unavailable (`/bin/bash: npm: command not found`).
- The repository-required bundled Next.js documentation under `node_modules/next/dist/docs/` was also unavailable for the same reason. The fix does not introduce or change a Next.js API; it follows the existing route and Supabase client patterns.
- No live Supabase or Vercel Preview request was executed from this workspace.

## Remaining Risks and Unresolved Issues

1. The Preview value/effective role associated with `SUPABASE_SERVICE_ROLE_KEY` was not directly inspected. The fix removes its use for this profile lookup, but the environment should still be audited separately because other privileged server operations depend on that variable.
2. Internal `leads` reads and writes still intentionally use `supabaseAdmin`. If the Preview service credential is globally misconfigured rather than missing only effective `profiles` access, the next failure could occur against `leads`. The supplied evidence identified `profiles` as the current failing table; the implementation did not broaden into unrelated credential or lead-authorization refactoring.
3. No automated end-to-end onboarding test exists in the inspected repository.
4. The working tree contains unrelated/pre-existing modifications and untracked diagnostic documents. They should be reviewed and separated before committing.
5. A retry performed against an old, already-loaded failing application bundle could still repeat the form submission. The next Preview validation should use a newly deployed Preview build and preferably a fresh test user. The corrected build should complete on the first submit and avoid the retry path.

## Expected Behavior for the Next Manual Vercel Preview Test

Use a fresh Property Owner account against a Preview containing this change.

1. Signup completes and an authenticated session is established.
2. The owner completes the onboarding form and submits once.
3. `POST /rest/v1/discovery_briefs` succeeds with 201.
4. The intended property is inserted once with 201.
5. Consent logging continues to succeed.
6. Existing authenticated profile GET/PATCH operations continue to succeed.
7. `/api/profiling` processes the saved property and preserves the tier calculated for the owner path (`basic`, `preferred_owners`, or `elite`, as applicable).
8. `/api/leads` authenticates the caller, reads the caller's own profile through the authenticated client, and creates the lead or returns the existing-lead success response.
9. There is no server-side `profiles` request from `supabaseAdmin` in this lead path and no corresponding `profiles` 403.
10. The UI does not display `Your property was saved, but we couldn't complete your owner registration. Please try again.`
11. The final authenticated-user check succeeds.
12. The browser navigates to `/dashboard/properties`, showing the Property Owner dashboard with the saved property and assigned tier.

For Network/Supabase verification, confirm that any `profiles` request associated with `/api/leads` is authorized as the authenticated user and that the prior `permission denied for table profiles` log entry does not recur.

## Repository Status

At report creation time:

- Branch: `fix/auth-dashboard`
- HEAD: `29fde15a0de61d5b46528bcf89bf97bfbabff449`
- Short commit: `29fde15`
- Fix status: uncommitted working-tree change
- No new commit was created.
- No deployment was performed.

`git status --short` before adding this report showed:

```text
 M src/app/api/leads/route.ts
 M src/app/forms/propietario/page.tsx
 M supabase/migration_v31_milestone4_final_decisions.sql
?? OWNER_AUTH_FLOW_FINAL_FIX.md
?? OWNER_DISCOVERY_BRIEF_SUBMIT_FIX.md
?? OWNER_FINAL_SUBMIT_FINAL_FIX.md
?? OWNER_FINAL_SUBMIT_SAVE_FIX.md
?? OWNER_ONBOARDING_AUTH_IMPLEMENTATION.md
?? OWNER_ONBOARDING_AUTH_ROOT_CAUSE.md
?? OWNER_ROLE_RUNTIME_FIX.md
?? POST_REGISTRATION_ROLE_ROUTING_FIX.md
?? SAFE_SUPABASE_MIGRATION_PLAN.md
```

After report creation, `CODEX_OWNER_REGISTRATION_PROFILES_403_FIX.md` is additionally untracked until committed.
