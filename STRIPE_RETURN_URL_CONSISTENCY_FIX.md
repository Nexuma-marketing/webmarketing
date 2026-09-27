# URLs Audited

The audit covered every Stripe Checkout Session constructor and every success, cancel, return, or webhook URL reference in the payment flow.

| File and line | URL role | Result |
|---|---|---|
| `src/lib/stripe.ts:22` | Shared application origin (`APP_URL`) | Previously read `NEXT_PUBLIC_APP_URL` but contained a hardcoded `http://localhost:3000` fallback. It now reads exclusively from `process.env.NEXT_PUBLIC_APP_URL`. |
| `src/app/api/stripe/checkout/route.ts:233` | One-time service checkout success URL | Correctly uses `${APP_URL}/dashboard/payments/success?session_id={CHECKOUT_SESSION_ID}`. |
| `src/app/api/stripe/checkout/route.ts:234` | One-time service checkout cancel URL | Correctly uses `${APP_URL}/dashboard/services?cancelled=true`. |
| `src/app/api/stripe/checkout/route.ts:343` | PYMES upfront checkout success URL | Correctly uses `${APP_URL}/dashboard/payments/success?session_id={CHECKOUT_SESSION_ID}&plan=${plan.plan_type}`. |
| `src/app/api/stripe/checkout/route.ts:344` | PYMES upfront checkout cancel URL | Correctly uses `${APP_URL}/dashboard/services?cancelled=true`. |
| `src/components/checkout/checkout-button.tsx:40-54` | Navigation from the app to hosted Stripe Checkout | Correctly navigates to the Checkout Session URL returned by the server. This is not the post-payment return origin and should not reconstruct it from `window.location`. |
| `src/app/api/stripe/webhook/route.ts:56-74` | Stripe webhook receiver | No outbound webhook URL is constructed in code. The application exposes the relative inbound route `/api/stripe/webhook` and verifies requests with `STRIPE_WEBHOOK_SECRET`; the full endpoint origin is configured in Stripe, as the user has already corrected. |

There are no `return_url` fields or additional `success_url`/`cancel_url` constructors elsewhere in `src`. Both Checkout Session branches use the same `APP_URL` export. No checkout return URL is sourced from `window.location`, request headers, or a request-derived origin.

The legal-document links embedded in Stripe Checkout custom text at `src/app/api/stripe/checkout/route.ts:213` and `:324` still contain `webmarketing-lyart.vercel.app`. They are not success, cancel, return, or webhook URLs, so they are outside this narrowly defined task and were intentionally not changed.

# Fixes Applied

Changed only `src/lib/stripe.ts` so `APP_URL` has no hardcoded environment fallback:

```ts
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;
```

Consequently, all Stripe Checkout success and cancel URLs are now sourced exclusively from `NEXT_PUBLIC_APP_URL`. Changing that Vercel variable to `https://nexuma.ca` later will require no code change.

# Session Refresh Check on Success Page

**Found working; no change applied.**

The success page is an authenticated Server Component. `src/app/(dashboard)/dashboard/payments/success/page.tsx:23-28` creates the cookie-backed Supabase server client and verifies the user with `supabase.auth.getUser()` before rendering.

More importantly, `/dashboard/payments/success` is matched by `src/middleware.ts:35-44,77-78`. Middleware creates a Supabase server client from the incoming cookies, calls `auth.getUser()`, and its `setAll` implementation copies any refreshed auth cookies to both the request and outgoing response (`middleware.ts:7-30`). This is the correct refresh/verification boundary for the returning top-level request. The dashboard layout and success page then independently verify the user again.

There is no separate session-refresh gap on the success page that warrants a scoped fix. With the return host now matching the host where the user authenticated, the existing middleware can receive and refresh the Supabase cookie before the page renders.

# What Was Intentionally Not Changed

- No environment variable value or Vercel configuration was changed.
- No Stripe dashboard or webhook endpoint configuration was changed.
- No webhook handler logic was changed, including Founders counter updates and payment insertion.
- No service, plan, pricing, promotion, receipt, refund, subscription, or other payment business logic was changed.
- No non-payment file was changed.
- The hardcoded legal-document links inside Stripe Checkout copy were recorded above but left untouched because they are not payment return/webhook URLs.
- No commit, push, deployment, or migration was performed.

# Expected Result

New Stripe Checkout Sessions created in the test deployment will build both success and cancel URLs from the confirmed Vercel `NEXT_PUBLIC_APP_URL` value: `https://nexuma-git-fix-auth-dashboard-nexuma.vercel.app`.

After successful payment, Stripe will return the browser to that same authenticated origin at `/dashboard/payments/success`. The existing middleware should receive the origin's Supabase cookie, refresh it if necessary during `auth.getUser()`, and allow the success page to render. Cancellation will likewise return to `/dashboard/services?cancelled=true` on the same configured origin.

The separately corrected Stripe dashboard webhook endpoint will target `/api/stripe/webhook` on that deployment; this code change does not alter webhook processing.
