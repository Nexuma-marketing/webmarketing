# Executive Conclusion

The successful owner Submit does **not** execute `signOut()`, clear a token, replace the session, or intentionally send the customer to Sign In. The authenticated browser user is proved at the start of Submit by `supabase.auth.getUser()` (`src/app/forms/propietario/page.tsx:532-538`), and the successfully sent owner email proves that a server request made after the discovery-brief insert also authenticated the same user (`src/app/api/owner-submit-email/route.ts:14-18`). No later statement in the Submit path changes auth state.

The Sign In result is therefore an **SSR session-recognition failure at the protected navigation boundary**, not a bad redirect target and not a deliberate logout. Submit calls `router.push("/dashboard/properties")` (`page.tsx:774`). The request then enters `middleware()`, whose `supabase.auth.getUser()` is based exclusively on request cookies. If that cookie-backed lookup has no user, `src/middleware.ts:40-43` changes the URL to `/login`. If middleware passes but the Server Component cannot read the cookie-backed user, `src/app/(dashboard)/layout.tsx:13-18` also redirects to `/login`. The first of those guards to see `user === null` is the code that ultimately sends the browser to Sign In. Changing `router.push` to `window.location.assign` could not repair this because both navigation mechanisms reach the same cookie-based guards; git commit `67e1918` changed only that mechanism and commit `cb3ef74` correctly reverted it after it failed.

The Tenant display is a second bug, not the cause of the Sign In redirect. The canonical application role is `profiles.role`, not a nonexistent/assumed customer-state abstraction and not `auth.users.user_metadata`. Registration does request `role: "propietario"` in signup metadata (`src/app/(auth)/register/page.tsx:104-115`), and the database trigger copies that metadata into `profiles.role` (`supabase/migration_v9_admin_suite.sql:220-241`). Owner Submit then attempts to refine it to `propietario`, `propietario_preferido`, or `inversionista`, but it discards the result and error of that update (`src/app/forms/propietario/page.tsx:744-758`). Server profiling likewise discards profile read/update errors (`src/lib/profiling.ts:172-179,240-247`). Finally, the dashboard layout explicitly converts any missing/unreadable profile role into `inquilino` (`src/app/(dashboard)/layout.tsx:20-33`). That combination explains why an owner can be shown as Tenant even while still authenticated.

The smallest safe evaluation is confined to the existing owner Submit: explicitly refresh and verify the browser session immediately before the protected navigation (so the SSR cookie is current), and stop treating the owner-role update as fire-and-forget—check its returned row/error and fail Submit visibly if it did not persist. No middleware or dashboard redesign is warranted.

# Verified Runtime Facts

The supplied Vercel Preview observations establish the following without inference:

1. Password Sign In works.
2. A new Property Owner auth identity can be created and confirmed.
3. The confirmed customer can reach and complete all six owner-form steps.
4. Final Submit reaches at least the authenticated discovery-brief/email portion of the handler.
5. The customer email is delivered.
6. The post-Submit protected navigation ends at Sign In.
7. Replacing client routing with full browser navigation did not change the outcome and was reverted.
8. Some owner accounts have been rendered as Tenant in the dashboard.

Repository facts that constrain the diagnosis:

- There is a real `profiles` table. It is declared in `supabase/migration.sql:9-18`, documented in `HANDOVER_MANUAL.md:247-256`, and auto-created from auth metadata by `handle_new_user()`.
- The browser client is the standard `createBrowserClient` using the public Supabase URL/key (`src/lib/supabase/client.ts:1-7`).
- Server Components and route handlers use `createServerClient` backed by `cookies()` (`src/lib/supabase/server.ts:1-26`). Middleware uses the request cookie jar and returns refreshed cookies on its normal response (`src/middleware.ts:5-25,74`).
- `/forms/propietario` is intentionally public at middleware level; authentication is checked by its Submit handler. `/dashboard/*` is protected (`src/middleware.ts:32-43,77-78`).
- The repository-wide auth search finds `signOut()` only in the explicit header/sidebar logout handlers (`src/components/layout/header.tsx:34`, `src/components/layout/sidebar.tsx:255`). Neither is invoked by owner Submit.
- The only session-exchange/replacement calls are the email/recovery callback flows. None is called by owner Submit.

# Exact Root Cause

## Sign In failure

The direct cause is that protected rendering does not recognize a cookie-backed Supabase user after Submit, even though the Submit path had a valid authenticated browser user and its email API had a valid authenticated server user. Authentication is checked independently three times:

1. Browser at Submit start: `page.tsx:532-538`.
2. Server API during Submit: `owner-submit-email/route.ts:14-18` (and later `/api/profiling` and `/api/leads`).
3. Middleware/Server Components after navigation: `middleware.ts:28-43`, then dashboard layout/page.

The implementation has no explicit final session synchronization or verification before crossing from (1) to (3). It assumes that the cookie observed by the new protected request necessarily represents the browser client's current auth state. The runtime disproves that assumption. A full navigation still performs the same request-cookie lookup, explaining why the reverted navigation-only patch did nothing.

This evidence does **not** support saying that Supabase revoked or destroyed the session. It supports the narrower and exact finding that the application’s server-side protected-route checks received no recognizable user from the auth cookies at that boundary. There is no destructive auth operation in the traced path.

## Tenant-role failure

The owner role write is unverified and errors are silently ignored. The exact statement is:

```ts
await supabase
  .from("profiles")
  .update({ property_count: data.property_count, role: selectedRole })
  .eq("id", user.id);
```

It neither destructures `error` nor requests/validates the updated row. `/api/profiling` is then awaited only at the HTTP level; its non-2xx status is ignored. Inside `profileOwner()`, errors from the current-role read, property updates, and final profile update are also ignored. Consequently the UI can advance even if `profiles.role` remains its earlier/default value.

The presentation defect is explicit: dashboard layout uses `(profile?.role as UserRole) || "inquilino"`. Any profile-query error or missing role is labeled Tenant. The main dashboard page is inconsistent: it redirects to `/login` when the profile row is missing (`src/app/(dashboard)/dashboard/page.tsx:25-31`). Thus missing/unreadable profile state can produce either a Tenant shell or Sign In depending on which dashboard component completes its guard first, but it is not proof that auth itself changed the role.

# Exact Failure Sequence

1. Registration calls `auth.signUp()` with `user_metadata.role = "propietario"` and routes the customer to `/forms/propietario` (`register/page.tsx:104-140`).
2. Supabase’s `on_auth_user_created` trigger inserts `profiles` using `raw_user_meta_data.role`, falling back to `inquilino` only when that metadata value is absent (`migration_v9_admin_suite.sql:220-241`).
3. On final Submit, the browser client calls `auth.getUser()`. If it were null here, the form itself would immediately route to `/login` and no brief/email would occur. The observed email rules out this early branch for the reported run.
4. The handler inserts `discovery_briefs`; an error throws and prevents all later steps (`page.tsx:543-566`).
5. It launches `/api/owner-submit-email` without awaiting it (`page.tsx:578-591`). That API independently authenticates via server cookies and sends both commercial and customer messages. Email success occurs before property, role, profiling, and lead completion, so it is not evidence for those later writes.
6. For an ordinary owner, the handler inserts one `properties` row and throws on insert error (`page.tsx:670-708`). For an investor, each property error is only logged and the loop continues (`page.tsx:593-669`).
7. The handler computes the owner role and issues a `profiles` update, but ignores its error/result (`page.tsx:744-758`).
8. It POSTs `/api/profiling`, whose server auth guard is `route.ts:11-18`; it then calls `profileOwner()`, which again updates the role without checking the update error. The client ignores the API response status.
9. It POSTs `/api/leads`; that route also requires a cookie-authenticated user (`api/leads/route.ts:5-13`) and reads the current `profiles.role` to copy into the lead (`:17-46`). The client again ignores response status.
10. It calls `router.push("/dashboard/properties")`.
11. `middleware()` processes that protected URL and calls cookie-backed `auth.getUser()`. In the observed failing navigation it does not recognize a user; `middleware.ts:40-43` returns a redirect to `/login`. If middleware had recognized the user but server rendering did not, `DashboardLayout` would make the same decision at `layout.tsx:18`.
12. `/login` is rendered when middleware also does not recognize an authenticated cookie-backed user. If it did recognize one, `middleware.ts:46-50` would immediately send the request back to `/dashboard`. The fact that Sign In remains visible is additional evidence that the server boundary, not merely the dashboard page, is failing to recognize the cookie session.

# Session State Finding

**Answer to question 1:** the repository and runtime evidence do not show session destruction. They show a session that exists and authenticates browser/server work during Submit but is not recognized from cookies by the subsequent protected request.

Before Submit, `auth.getUser()` must return the user or the observed brief/email path cannot execute. After Submit starts, the delivered email demonstrates that `/api/owner-submit-email` also obtained `user` from the server cookie client. From that point through navigation there is no `signOut`, storage clearing, token clearing, cookie deletion, `setSession`, or auth-state replacement. Therefore “Submit logs the user out” is contradicted by the code.

The server clients do permit Supabase to refresh cookies: middleware copies `setAll` values into its response; the shared server helper calls `cookieStore.set`. In Server Components, however, failures from `cookieStore.set` are deliberately swallowed (`src/lib/supabase/server.ts:15-22`), making middleware/current browser cookies essential. The safe repair point is consequently before navigation, in the browser Submit flow, not a relaxation of protected-route guards.

# Owner Data Persistence Finding

The owner discovery brief is successfully saved before the success path can navigate: its insert error is checked and thrown (`page.tsx:543-566`). The observed email means execution passed that check.

The email does not prove later data writes because it is intentionally started early and fire-and-forget. For a standard Property Owner submission, reaching the final navigation proves the property insert returned without error because `propError` is thrown (`page.tsx:672-708`). Therefore the ordinary owner property record is saved before the redirect. For the investor branch, the code cannot make that guarantee: property insert errors are logged and submission continues (`page.tsx:643-645`). That is an existing persistence-risk distinction, not the cause of the reported standard-owner auth failure.

Image-row failures are also not promoted to Submit failures, but images are outside the stated auth/role cause.

# Role Persistence Finding

Registration is designed to save Property Owner correctly in two places:

- `auth.users.raw_user_meta_data.role` receives `propietario` from registration.
- `handle_new_user()` copies it to the canonical `profiles.role` row.

Final owner onboarding is designed to save one of `propietario`, `propietario_preferido`, or `inversionista`. But unlike the discovery brief and normal-owner property insert, this update is **not verified**. The code proceeds regardless of PostgREST/RLS/constraint/session errors. `profileOwner()` repeats the same silent-error pattern. Accordingly, the code cannot honestly guarantee that the final role was persisted merely because Submit navigated.

Why an owner can appear as Tenant:

1. An older or metadata-incomplete auth creation can take the trigger’s explicit fallback `inquilino`.
2. The ignored owner-role update can leave that value unchanged.
3. Even with a correct database role, a failed/missing profile read is rendered as `inquilino` by the layout fallback.

The dashboard itself retrieves role from `profiles`, not auth metadata (`dashboard/page.tsx:25-41`). The login page’s auth-metadata check is only for choosing the admin redirect (`login/page.tsx:59-68`) and does not classify customer dashboards.

# Relationship Between Sign-In Redirect and Tenant Misclassification

They are **two separate bugs with an adjacent failure surface**:

- Sign In: the protected request cannot recognize the Supabase user from auth cookies. Middleware or the dashboard auth guard redirects.
- Tenant: canonical `profiles.role` persistence is not verified, and the dashboard layout incorrectly defaults an absent/unreadable role to `inquilino`.

They can appear together because both are exposed during dashboard entry, but changing a role cannot recreate an auth cookie, and refreshing an auth cookie does not guarantee a failed role update persisted. Both must be evaluated in the same narrow Submit correction.

# Smallest Recommended Fix

For evaluation before implementation, make only these behavioral changes in the existing owner `onSubmit()`:

1. Keep all successful existing persistence and email ordering intact.
2. Capture and check the `profiles.update(...)` error, and request the updated `role` row (for example with `.select("role").single()`). Do not navigate unless it equals the computed owner role. This converts the silent Tenant-producing failure into an actionable Submit error.
3. Check `response.ok` for `/api/profiling` (and ensure its own role update errors become a non-2xx response) so it cannot silently undo/fail the verified role state.
4. Immediately before navigation, call the existing browser client’s `auth.refreshSession()`, reject a refresh error or missing session/user, and only then navigate with the existing router. This explicitly writes a current SSR-readable Supabase cookie instead of assuming the long onboarding/API sequence left the protected-navigation cookie current.
5. Navigate directly to the requested customer destination. `/dashboard/properties` is already valid and requires no dashboard redesign; `/dashboard` is also valid if product preference is to land on the overview. The mechanism is not the fix.

This is the smallest safe fix because it addresses the two demonstrated broken contracts—current cookie-backed session and verified canonical role—at their existing handoff. It leaves all authorization guards intact.

# Exact Files That Would Need Modification

Required:

- `src/app/forms/propietario/page.tsx` — verify the owner role update; verify the profiling response; explicitly refresh/verify the session immediately before the existing protected navigation.
- `src/lib/profiling.ts` — return/throw on the existing profile read/update errors so `/api/profiling` can truthfully report failure rather than success.

Potentially required only for clean error propagation (not for auth design):

- `src/app/api/profiling/route.ts` — if `profileOwner()` uses a structured error result rather than throwing, convert it to a non-2xx response. If `profileOwner()` throws, the existing catch already returns 500 and this file needs no change.

No schema, migration, RLS, middleware, login, dashboard, email, Stripe, or payment file is required for this fix.

# What Must Not Be Changed

- Do not repeat commit `67e1918` by changing only `router.push` to full browser navigation. The preview already disproved that hypothesis.
- Do not weaken or remove `middleware` authentication, and do not redesign it.
- Do not remove the dashboard layout/page auth guards.
- Do not change dashboard role families, tier rules, navigation, or customer-state architecture.
- Do not use `user_metadata.role` as the dashboard authority; `profiles.role` is the established canonical business role.
- Do not invent a profiles table or new resolver: the table and trigger already exist.
- Do not call `signIn`, store tokens manually, or place service-role credentials in the browser.
- Do not alter the early owner email call or its working Resend behavior.
- Do not change Stripe/payments, form questions, scoring, pricing, migrations, schema, or RLS.
- Do not make property/image persistence “fixes” as part of this auth/role correction.

# Risks of the Recommended Fix

- `refreshSession()` uses Supabase refresh-token rotation. It must be called once, awaited, and handled; adding parallel refreshes would create avoidable races.
- A network or Supabase outage at the final verification will now leave the user on the completed form with an error instead of pretending success and navigating. That is safer but requires a clear retry message and idempotency awareness because the brief/property may already exist.
- Adding `.single()` after the role update can expose a genuine RLS/policy failure that was previously hidden. That is desired diagnostic behavior; it must not be “solved” by moving a service-role client into the browser or relaxing RLS.
- `profileOwner()` currently performs several updates. Throwing on its profile error may surface partial profiling work. The change should be limited to accurate failure reporting, not a transaction/schema redesign.
- The existing investor branch can continue after individual property failures. That pre-existing risk should be recorded separately if encountered, not broadened into this fix.

# Expected Web Result After Implementation

On a fresh confirmed Property Owner account:

1. All six steps submit as today.
2. The discovery brief, ordinary-owner property, and working emails retain their existing behavior.
3. `profiles.role` is confirmed as `propietario` or `propietario_preferido` (or `inversionista` for the explicit investor path) before leaving the form.
4. The browser has a freshly verified Supabase session whose cookie is available to the next request.
5. `middleware()` recognizes the user and does not execute its `/login` redirect.
6. The dashboard server layout/page recognize the same user and canonical profile.
7. The customer lands directly on `/dashboard/properties` (or `/dashboard` if that existing target is deliberately selected), remains authenticated, and is rendered as Property Owner rather than Tenant.
