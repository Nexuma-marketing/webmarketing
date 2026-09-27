# Root Cause Confirmed

`src/app/auth/confirm/route.ts` previously accepted only `token_hash` and `type`, then called `supabase.auth.verifyOtp`. The password-recovery request is initiated by an `@supabase/ssr` browser client using PKCE, so Supabase redirects a successful standard confirmation link to the callback with `?code=...`. Because the route did not read or exchange that code, it always fell through to `/login?error=invalid_link`.

# Exact Fix Implemented (code exchange handling added)

The confirm route now reads `code` and checks that branch before the existing token-hash branch. When a code is present, it:

1. Builds the successful redirect response.
2. Creates an `@supabase/ssr` server client whose cookie adapter reads the incoming request cookies, including the PKCE verifier cookie.
3. Writes all cookies produced by Supabase directly onto that same redirect response.
4. Calls `supabase.auth.exchangeCodeForSession(code)`.
5. Returns the response only when the exchange succeeds.

For an explicit `type=recovery`, the destination is `/reset-password`. Standard PKCE recovery redirects do not necessarily include `type`, so when it is absent the route respects the existing `next` value. The unchanged password-reset request supplies `next=/reset-password`, producing the required destination.

If code exchange fails, execution reaches the existing `/login?error=invalid_link` fallback.

# Fallback Branch Preserved (confirm token_hash/verifyOtp still works if used)

The existing `token_hash` plus `type` branch remains in place and still calls:

```ts
supabase.auth.verifyOtp({
  type,
  token_hash,
});
```

It retains the recovery redirect to `/reset-password` and the existing `next` behavior for other supported email OTP types. Its server client now uses the same response-bound cookie adapter, ensuring a successful OTP verification's session cookies are attached to the returned redirect response.

# File Modified

- `src/app/auth/confirm/route.ts`
- `PASSWORD_RESET_CONFIRM_ROUTE_FIX.md` (this requested implementation report)

# What Was Intentionally Not Changed

- The `resetPasswordForEmail` call and its `redirectTo` in `src/app/(auth)/login/page.tsx` were not changed; no change was required because its existing `next=/reset-password` parameter supplies the correct PKCE success destination.
- `src/app/api/auth/callback/route.ts` and `src/app/api/auth/callback-recovery/route.ts` were not changed. The latter's request/response-bound cookie pattern was reused in the confirm route.
- Middleware, all other auth pages and routes, application code, database objects, RLS policies, and grants were not changed.
- The separate email-scanner/click-tracking premature-consumption issue was not addressed.
- Nothing was committed, pushed, or deployed.

# Expected Result

On a valid, unconsumed recovery link, Supabase redirects to `/auth/confirm?code=...&next=/reset-password`. The route exchanges the PKCE code, returns the resulting session cookies with its redirect, and sends the browser to `/reset-password`. That page can then read the authenticated recovery session and call `supabase.auth.updateUser({ password })` successfully.

Custom email templates that still send `token_hash` and `type` directly remain supported through the preserved fallback branch. Invalid or failed exchanges continue to redirect to `/login?error=invalid_link`.
