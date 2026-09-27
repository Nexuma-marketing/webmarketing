# Confirm Route Code (as currently checked in)

The complete checked-in contents of `src/app/auth/confirm/route.ts` are:

```ts
import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

// Supabase email links (magic link, recovery, invite, etc.)
// redirect here with token_hash & type parameters.
// We verify the OTP server-side, then redirect the user.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = searchParams.get("next") ?? "/dashboard";

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type: type as "recovery" | "signup" | "email",
      token_hash,
    });

    if (!error) {
      // Password recovery → send to reset-password page
      if (type === "recovery") {
        return NextResponse.redirect(`${origin}/reset-password`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // If verification fails, redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=invalid_link`);
}
```

The route reads exactly three **query-string** parameters:

- `token_hash` (required to enter the verification branch)
- `type` (required; passed to `verifyOtp`, with only a TypeScript cast and no runtime validation)
- `next` (optional, defaulting to `/dashboard`; ignored for successful `type=recovery`, which always redirects to `/reset-password`)

It does **not** read `token`, `access_token`, `refresh_token`, `code`, `error`, `error_code`, or any URL fragment. It calls `verifyOtp({ token_hash, type })`; it does not call `exchangeCodeForSession`.

# Expected vs Actual Link Format (query string vs hash fragment)

There are three relevant formats:

1. A custom server-verification template can link directly to the application as `/auth/confirm?token_hash=...&type=recovery`. This is the **only** format the checked-in confirm route handles.
2. Supabase's standard `{{ .ConfirmationURL }}` points first to Supabase Auth's `/auth/v1/verify?token=...&type=recovery&redirect_to=...` endpoint. After Supabase consumes the token, an implicit-flow success redirects to the supplied application URL with session values in the URL fragment (`#access_token=...&refresh_token=...&type=recovery`). A server route cannot read that fragment because browsers never send fragments in HTTP requests.
3. With PKCE, successful verification redirects to the application with `?code=...`, which must be passed to `exchangeCodeForSession(code)`. Supabase documents that `@supabase/ssr` clients use PKCE by default. This repository creates the requesting browser client with `createBrowserClient` from `@supabase/ssr`, without overriding its flow type (`src/lib/supabase/client.ts`, lines 1-7). The current confirm route does not read or exchange `code` either.

The supplied failed browser URL is important evidence:

```text
/login?error=invalid_link#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb=
```

The query part, `?error=invalid_link`, is generated only by the application's confirm route fallback at `src/app/auth/confirm/route.ts:30`. This proves that `/auth/confirm` ran without a usable `token_hash`/`type` pair or that `verifyOtp` failed.

The fragment, beginning `#error=access_denied`, is Supabase Auth redirect output. Its presence is consistent with the standard `{{ .ConfirmationURL }}` flow, not with a template that directly supplies `token_hash` to the application route. Fragments are preserved client-side across this redirect sequence but cannot be inspected by the server handler.

Therefore, the checked-in route is not compatible with the standard confirmation-link redirect format. On a successful PKCE redirect it would receive `code`, not `token_hash`; on an implicit redirect it would receive no server-visible credentials because they are in the fragment. In either case, the route falls through to `?error=invalid_link`.

The exact successful format currently emitted by this hosted project's template cannot be proven from repository files alone because the deployed Auth template and Auth project configuration are not checked in. The use of `@supabase/ssr` makes PKCE `?code=...` the expected success format if the hosted template uses the standard `{{ .ConfirmationURL }}`. The observed error format is definitively a fragment, but an error redirect does not prove whether a successful request would have produced an implicit token fragment or a PKCE code.

References: [Supabase Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates), [Supabase PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow), and [Supabase SSR advanced guide](https://supabase.com/docs/guides/auth/server-side/advanced-guide).

# Supabase Email Template / Redirect Flow Type Check

No `supabase/config.toml`, local Auth email-template HTML, `mailer_templates_recovery` setting, `{{ .ConfirmationURL }}`, or `{{ .TokenHash }}` customization exists in this repository. The hosted template is therefore not accessible from the checked-in project and must be inspected directly in **Supabase Dashboard > Authentication > Email Templates > Reset Password** (or through the Supabase Management API with authorized project access).

The exact `href` of the reset button must be checked:

- If it is `<a href="{{ .ConfirmationURL }}">`, Supabase generates a URL on the Supabase Auth `/verify` endpoint. That endpoint consumes the OTP and redirects to the `redirectTo` passed by `resetPasswordForEmail`. This does **not** send `token_hash` directly to `/auth/confirm`.
- If the app intends to retain the current `verifyOtp` route, the template must instead construct an application URL containing `token_hash={{ .TokenHash }}` and `type=recovery`, with careful URL encoding and an allowed application origin.
- Also check whether Resend click/open tracking rewrites the link. Supabase explicitly warns that external-provider link tracking can break authentication links and recommends disabling it.

The caller supplies `redirectTo` as `${window.location.origin}/auth/confirm?next=/reset-password` in `src/app/(auth)/login/page.tsx:80-82`. This explains the Vercel preview deployment origin in the reported URL. That precise origin/pattern must also be present in Supabase Auth's Redirect URL allow list; however, a disallowed redirect normally changes/falls back from the intended destination and does not by itself explain the confirmed `otp_expired` result.

# Middleware Interference Check

Middleware is not blocking this request.

`src/middleware.ts:77-79` matches only:

```ts
matcher: ["/dashboard/:path*", "/admin/:path*", "/forms/propietario/add-property", "/login", "/register"]
```

`/auth/confirm` is absent, so the middleware does not run for that route. In addition, the middleware's unauthenticated redirect applies only to `/dashboard`, `/admin`, and `/forms/propietario/add-property` (`src/middleware.ts:32-44`). An unauthenticated recovery request is therefore allowed to reach the confirm handler.

# Root Cause Assessment

**Confirmed application defect:** `/auth/confirm` expects a direct custom-template query string containing `token_hash` and `type`, but the evidence indicates the hosted email is using Supabase's standard verification/redirect mechanism. The route handles neither of that mechanism's success outputs: PKCE `?code=...` nor implicit `#access_token=...`. This mismatch independently guarantees `login?error=invalid_link` after an otherwise successful standard confirmation redirect.

**Separate, strongly indicated delivery/link-consumption defect:** the `#error_code=otp_expired` value was generated upstream by Supabase Auth's verification endpoint. The application does not generate that fragment, and the confirm route's format mismatch cannot cause Supabase's OTP to become expired. Given that the human used the email immediately and only once, Supabase identifies automatic email-provider/security-scanner prefetching as the most common cause: the scanner follows `{{ .ConfirmationURL }}` first and consumes the one-time token. Resend link tracking can also rewrite/follow authentication links and must be checked and disabled. Supabase Auth logs for the `/verify` requests should be inspected to confirm two accesses, their timestamps, IPs, and user agents. See [Supabase's OTP verification failure guidance](https://supabase.com/docs/guides/troubleshooting/otp-verification-failures-token-has-expired-or-otp_expired-errors-5ee4d0).

Thus the likely incident is not one issue but two: premature OTP consumption produces the reported `otp_expired` fragment, while the confirm route is also structurally incompatible with the normal successful redirect and would fail even after the prefetch problem were removed.

# Recommended Fix (describe only, do not implement)

Choose one coherent recovery design and align the template and callback; do not mix them:

1. **PKCE callback design:** keep the standard `{{ .ConfirmationURL }}`, update `/auth/confirm` to accept `code`, exchange it with `exchangeCodeForSession(code)`, preserve the resulting session cookies on the redirect response, and then redirect to `/reset-password`. This matches `@supabase/ssr`'s default PKCE behavior. The existing `src/app/api/auth/callback-recovery/route.ts` demonstrates a code-exchange pattern but is not the current `redirectTo` target.
2. **Direct token-hash design:** customize the Reset Password email template to link to `/auth/confirm?token_hash={{ .TokenHash }}&type=recovery...`, matching the current `verifyOtp` handler. Confirm the Site URL/redirect origin and encoding. A direct GET that immediately calls `verifyOtp` remains vulnerable to link scanners, so it should not be the final scanner mitigation by itself.

Separately mitigate first-click token consumption: disable Resend click tracking/link rewriting, inspect Supabase Auth logs, and use Supabase's recommended scanner-resistant flow if scanning is confirmed. The robust choices are an intermediate application page requiring a deliberate user action before following/consuming the real confirmation URL, or a recovery OTP that the user manually enters and the application verifies. Merely increasing expiry time will not solve a one-time token already consumed by a scanner.

No fix was implemented as part of this diagnostic.
