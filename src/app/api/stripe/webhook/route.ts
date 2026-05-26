import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  sendPaymentReceiptEmail,
  sendRefundConfirmationEmail,
  sendSubscriptionCanceledEmail,
  sendPaymentFailedEmail,
} from "@/lib/email";
import type Stripe from "stripe";

// Steve 5/20 Milestone 4: helper to load the customer's profile +
// optional service/plan name for the payment email. Returns null if
// the user can't be resolved — caller skips the email in that case
// so a bad lookup never blocks the webhook response.
async function loadEmailContext(
  userId: string,
  serviceId?: string | null,
  pymesPlanId?: string | null,
): Promise<{
  email: string;
  name: string;
  serviceName: string;
} | null> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("email, full_name")
    .eq("id", userId)
    .single();
  if (!profile?.email) return null;

  let serviceName = "Service";
  if (serviceId) {
    const { data: svc } = await supabaseAdmin
      .from("services")
      .select("name")
      .eq("id", serviceId)
      .single();
    if (svc?.name) serviceName = svc.name as string;
  } else if (pymesPlanId) {
    const { data: plan } = await supabaseAdmin
      .from("pymes_plans")
      .select("name")
      .eq("id", pymesPlanId)
      .single();
    if (plan?.name) serviceName = plan.name as string;
  }

  return {
    email: profile.email as string,
    name: (profile.full_name as string) || "there",
    serviceName,
  };
}

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
              await stripe.subscriptions.create({
                customer: customerId,
                items: [{ price: price.id }],
                // Apply Stripe Tax to every monthly invoice.
                automatic_tax: { enabled: true },
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
