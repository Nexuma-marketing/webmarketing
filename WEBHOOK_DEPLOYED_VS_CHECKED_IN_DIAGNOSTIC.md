# Commit/Deployment Cross-Reference (and limitations in confirming this)

The local checkout is on branch `fix/auth-dashboard`. Both the local branch and the locally available remote-tracking ref `origin/fix/auth-dashboard` point to:

```text
c1699393fca7c821cb2b692a82bc17818f7e2728
```

The working-tree copy of `src/app/api/stripe/webhook/route.ts` is unmodified relative to that commit. Its Git blob ID in both `HEAD` and the working tree is:

```text
4bf64eda6c2817e1970f088d3068db472c13df45
```

The most recent commit that changed this route file is:

```text
b717bd18e27cbd130ae4c08213e400c466c1c801
b717bd1 Steve baseline for preview test
```

There is no route-file diff between `b717bd18...` and the current branch head `c1699393...`. Thus the exact checked-in route at `c1699393...` is the handler analyzed here.

The repository has a public diagnostic route, `/api/health`, designed to report `VERCEL_GIT_COMMIT_SHA` and `VERCEL_GIT_COMMIT_REF`. A direct request to the documented branch Preview URL, `https://nexuma-git-fix-auth-dashboard-nexuma.vercel.app/api/health`, received a 302 redirect to Vercel SSO/Deployment Protection rather than the health JSON. No bypass credential was available for that request. A request to the older `https://webmarketing-lyart.vercel.app/api/health` received Vercel's `404 DEPLOYMENT_NOT_FOUND` response.

Therefore, this diagnostic **cannot directly confirm the commit deployed by Vercel**. Local Git refs are not proof of a particular deployment. The deployment's commit must be obtained from the Vercel deployment details or from `/api/health` using the working protection bypass, then compared with `c1699393fca7c821cb2b692a82bc17818f7e2728`.

# Environment-Specific Code Paths Checked

The full `src/app/api/stripe/webhook/route.ts` was re-read, including a character-visible inspection from the end of `loadEmailContext()` through signature verification and the beginning of the switch.

The operative sequence is exactly:

```ts
export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const metadata = session.metadata || {};
        const userId = metadata.user_id;
        const paymentType = metadata.payment_type || "one_time";

        if (!userId) break;

        await supabaseAdmin.from("payments").insert({
```

There are no hidden characters, altered string literals, conditional-compilation directives, feature flags, or intervening statements in this sequence.

The route contains no checks of `NODE_ENV`, `VERCEL_ENV`, `VERCEL`, branch name, hostname, Preview/Production state, or any feature flag. It has no route-segment exports such as `runtime`, `dynamic`, or `preferredRegion`, and no Pages Router body-parser configuration. No environment-specific path disables the switch or the payment insert.

Given the supplied live event, `metadata.user_id` is the non-empty string `dab83a7f-ee23-4624-85e2-ab944d6781fb`. Therefore, in this checked-in code, `if (!userId) break` is false and execution must immediately evaluate and await `supabaseAdmin.from("payments").insert(...)`.

# Middleware Interference Check

`src/middleware.ts` was checked in full. Its matcher is exactly:

```ts
export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/forms/propietario/add-property", "/login", "/register"],
};
```

`/api/stripe/webhook` matches none of these entries. The middleware therefore does not run for this webhook URL and cannot short-circuit it, consume its body, replace its response, or suppress its database activity.

The middleware's internal `isProtected` checks also cover only `/dashboard`, `/admin`, and one form page. Even if considered independently of the matcher, they do not classify the Stripe webhook as protected.

`next.config.ts` contains only image remote-pattern configuration. It defines no redirects, rewrites, headers, proxy, or route mapping. No `vercel.json` or checked-in `.vercel` routing configuration exists. No checked-in wrapper was found that intercepts this API route.

# Duplicate/Legacy Handler Check

Two webhook-named handlers exist:

- `src/app/api/stripe/webhook/route.ts` maps to `/api/stripe/webhook` and is the Stripe signature-verifying handler.
- `src/app/api/webhooks/route.ts` maps to `/api/webhooks` (plural) and is a generic Make/Zapier endpoint authenticated with `x-api-key`.

The generic handler does not verify Stripe signatures and does not recognize `checkout.session.completed`; it expects JSON shaped as `{ event, data }`. However, it is a different URL. Because there is no rewrite or redirect between the two paths, it cannot handle a request actually sent to `/api/stripe/webhook`.

No second file maps to `/api/stripe/webhook`. The occurrences of `webmarketing-lyart.vercel.app` elsewhere are hardcoded or fallback links in checkout/legal text, emails, scripts, and documentation. They do not register another webhook handler or change Next.js routing. They may create endpoint-origin confusion in external configuration, but they cannot make this checked-in route silently choose different code after the request reaches it.

# Best Remaining Explanation

With all three live facts now stipulated—`event.type` is exactly `checkout.session.completed`, `metadata.user_id` is truthy, and signature verification succeeds—the checked-in handler has **no control-flow divergence before the first Supabase operation**. JavaScript must proceed to the awaited `payments` insert. Supabase's query builder performs its HTTP request when awaited. Even a database/RLS/schema failure should involve an outgoing request; returned Supabase errors may be ignored by this code, but they cannot explain the absence of an attempted network call.

Also, “No logs found” is not independently suspicious for this source. The handler has no normal progress logs. It logs only signature-verification exceptions and thrown handler exceptions. A normal invocation, including one whose Supabase calls return non-throwing `{ error }` results, can have zero console output.

The strongest remaining explanation is therefore an **identity/observability mismatch**, not another branch in the checked-in source:

1. Most likely, the Vercel invocation being inspected is not running this route blob/commit—because the deployment is older, belongs to a different project/deployment alias, or the Stripe endpoint and inspected invocation are associated with different deployment URLs.
2. Alternatively, the Vercel “External APIs” panel is not recording the Supabase `fetch` made by `@supabase/supabase-js` for that invocation. In that case “No outgoing requests” is not proof that the line did not execute. Function logs, Supabase API logs, or temporary explicit instrumentation would be needed later to distinguish execution from telemetry omission.
3. Less likely, the inspected Vercel request is a different Stripe delivery/event than the Dashboard event whose metadata was examined. Correlating Stripe's event ID/request timestamp with the exact Vercel invocation is necessary.

The first decisive cross-check is the deployment commit. Use the protected `/api/health` endpoint or Vercel deployment details to obtain `VERCEL_GIT_COMMIT_SHA`. If it is not `c1699393fca7c821cb2b692a82bc17818f7e2728` (or another explicitly verified commit containing blob `4bf64eda...` at this route), the deployed-versus-checked-in mismatch is confirmed. If the commit and exact invocation/event identity match, the remaining evidence points to Vercel's outgoing-request observability being incomplete rather than to any silent early-exit path present in this code.
