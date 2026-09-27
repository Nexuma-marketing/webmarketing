# Current Raw Body Handling (exact code, correct or incorrect)

The signature-verification section in `src/app/api/stripe/webhook/route.ts` currently begins with:

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
```

This is **correct** raw-body handling for a Next.js App Router route. `Request.text()` consumes the request body directly and returns its decoded text; the code does not call `request.json()`, parse JSON, re-stringify an object, or otherwise transform the payload before verification. Stripe's Node SDK accepts a raw string or buffer as the first `constructEvent()` argument, so passing the direct result of `await request.text()` follows Stripe's documented requirement.

There are no route-segment configuration exports in this module: no `runtime`, `dynamic`, `preferredRegion`, or body-parser configuration is declared. App Router route handlers use the Web `Request` API and do not use the Pages Router `bodyParser` mechanism. Nothing in this module configures Next.js to pre-parse the request body.

The repository declares Next.js `16.2.3`. The repository's `node_modules` directory is absent in this checkout, so the bundled documentation requested by `AGENTS.md` could not be inspected locally. That limitation does not change the direct code finding above.

# Current Signature Header Handling

The signature is read with:

```ts
const signature = request.headers.get("stripe-signature");
```

This is correct. Fetch/Web API `Headers.get()` performs case-insensitive header lookup, and `stripe-signature` is the correct Stripe header name. If the header is absent, the route returns HTTP 400 with `{"error":"Missing stripe-signature header"}`.

No code modifies the header value before it is passed to Stripe.

# Current constructEvent() Call

The call is:

```ts
event = stripe.webhooks.constructEvent(
  body,
  signature,
  process.env.STRIPE_WEBHOOK_SECRET!
);
```

The arguments are in the correct order:

1. The direct text read from the incoming request body.
2. The value of the incoming `stripe-signature` header.
3. `process.env.STRIPE_WEBHOOK_SECRET`.

The non-null assertion (`!`) affects TypeScript only; it does not alter the environment-variable value at runtime and does not validate that the value exists. Between receiving the `Request` and calling `constructEvent()`, the only body operation is the single `await request.text()` call. There is no JSON parsing, serialization, trimming, normalization, or re-encoding performed by application code.

# Root Cause Assessment (does this explain the persistent 401, yes/no/uncertain)

**No: the inspected route's raw-body handling does not explain persistent signature failures.** It follows the expected raw-body pattern.

There is also an important status-code mismatch: this route returns HTTP **400**, not 401, both when the signature header is missing and when `constructEvent()` throws. There is no 401 response anywhere in this route. The repository middleware does not cover the webhook path; its matcher is limited to `/dashboard/:path*`, `/admin/:path*`, `/forms/propietario/add-property`, `/login`, and `/register`.

Consequently, if Stripe's delivery log literally records HTTP **401**, that response is unlikely to come from this signature-verification catch block. It indicates one of the following is more likely:

- the request is being rejected before it reaches the route, such as by access/deployment protection on the Preview deployment;
- Stripe is reaching a different deployment or different deployed revision than the file inspected here; or
- another upstream layer is returning the 401.

If "401 signature verification error" is only a description and the actual response is HTTP 400 with `{"error":"Invalid signature"}`, the cause remains uncertain but is not an application-level body mutation visible in this route. In that case, likely remaining causes include a deployed environment/secret mismatch, an absent secret at runtime, hidden whitespace in the configured value, or a signing secret from a different Stripe endpoint/account/mode than the event source.

# Recommended Fix (describe only, do not implement)

No raw-body code change is recommended based on this inspection. Keep `await request.text()` and the current `constructEvent(body, signature, secret)` ordering.

First, verify the exact HTTP status and response body shown for a failed delivery in Stripe. If it is 401, check whether the Preview deployment has Vercel Deployment Protection or another upstream authentication layer enabled, and confirm from Vercel function logs that this route is actually invoked. A request rejected upstream must be allowed to reach this webhook path, or Stripe must target an unprotected deployment URL.

If the response is instead this handler's 400 `Invalid signature`, compare the deployed commit with this source, confirm `STRIPE_WEBHOOK_SECRET` is available to that exact deployment and is non-empty at runtime without logging the secret itself, remove any accidental whitespace/newline from the value, and verify that the secret belongs to the same Stripe account, live/test mode, and webhook endpoint that generated the delivered event. Redeploy after any environment-variable correction because an existing deployment does not necessarily acquire changed environment values.
