# Full Webhook Handler Code (as currently deployed/checked in)

The following is the complete checked-in `POST` handler from `src/app/api/stripe/webhook/route.ts`. This inspection can establish the checked-in code; it cannot independently prove that the same revision is currently deployed to Vercel.

```ts
Failed to connect to user scope bus via local transport: Operation not permitted (consider using --machine=<user>@.host --user to connect to bus of other user)
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
      // ── Checkout completed (one-time or upfront) ──
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const metadata = session.metadata || {};
        const userId = metadata.user_id;
        const paymentType = metadata.payment_type || "one_time";

        if (!userId) break;

        // Record payment
        await supabaseAdmin.from("payments").insert({
          user_id: userId,
          service_id: metadata.service_id || null,
          pymes_plan_id: metadata.pymes_plan_id || null,
          stripe_session_id: session.id,
          stripe_payment_intent_id:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : null,
          amount: (session.amount_total || 0) / 100,
          currency: "CAD",
          payment_type: paymentType,
          status: "completed",
        });

        // Steve 5/22 Milestone 4 (#7 docx): when an owner buys the
        // Founders Package, increment the `founders_plan.taken` counter
        // in app_config so the "X owners have already chosen" banner on
        // /dashboard/services + the public landing reflects reality.
        // Match by service name so we don't have to hard-code the UUID.
        if (metadata.service_id) {
          const { data: svc } = await supabaseAdmin
            .from("services")
            .select("name")
            .eq("id", metadata.service_id)
            .single();
          if (svc?.name && /Founder.+Package/i.test(svc.name as string)) {
            const { data: counter } = await supabaseAdmin
              .from("app_config")
              .select("value")
              .eq("category", "founders_plan")
              .eq("key", "taken")
              .single();
            const current = Number((counter?.value as string | undefined) ?? "0") || 0;
            await supabaseAdmin
              .from("app_config")
              .update({ value: String(current + 1) })
              .eq("category", "founders_plan")
              .eq("key", "taken");
          }
        }

        // If upfront PYMES payment, create installment subscription
        if (
          paymentType === "upfront" &&
          metadata.pymes_plan_id &&
          Number(metadata.installment_months) > 0
        ) {
          const installmentAmount = Number(metadata.installment_amount) || 0;
          const installmentMonths = Number(metadata.installment_months) || 0;

          if (installmentAmount > 0 && installmentMonths > 0) {
            const price = await stripe.prices.create({
              currency: "cad",
              unit_amount: Math.round(installmentAmount * 100),
              recurring: { interval: "month", interval_count: 1 },
              // Steve 5/20 Milestone 4: tax-exclusive so Stripe Tax
              // adds 5% GST on top of each monthly installment.
              tax_behavior: "exclusive",
              product_data: {
                name: `${metadata.plan_type} Plan — Monthly Installment`,
              },
            });

            const customerId =
              typeof session.customer === "string"
                ? session.customer
                : session.customer?.id;

            if (customerId) {
              // Steve 6/10 (6-2.md #51): same GST workaround as the
              // checkout sessions — if STRIPE_GST_RATE_ID is set, apply
              // the manual 5% rate to the subscription. Otherwise fall
              // back to automatic_tax (will yield 0 until Alex adds a
              // CRA registration in Stripe Dashboard).
              const gstRateId = process.env.STRIPE_GST_RATE_ID || null;
              await stripe.subscriptions.create({
                customer: customerId,
                items: [
                  {
                    price: price.id,
                    ...(gstRateId ? { tax_rates: [gstRateId] } : {}),
                  },
                ],
                ...(gstRateId ? {} : { automatic_tax: { enabled: true } }),
                metadata: {
                  user_id: userId,
                  pymes_plan_id: metadata.pymes_plan_id,
                  total_installments: String(installmentMonths),
                },
              });
            }
          }
        }

        // Update lead status
        await supabaseAdmin
          .from("leads")
          .update({ status: "en_proceso" })
          .eq("user_id", userId)
          .in("status", ["nuevo", "contactado"]);

        // Steve 5/20 Milestone 4: send the customer-facing receipt.
        // session.amount_total already includes any tax Stripe added,
        // session.amount_subtotal is pre-tax. We send both so the
        // receipt shows the GST line item the same way Stripe does.
        const ctx = await loadEmailContext(
          userId,
          metadata.service_id || null,
          metadata.pymes_plan_id || null,
        );
        if (ctx) {
          const subtotalCents = session.amount_subtotal ?? session.amount_total ?? 0;
          const taxCents = (session.total_details?.amount_tax ?? 0) as number;
          await sendPaymentReceiptEmail({
            to: ctx.email,
            customerName: ctx.name,
            serviceName: ctx.serviceName,
            amountCents: subtotalCents,
            taxCents,
            currency: (session.currency || "cad").toUpperCase(),
            receiptUrl: null,
          });
        }

        break;
      }

      // ── Recurring installment payment ──
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;

        // Steve 6/11 (6-2.md #53): plan balance invoice path.
        // Created by /api/admin/properties/[id]/balance-invoice when
        // Sales toggles Available -> false. Identified by
        // metadata.kind === "plan_balance". Updates the property row
        // so the admin UI shows "Arrendada - Pagado".
        if (invoice.metadata?.kind === "plan_balance") {
          const propertyId = invoice.metadata?.property_id;
          if (propertyId) {
            await supabaseAdmin
              .from("properties")
              .update({
                balance_invoice_status: "paid",
                balance_invoice_paid_at: new Date().toISOString(),
                // Steve 6/11: also drop a row in payments so the
                // balance shows up in /admin/reports and the
                // customer's /dashboard/payments history.
              })
              .eq("id", propertyId);

            // Insert a payments row mirroring the invoice. Owner
            // resolved via property.owner_id.
            const { data: prop } = await supabaseAdmin
              .from("properties")
              .select("owner_id")
              .eq("id", propertyId)
              .single();
            if (prop?.owner_id) {
              await supabaseAdmin.from("payments").insert({
                user_id: prop.owner_id,
                stripe_session_id: invoice.id,
                // Steve 6/11: Stripe SDK v18 dropped the convenience
                // `payment_intent` getter on Invoice. Pull it via the
                // expanded charge data if available, otherwise leave
                // null — reconcile-from-stripe can backfill later.
                stripe_payment_intent_id: null,
                amount: (invoice.amount_paid || 0) / 100,
                currency: (invoice.currency || "cad").toUpperCase(),
                payment_type: "plan_balance",
                status: "completed",
              });
            }
          }
          break;
        }

        const subDetails = invoice.parent?.subscription_details;
        if (!subDetails?.subscription) break;

        const subscriptionId =
          typeof subDetails.subscription === "string"
            ? subDetails.subscription
            : subDetails.subscription.id;

        const subscription =
          await stripe.subscriptions.retrieve(subscriptionId);
        const metadata = subscription.metadata || {};
        const userId = metadata.user_id;
        const pymesPlanId = metadata.pymes_plan_id;
        const totalInstallments = parseInt(
          metadata.total_installments || "0"
        );

        if (!userId || !pymesPlanId) break;

        // Count existing installment payments
        const { count } = await supabaseAdmin
          .from("payments")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("pymes_plan_id", pymesPlanId)
          .eq("payment_type", "installment");

        const installmentNumber = (count || 0) + 1;

        // Record installment payment
        await supabaseAdmin.from("payments").insert({
          user_id: userId,
          pymes_plan_id: pymesPlanId,
          stripe_session_id: invoice.id,
          stripe_subscription_id: subscriptionId,
          amount: (invoice.amount_paid || 0) / 100,
          currency: "CAD",
          payment_type: "installment",
          installment_number: installmentNumber,
          total_installments: totalInstallments,
          status: "completed",
        });

        // Cancel subscription after all installments paid
        if (totalInstallments > 0 && installmentNumber >= totalInstallments) {
          await stripe.subscriptions.cancel(subscriptionId);
        }

        break;
      }

      // ── Failed payment ──
      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;

        await supabaseAdmin
          .from("payments")
          .update({ status: "failed" })
          .eq("stripe_payment_intent_id", paymentIntent.id);

        break;
      }

      // ── Steve 5/16 Milestone 4: Charge refunded ──
      // Either a partial or full refund triggered from the Stripe
      // dashboard or our admin UI. We flag the payment as refunded
      // and stamp refunded_at so the Sales Report can chart refund
      // volume by date.
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntentId =
          typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : charge.payment_intent?.id;
        if (paymentIntentId) {
          const { data: updated } = await supabaseAdmin
            .from("payments")
            .update({
              status: "refunded",
              refunded_at: new Date().toISOString(),
            })
            .eq("stripe_payment_intent_id", paymentIntentId)
            .select("user_id, service_id, pymes_plan_id")
            .single();

          // Steve 5/20 Milestone 4: notify the customer that the
          // refund was issued. amount_refunded is in cents.
          if (updated?.user_id) {
            const ctx = await loadEmailContext(
              updated.user_id as string,
              (updated.service_id as string | null) || null,
              (updated.pymes_plan_id as string | null) || null,
            );
            if (ctx) {
              await sendRefundConfirmationEmail({
                to: ctx.email,
                customerName: ctx.name,
                serviceName: ctx.serviceName,
                amountCents: charge.amount_refunded || 0,
                currency: (charge.currency || "cad").toUpperCase(),
              });
            }
          }
        }
        break;
      }

      // ── Steve 5/16 Milestone 4: Subscription deleted (canceled) ──
      // Triggered when a PYMES installment subscription is canceled
      // before all installments are paid (admin action, Stripe
      // dashboard action, or auto-cancel after final installment).
      // We only mark rows as "canceled" if they were previously
      // "pending" — completed installment payments stay completed.
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const subscriptionId = subscription.id;
        const canceledAt = new Date().toISOString();
        // Stamp the subscription as canceled. We don't change status of
        // already-completed installments — only outstanding/pending ones.
        await supabaseAdmin
          .from("payments")
          .update({ status: "canceled", canceled_at: canceledAt })
          .eq("stripe_subscription_id", subscriptionId)
          .eq("status", "pending");

        // Also record a marker row so /admin/payments shows the
        // cancellation event even when no pending row exists. This
        // makes it auditable from a single timeline.
        const metadata = subscription.metadata || {};
        const userId = metadata.user_id;
        const pymesPlanId = metadata.pymes_plan_id;
        if (userId) {
          await supabaseAdmin.from("payments").insert({
            user_id: userId,
            pymes_plan_id: pymesPlanId || null,
            stripe_session_id: subscriptionId,
            stripe_subscription_id: subscriptionId,
            amount: 0,
            currency: "CAD",
            payment_type: "subscription_canceled",
            status: "canceled",
            canceled_at: canceledAt,
          });

          // Steve 5/20 Milestone 4: notify the customer their
          // installment plan was canceled.
          const ctx = await loadEmailContext(userId, null, pymesPlanId || null);
          if (ctx) {
            await sendSubscriptionCanceledEmail({
              to: ctx.email,
              customerName: ctx.name,
              planName: ctx.serviceName,
            });
          }
        }
        break;
      }

      // ── Steve 5/16 Milestone 4: Recurring invoice failed ──
      // A monthly installment failed to charge. We record a 'failed'
      // payment row so the admin Sales Report and Payments table both
      // surface it and a sales rep can follow up before the
      // subscription auto-cancels after retries.
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;

        // Steve 6/11 (6-2.md #53): plan balance invoice path —
        // mirror the success handler. Marks the property's balance
        // invoice as failed/uncollectible so Sales can see in the UI
        // that the owner hasn't paid yet.
        if (invoice.metadata?.kind === "plan_balance") {
          const propertyId = invoice.metadata?.property_id;
          if (propertyId) {
            await supabaseAdmin
              .from("properties")
              .update({
                balance_invoice_status: invoice.status === "uncollectible"
                  ? "uncollectible"
                  : "overdue",
              })
              .eq("id", propertyId);
          }
          break;
        }

        const subDetails = invoice.parent?.subscription_details;
        if (!subDetails?.subscription) break;
        const subscriptionId =
          typeof subDetails.subscription === "string"
            ? subDetails.subscription
            : subDetails.subscription.id;
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const metadata = subscription.metadata || {};
        const userId = metadata.user_id;
        const pymesPlanId = metadata.pymes_plan_id;
        if (!userId) break;
        await supabaseAdmin.from("payments").insert({
          user_id: userId,
          pymes_plan_id: pymesPlanId || null,
          stripe_session_id: invoice.id,
          stripe_subscription_id: subscriptionId,
          amount: (invoice.amount_due || 0) / 100,
          currency: "CAD",
          payment_type: "installment",
          status: "failed",
        });

        // Steve 5/20 Milestone 4: tell the customer to update their
        // card before Stripe gives up retrying and auto-cancels the
        // subscription.
        const ctx = await loadEmailContext(userId, null, pymesPlanId || null);
        if (ctx) {
          await sendPaymentFailedEmail({
            to: ctx.email,
            customerName: ctx.name,
            planName: ctx.serviceName,
            amountCents: invoice.amount_due || 0,
            currency: (invoice.currency || "cad").toUpperCase(),
          });
        }
        break;
      }
    }
  } catch (err) {
    console.error("Webhook handler error:", err);
    // Still return 200 to prevent Stripe retries for handler errors
  }

  return NextResponse.json({ received: true });
}
```

The helper `loadEmailContext()` and imports are outside the handler. They are not omitted from the handler above.

# All Possible Early-Return Paths

For a request that is intended to represent `checkout.session.completed`, the paths before the first Supabase call are:

1. **Missing signature header:** `if (!signature)` returns HTTP 400. This does not fit the observed 200.
2. **Signature verification throws:** the first `catch` logs `Webhook signature verification failed:` and returns HTTP 400. This does not fit the confirmed verification, 200, or absence of logs.
3. **The verified event type is not exactly `checkout.session.completed`:** no `case` matches (unless it is another handled type), the switch ends, and the function returns the final HTTP 200. For an unhandled event, this requires no network call and emits no log.
4. **The event matches `checkout.session.completed`, but `session.metadata.user_id` is absent or empty:** `if (!userId) break;` exits that case before the first Supabase call. Execution then reaches the final HTTP 200. This path requires no network call and emits no log.

There is no explicit HTTP response or function `return` between successful signature verification and the first Supabase call inside a valid `checkout.session.completed` case with a truthy `metadata.user_id`. The `break` for a missing `userId` is nevertheless an effective early exit from payment processing.

Later conditional `break` statements exist in other event cases, but they cannot execute after the switch has entered `checkout.session.completed`.

# Event Type Matching Check

The code branches correctly with:

```ts
switch (event.type) {
  case "checkout.session.completed": {
```

The Stripe event name is spelled and compared correctly. There is no typo or incorrect comparison in this case label.

However, every unhandled event type is silently acknowledged with the final 200 because the switch has no `default` branch and no general event log. Stripe may send related events such as payment-intent or asynchronous Checkout events; those do not become `checkout.session.completed` merely because they concern the same payment. The exact event type in the individual Stripe delivery must therefore be checked.

If Stripe confirms the delivered event itself is exactly `checkout.session.completed`, event-type matching is not the divergence; missing `metadata.user_id` is the only checked-in branch before the payment insert that matches all observations.

# Supabase Client Initialization Check

The imported client is initialized in `src/lib/supabase/admin.ts` as:

```ts
import { createClient } from "@supabase/supabase-js";

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
```

This is an admin/service-role client, using the public Supabase project URL and the service-role key. It is the appropriate kind of client for a server-side webhook.

The TypeScript non-null assertions do not validate the variables at runtime. Invalid or missing initialization values would normally cause module initialization or client use to fail; that does not plausibly produce this handler's clean, log-free 200 after verified execution. A database request that reaches `.insert()`, `.select()`, or `.update()` would also constitute an outgoing Supabase HTTP request, even if Supabase rejected it. Thus the observed “No outgoing requests” strongly indicates execution never initiated the first `payments` insert, rather than a silently uninitialized client skipping calls.

One weakness is that most Supabase results are not checked for an `error` property. Supabase query errors are commonly returned as data/error results instead of thrown, so a request can fail without entering the outer `catch`. That could explain an empty table with a 200, but it cannot explain **no outgoing request**.

# Error Swallowing Check

The event-processing switch is wrapped in:

```ts
try {
  // switch and processing
} catch (err) {
  console.error("Webhook handler error:", err);
  // Still return 200 to prevent Stripe retries for handler errors
}
```

This intentionally converts thrown processing failures into a 200, but it does **not** silently swallow them: it calls `console.error`. A thrown error reaching this catch conflicts with “No logs found.”

Supabase-returned `error` values are effectively ignored because the code does not inspect them; those errors would not necessarily be logged or thrown. Again, they would follow an outgoing HTTP request and therefore conflict with the stated “No outgoing requests.”

There is no empty catch and no catch before the payment insert that suppresses logging. The missing-`userId` and unmatched-event paths are silent control flow, not caught errors.

The premise that the Founders-counter logic contains console error calls is not true of the checked-in route. That block contains no logging at all. Across this handler, logging occurs only in the signature-verification catch and the outer handler-error catch. Therefore zero logs is normal for successful processing and also normal for either silent divergence path.

# Best Assessment: Where Execution Actually Stops

Assuming Vercel is running this checked-in handler and the delivered event is exactly `checkout.session.completed`, the best assessment is that execution reaches:

```ts
const userId = metadata.user_id;
// ...
if (!userId) break;
```

and takes that `break`. It then exits the switch and returns:

```ts
return NextResponse.json({ received: true });
```

This precisely accounts for all four facts: valid signature, HTTP 200, no Supabase/network activity, and no logs. It also prevents both the payment insert and Founders-counter query/update.

The other equally compatible control-flow shape is that the actual delivered `event.type` is not one of the handled switch cases, so the switch performs no work and returns the same 200. The Stripe delivery's exact event-type field distinguishes these two possibilities. If it is confirmed to be `checkout.session.completed`, inspect that event object's Checkout Session metadata—specifically whether `metadata.user_id` exists and is non-empty. Based solely on the supplied evidence and checked-in code, missing `metadata.user_id` is the most specific likely cause.

