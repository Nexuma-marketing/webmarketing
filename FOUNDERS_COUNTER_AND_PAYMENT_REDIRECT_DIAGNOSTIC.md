# Founders Counter Update Logic

**It exists.** The Founders checkout is the ordinary one-time `service` checkout, not a separate Founders endpoint:

- `src/app/(dashboard)/dashboard/services/page.tsx:176-181` maps the displayed **Founders Package — Visionary Owners** card to the database service named **Plan: Founder Package — Visionary Owners**.
- `src/app/(dashboard)/dashboard/services/page.tsx:963-995` passes that service row's ID to `CheckoutButton` as `type="service"`.
- `src/components/checkout/checkout-button.tsx:35-54` posts the service ID to `/api/stripe/checkout` and navigates to the returned Stripe Checkout URL.
- `src/app/api/stripe/checkout/route.ts:115-246`, in `POST()`'s `case "service"`, creates the Checkout Session. It puts `user_id`, `service_id`, and `payment_type: "one_time"` in Stripe metadata (`:235-245`). The migration-defined Founders deposit is $200 (`supabase/migration_v31_milestone4_final_decisions.sql:98-115`).

The intended completion handler is `POST()` in `src/app/api/stripe/webhook/route.ts`. On `checkout.session.completed` (`:83-108`), it inserts a completed `payments` row. It then contains explicit Founders logic at `:110-135`: it loads the service named by `metadata.service_id`, tests the name with `/Founder.+Package/i`, reads `app_config(category='founders_plan', key='taken')`, and writes `current + 1`.

Therefore, this is **not an unimplemented feature**. For the reported payment, the counter remaining `0` means the webhook increment path did not complete successfully. A successful Stripe charge alone does not execute this code; Stripe must deliver a successfully verified `checkout.session.completed` event to `/api/stripe/webhook` in the same test-mode environment.

The repository alone does not contain the Stripe delivery log or deployed environment values, so it cannot distinguish conclusively among these runtime failure points:

1. The test-mode webhook endpoint was absent, pointed at another deployment, or did not receive `checkout.session.completed`.
2. Signature verification failed because the deployed `STRIPE_WEBHOOK_SECRET` did not match that endpoint (`webhook/route.ts:56-80`).
3. The event lacked `metadata.user_id`, causing an early exit at `:89-92`, or lacked `metadata.service_id`, skipping the Founders block at `:115`.
4. The service lookup/name match or the `app_config` read/update failed.

The last case is unnecessarily silent: none of the payment insert, service lookup, counter read, or counter update results are checked for Supabase errors. The outer handler can consequently return success even when a database operation failed. The increment is also a read-then-write operation rather than an atomic increment, although concurrency cannot explain a single purchase leaving `0` unless the write itself failed.

One additional distinction matters: `src/app/(dashboard)/dashboard/services/page.tsx:522-570` no longer uses `app_config.taken` for the customer-facing banner. It derives `foundersTaken` from the count of completed Founders payments. The admin pricing page still reads and edits the stored `app_config` value. This does not explain the direct query remaining `0`; it only means the stored counter and displayed count now have different sources.

# Payment Redirect to Sign In

The checkout return target **does exist and is the correct route path**. `src/app/api/stripe/checkout/route.ts:233` sets:

`<NEXT_PUBLIC_APP_URL>/dashboard/payments/success?session_id={CHECKOUT_SESSION_ID}`

The page exists at `src/app/(dashboard)/dashboard/payments/success/page.tsx`. Its route-group directory does not appear in the URL, so the public pathname is correctly `/dashboard/payments/success`. The page can retrieve and render the Stripe session (`:17-64`); there is no missing-page or malformed `session_id` bug that redirects to Sign In.

The immediate root cause of the observed Sign In navigation is authentication at the protected return boundary:

- Middleware classifies every `/dashboard/*` request as protected and redirects to `/login` when cookie-backed `supabase.auth.getUser()` returns no user (`src/middleware.ts:28-44`).
- If middleware passes, the dashboard layout performs the same check and redirects at `src/app/(dashboard)/layout.tsx:13-18`.
- The success page itself also explicitly redirects when no user is found (`success/page.tsx:22-28`).

Thus the returning request reached a valid but authenticated success route without a server-recognizable Supabase session cookie. Stripe did not instruct the application to go to `/login`; one of these guards did.

The risky part of the return configuration is that the origin is taken from the static `NEXT_PUBLIC_APP_URL` value (`src/lib/stripe.ts:22`), rather than from the authenticated checkout request's origin. If checkout was started on a Preview/custom hostname but `NEXT_PUBLIC_APP_URL` names a different hostname, the browser returns to that other host, where the host-scoped Supabase cookie is unavailable. That precisely produces the observed redirect. The repository has no checked-in environment file, so the deployed value and actual test hostname must be compared to confirm this underlying cause.

If both hostnames were identical, the remaining diagnosis is still a cookie/session-recognition failure (expired/stale/missing Supabase cookie), not a missing success page. A normal top-level GET back from Stripe does not inherently remove a same-site application cookie; the external redirect by itself is insufficient to explain the loss.

# Are These Two Issues Related

They are **independent execution paths**:

- The counter is updated asynchronously by Stripe's server-to-server webhook. It does not depend on the browser returning, the success page rendering, or the user's cookie.
- The success-page redirect is decided by browser cookie authentication in middleware/layout/page. It does not invoke the webhook or update the counter.

They can share a deployment-configuration theme—for example, a Preview test could have a production `NEXT_PUBLIC_APP_URL` while Stripe test-mode webhooks target the wrong deployment—but there is no single application handler responsible for both. Fixing the return cookie/origin would not make a missing webhook increment run, and fixing the webhook would not authenticate the success-page request.

# Recommended Fix

For the counter, verify the test-mode Stripe endpoint and its signing secret against the deployment that created the session, then make the webhook mutation observable and reliable: check and log/throw every relevant Supabase error, identify Founders purchases with stable metadata rather than a service-name regex, make the increment atomic, and make processing idempotent by Stripe event/session ID so retries cannot double-count. Decide whether `app_config.taken` remains canonical; the current services banner instead counts completed payment rows, so maintaining both sources invites drift.

For the redirect, ensure Checkout returns to the exact origin on which the user authenticated, or intentionally configure authentication cookies for the supported canonical host and always start checkout there. Keep `/dashboard/payments/success` protected if confirmation details are user-specific, but preserve/refresh and verify the Supabase browser session before leaving for Stripe. The success page should also verify that the retrieved Checkout Session belongs to the authenticated user before displaying details.

No code or migration fix was implemented as part of this diagnostic.
