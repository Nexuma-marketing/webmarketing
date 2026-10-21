import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  sendPaymentReceiptEmail,
  sendRefundConfirmationEmail,
  sendSubscriptionCanceledEmail,
  sendPaymentFailedEmail,
  sendCommercialAlertEmail,
} from "@/lib/email";
import { ELITE_SUB_TIERS } from "@/lib/constants";
import { getFoundersAvailability } from "@/lib/founders-plan";
import { schedulePremierInstallments } from "@/lib/premier-installments";
import { startSubscriptionAfterCheckout } from "@/lib/subscription-setup";
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
    const { data: plan, error: planError } = await supabaseAdmin
      .from("pymes_plans")
      .select("name")
      .eq("id", pymesPlanId)
      .single();
    if (planError) console.warn("[webhook-diag] pymes_plans name lookup failed", { pymesPlanId, error: planError });
    if (plan?.name) serviceName = plan.name as string;
  }

  return {
    email: profile.email as string,
    name: (profile.full_name as string) || "there",
    serviceName,
  };
}

// BUGFIX_MONTHLY_RECEIPT_EMAILS.md: Stripe's own customer emails are
// off, so the app sends the receipt for each recurring Elite/PYME
// charge. Retried webhooks must not double-record or double-email:
// recurring invoices are stored with invoice.id in stripe_session_id,
// so a completed row with that id means this invoice was already
// handled. Failed rows for the same invoice (earlier attempts) don't
// count — a later successful retry still has to be recorded.
async function invoiceAlreadyRecorded(invoiceId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("payments")
    .select("id")
    .eq("stripe_session_id", invoiceId)
    .eq("status", "completed")
    .limit(1);
  return (data?.length ?? 0) > 0;
}

// "Monthly platform fee — <address>, <city>", same label Payment
// History shows for an Elite subscription.
async function eliteFeeLabel(propertyId: string | null | undefined): Promise<string> {
  if (!propertyId) return "Monthly platform fee";
  const { data: property } = await supabaseAdmin
    .from("properties")
    .select("address, city")
    .eq("id", propertyId)
    .maybeSingle();
  return property
    ? `Monthly platform fee — ${property.address}, ${property.city}`
    : "Monthly platform fee";
}

// Checkout receipt helpers: "$200" / "$166.67", and the same long en-CA
// date format the receipt's own Date line uses.
function formatReceiptAmount(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}
function formatReceiptDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Completed installment payments of one PYME subscription. Counted per
// subscription and only status='completed', so failed attempts and
// earlier subscriptions of the same plan don't shift the number.
async function countCompletedInstallments(subscriptionId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from("payments")
    .select("*", { count: "exact", head: true })
    .eq("stripe_subscription_id", subscriptionId)
    .eq("payment_type", "installment")
    .eq("status", "completed");
  return count || 0;
}

// Receipt for a recurring subscription invoice. Never throws — a Resend
// or lookup failure must not affect the already-recorded payment.
async function sendMonthlyReceipt(
  invoice: Stripe.Invoice,
  userId: string | null | undefined,
  label: string,
): Promise<void> {
  try {
    if (!userId) {
      console.warn("[monthly-receipt] no user_id on subscription, receipt skipped", { invoiceId: invoice.id });
      return;
    }
    const ctx = await loadEmailContext(userId);
    if (!ctx) {
      console.warn("[monthly-receipt] customer email not found, receipt skipped", { invoiceId: invoice.id, userId });
      return;
    }
    const totalCents = invoice.amount_paid || 0;
    if (totalCents <= 0) {
      console.log("[monthly-receipt] $0 invoice, receipt skipped", { invoiceId: invoice.id });
      return;
    }
    const taxCents = (invoice.total_taxes ?? []).reduce((sum, t) => sum + (t.amount || 0), 0);
    const paidAt = invoice.status_transitions?.paid_at;
    const sent = await sendPaymentReceiptEmail({
      to: ctx.email,
      customerName: ctx.name,
      serviceName: label,
      amountCents: Math.max(0, totalCents - taxCents),
      taxCents,
      currency: (invoice.currency || "cad").toUpperCase(),
      receiptUrl: invoice.hosted_invoice_url || null,
      paymentDate: paidAt ? new Date(paidAt * 1000).toISOString() : undefined,
    });
    if (sent) {
      console.log("[monthly-receipt] receipt sent", { invoiceId: invoice.id, label });
    } else {
      console.error("[monthly-receipt] receipt email not sent (Resend error or no API key)", { invoiceId: invoice.id, label });
    }
  } catch (err) {
    console.error("[monthly-receipt] receipt email failed", { invoiceId: invoice.id, err });
  }
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
        console.log("[webhook-diag] Entered checkout.session.completed", {
          eventType: event.type,
          sessionId: session.id,
          metadata,
        });
        const userId = metadata.user_id;
        const paymentType = metadata.payment_type || "one_time";

        if (!userId) break;

        // PROMPT2 item 7: a priority-listing add-on bundled onto this
        // same Checkout Session (metadata.addon_service_id) gets its
        // own `payments` row with its own service_id, so its "already
        // purchased" check (item 4) and standalone-repurchase
        // eligibility both key off the right row. Any tax Stripe added
        // is left attributed to the main line item — this app doesn't
        // split tax across rows anywhere else either.
        const addonServiceId = metadata.addon_service_id || null;
        const addonAmountCents = addonServiceId ? Number(metadata.addon_amount_cents || 0) : 0;
        const totalCents = session.amount_total || 0;
        const mainAmountCents = addonServiceId ? Math.max(0, totalCents - addonAmountCents) : totalCents;

        // Record payment
        console.log("[webhook-diag] About to insert payment", {
          user_id: userId,
          service_id: metadata.service_id || null,
          pymes_plan_id: metadata.pymes_plan_id || null,
          property_id: metadata.property_id || null,
          stripe_session_id: session.id,
          stripe_payment_intent_id:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : null,
          amount: mainAmountCents / 100,
          currency: "CAD",
          payment_type: paymentType,
          status: "completed",
        });
        const { data: paymentData, error: paymentError } = await supabaseAdmin
          .from("payments")
          .insert({
            user_id: userId,
            service_id: metadata.service_id || null,
            pymes_plan_id: metadata.pymes_plan_id || null,
            // Steve: attributes the one-time Elite portfolio fee (and
            // any other property-scoped purchase) to its property;
            // null/no-op for every existing payment type.
            property_id: metadata.property_id || null,
            stripe_session_id: session.id,
            stripe_payment_intent_id:
              typeof session.payment_intent === "string"
                ? session.payment_intent
                : null,
            amount: mainAmountCents / 100,
            currency: "CAD",
            payment_type: paymentType,
            status: "completed",
          });
        console.log("[webhook-diag] Payment insert completed", {
          data: paymentData,
          error: paymentError,
        });

        if (addonServiceId) {
          const { error: addonPaymentError } = await supabaseAdmin.from("payments").insert({
            user_id: userId,
            service_id: addonServiceId,
            property_id: metadata.property_id || null,
            stripe_session_id: session.id,
            stripe_payment_intent_id:
              typeof session.payment_intent === "string" ? session.payment_intent : null,
            amount: addonAmountCents / 100,
            currency: "CAD",
            payment_type: paymentType,
            status: "completed",
          });
          console.log("[webhook-diag] Add-on payment insert completed", {
            addonServiceId,
            amount: addonAmountCents / 100,
            error: addonPaymentError,
          });
        }
        // Steve: this insert previously failed silently on schema
        // mismatches (e.g. a column referenced in code but not yet
        // added by migration) — it was only ever passed to
        // console.log, at the same level as the success case, so nothing
        // surfaced it as an actionable error. Escalate to console.error
        // with the full Supabase error (code/message/hint) so a broken
        // payment record is loud in the logs instead of silently
        // vanishing from Payment History.
        if (paymentError) {
          console.error(
            "[webhook-diag] CRITICAL: payments insert failed for checkout.session.completed",
            {
              sessionId: session.id,
              metadata,
              error: paymentError,
            },
          );
        }

        // Steve 5/22 Milestone 4 (#7 docx): when an owner buys the
        // Founders Package, increment the `founders_plan.taken` counter
        // in app_config so the "X owners have already chosen" banner on
        // /dashboard/services + the public landing reflects reality.
        // Match by service name so we don't have to hard-code the UUID.
        // PROMPT2 item 5 also needs this service-name lookup to detect a
        // Premier Tier upfront purchase and kick off its installment
        // schedule — resolved once here and reused below.
        let purchasedServiceName: string | null = null;
        let isFoundersPurchase = false;
        if (metadata.service_id) {
          console.log("[webhook-diag] About to look up purchased service name", {
            serviceId: metadata.service_id,
          });
          const { data: svc, error: svcError } = await supabaseAdmin
            .from("services")
            .select("name")
            .eq("id", metadata.service_id)
            .single();
          console.log("[webhook-diag] Purchased service lookup completed", {
            data: svc,
            error: svcError,
          });
          purchasedServiceName = (svc?.name as string | undefined) ?? null;
          if (purchasedServiceName && /Founder.+Package/i.test(purchasedServiceName)) {
            isFoundersPurchase = true;
            console.log("[webhook-diag] About to read Founders counter");
            const { data: counter, error: counterError } = await supabaseAdmin
              .from("app_config")
              .select("value")
              .eq("category", "founders_plan")
              .eq("key", "taken")
              .single();
            console.log("[webhook-diag] Founders counter read completed", {
              currentValue: counter?.value,
              error: counterError,
            });
            const current = Number((counter?.value as string | undefined) ?? "0") || 0;
            console.log("[webhook-diag] About to update Founders counter", {
              currentValue: counter?.value,
              newValue: String(current + 1),
            });
            const {
              data: counterUpdateData,
              error: counterUpdateError,
            } = await supabaseAdmin
              .from("app_config")
              .update({ value: String(current + 1) })
              .eq("category", "founders_plan")
              .eq("key", "taken");
            console.log("[webhook-diag] Founders counter update completed", {
              currentValue: counter?.value,
              newValue: String(current + 1),
              data: counterUpdateData,
              error: counterUpdateError,
            });
          }
        }

        // PROMPT2 item 5: Premier Tier's remaining balance is scheduled
        // automatically the moment the $200 upfront succeeds — never
        // gated by "Tenant signed lease" (that's Low Price/Founders/
        // Support Tier's flow, item 1). Matches the same "preferred" +
        // "premier" name convention as getPlanPercentage
        // (src/lib/plan-percentage.ts) / percentageForPlan
        // (src/lib/owner-plan-display.ts).
        if (
          paymentType === "one_time" &&
          metadata.property_id &&
          purchasedServiceName &&
          /preferred/i.test(purchasedServiceName) &&
          /premier/i.test(purchasedServiceName)
        ) {
          console.log("[webhook-diag] Premier Tier upfront detected — scheduling installments", {
            propertyId: metadata.property_id,
            serviceId: metadata.service_id,
          });
          const { data: premierProperty, error: premierPropertyError } = await supabaseAdmin
            .from("properties")
            .select("owner_id, monthly_rent")
            .eq("id", metadata.property_id)
            .single();
          console.log("[webhook-diag] Premier Tier property lookup completed", {
            data: premierProperty,
            error: premierPropertyError,
          });
          if (premierProperty?.owner_id && premierProperty.monthly_rent) {
            await schedulePremierInstallments({
              propertyId: metadata.property_id,
              ownerId: premierProperty.owner_id as string,
              serviceId: metadata.service_id,
              monthlyRentCad: Number(premierProperty.monthly_rent),
              upfrontPaidAt: new Date(),
            });
          } else {
            console.error("[webhook-diag] CRITICAL: cannot schedule Premier installments — property missing owner_id/monthly_rent", {
              propertyId: metadata.property_id,
            });
          }
        }

        // If upfront PYMES payment, create installment subscription.
        // BUGFIX_ELITE_PYME_SUBSCRIPTIONS.md: created via the shared
        // helper with the card saved at checkout and the first
        // installment one month after this payment (trial_end). The
        // helper never throws — on failure it logs CRITICAL, writes a
        // subscription_setup_failed marker row and alerts commercial,
        // so the lead update and receipt email below always run.
        // BUGFIX_ELITE_RECEIPT_AND_DESCRIPTION.md: the Elite/PYME line on
        // the receipt below is only added when the subscription exists.
        let recurringNote: string | null = null;
        if (
          paymentType === "upfront" &&
          metadata.pymes_plan_id &&
          Number(metadata.installment_months) > 0
        ) {
          const installmentAmount = Number(metadata.installment_amount) || 0;
          const installmentMonths = Number(metadata.installment_months) || 0;

          if (installmentAmount > 0 && installmentMonths > 0) {
            const pymeSub = await startSubscriptionAfterCheckout(
              {
                kind: "pymes",
                userId,
                pymesPlanId: metadata.pymes_plan_id,
                planType: metadata.plan_type || "PYME",
                installmentAmount,
                installmentMonths,
              },
              session,
              event.created,
            );
            if (pymeSub.ok && pymeSub.firstChargeAt) {
              recurringNote = `Monthly installments: ${installmentMonths} × $${formatReceiptAmount(installmentAmount)}, first charge on ${formatReceiptDate(pymeSub.firstChargeAt)}`;
            }
          }
        }

        // Steve: Elite Assets & Legacy — the one-time portfolio fee for
        // a specific property just succeeded. Start that property's
        // monthly platform-fee subscription. Elite recurs indefinitely
        // per property with no fixed installment count, attributed via
        // property_id instead of pymes_plan_id. `metadata.elite_tier`
        // is only ever set server-side in /api/stripe/checkout from the
        // purchased Elite service, so it's safe to trust here. Same
        // shared helper / failure handling as PYME above.
        let elitePropertyLabel: string | null = null;
        if (
          paymentType === "one_time" &&
          metadata.property_id &&
          metadata.elite_tier &&
          ELITE_SUB_TIERS[metadata.elite_tier]
        ) {
          const eliteSub = await startSubscriptionAfterCheckout(
            {
              kind: "elite",
              userId,
              propertyId: metadata.property_id,
              eliteTier: metadata.elite_tier,
            },
            session,
            event.created,
          );
          if (eliteSub.ok && eliteSub.firstChargeAt) {
            recurringNote = `Monthly platform fee: $${formatReceiptAmount(ELITE_SUB_TIERS[metadata.elite_tier].monthlyFee)}/month, first charge on ${formatReceiptDate(eliteSub.firstChargeAt)}`;
          }
          const { data: eliteProperty } = await supabaseAdmin
            .from("properties")
            .select("address, city")
            .eq("id", metadata.property_id)
            .maybeSingle();
          if (eliteProperty) elitePropertyLabel = `${eliteProperty.address}, ${eliteProperty.city}`;
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
          // PROMPT2 item 8: Founders confirmation email (the BCC'd
          // commercial copy of this receipt) now includes live spots
          // taken/remaining instead of leaving commercial to check
          // /admin/pricing separately.
          const foundersAvailability = isFoundersPurchase ? await getFoundersAvailability() : null;
          await sendPaymentReceiptEmail({
            to: ctx.email,
            customerName: ctx.name,
            serviceName: elitePropertyLabel
              ? `${ctx.serviceName} — ${elitePropertyLabel}`
              : paymentType === "upfront" && metadata.pymes_plan_id && metadata.plan_name
                ? `${metadata.plan_name} — Initial Payment`
                : ctx.serviceName,
            amountCents: subtotalCents,
            taxCents,
            currency: (session.currency || "cad").toUpperCase(),
            receiptUrl: null,
            foundersAvailability,
            recurringNote,
          });
        }

        console.log(
          "[webhook-diag] checkout.session.completed case completed successfully"
        );
        break;
      }

      // ── Recurring installment payment ──
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;

        // Zero-dollar guard: a plan_balance / plan_installment invoice
        // that "succeeds" with nothing paid is the ghost from the old
        // pending-InvoiceItem bug (src/lib/balance-invoice.ts) — Stripe
        // auto-marks a finalized $0 invoice as paid. Never record it as
        // a completed payment or mark the balance/installment paid.
        if (
          (invoice.metadata?.kind === "plan_balance" || invoice.metadata?.kind === "plan_installment") &&
          (!invoice.amount_paid || !invoice.total)
        ) {
          console.error("[balance-invoice-diag] CRITICAL: $0 plan invoice reported as paid — NOT recording a payment", {
            invoiceId: invoice.id,
            kind: invoice.metadata?.kind,
            propertyId: invoice.metadata?.property_id,
            installmentId: invoice.metadata?.installment_id,
            amountPaid: invoice.amount_paid,
            total: invoice.total,
          });
          break;
        }

        // Steve 6/11 (6-2.md #53): plan balance invoice path. Created
        // by the explicit "Tenant signed lease" action (PROMPT2 item 1;
        // this used to fire from the Admin `is_available` toggle — see
        // that route for why the implicit trigger was removed) or the
        // standalone /api/admin/properties/[id]/balance-invoice
        // re-trigger endpoint. Identified by metadata.kind ===
        // "plan_balance". Updates the property row so the admin UI
        // shows "Arrendada - Pagado".
        if (invoice.metadata?.kind === "plan_balance") {
          const propertyId = invoice.metadata?.property_id;
          console.log("[webhook-diag] plan_balance payment_succeeded", { propertyId, invoiceId: invoice.id });
          if (propertyId) {
            const { error: balancePaidError } = await supabaseAdmin
              .from("properties")
              .update({
                balance_invoice_status: "paid",
                balance_invoice_paid_at: new Date().toISOString(),
                // Steve 6/11: also drop a row in payments so the
                // balance shows up in /admin/reports and the
                // customer's /dashboard/payments history.
              })
              .eq("id", propertyId);
            console.log("[webhook-diag] plan_balance property row updated to paid", {
              propertyId,
              error: balancePaidError,
            });

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
                property_id: propertyId,
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

        // PROMPT2 item 5: Premier Tier installment invoice paid.
        // Created by the daily process-installments cron via
        // createAndSendStripeInvoice, identified by
        // metadata.kind === "plan_installment" +
        // metadata.installment_id.
        if (invoice.metadata?.kind === "plan_installment") {
          const installmentId = invoice.metadata?.installment_id;
          const propertyId = invoice.metadata?.property_id;
          console.log("[webhook-diag] plan_installment payment_succeeded", { installmentId, propertyId });
          if (installmentId) {
            const { data: installmentRow, error: updateError } = await supabaseAdmin
              .from("plan_installments")
              .update({ status: "paid", updated_at: new Date().toISOString() })
              .eq("id", installmentId)
              .select("property_id")
              .single();
            console.log("[webhook-diag] plan_installments row updated to paid", {
              installmentId,
              data: installmentRow,
              error: updateError,
            });
            const { data: prop } = await supabaseAdmin
              .from("properties")
              .select("owner_id")
              .eq("id", (installmentRow?.property_id as string) || propertyId)
              .single();
            if (prop?.owner_id) {
              await supabaseAdmin.from("payments").insert({
                user_id: prop.owner_id,
                property_id: (installmentRow?.property_id as string) || propertyId || null,
                stripe_session_id: invoice.id,
                stripe_payment_intent_id: null,
                amount: (invoice.amount_paid || 0) / 100,
                currency: (invoice.currency || "cad").toUpperCase(),
                payment_type: "plan_installment",
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

        // BUGFIX_ELITE_PYME_SUBSCRIPTIONS.md: Elite/PYME subscriptions
        // start with a trial, so Stripe issues a $0 invoice at creation
        // and reports it as paid. It is not a charge: recording it would
        // add a $0 platform-fee row, or count as PYME installment #1 and
        // cancel the plan one installment early.
        if (invoice.billing_reason === "subscription_create" && !invoice.amount_paid) {
          console.log("[webhook-diag] Skipping $0 trial-start subscription invoice", {
            invoiceId: invoice.id,
            subscriptionId,
          });
          break;
        }

        const subscription =
          await stripe.subscriptions.retrieve(subscriptionId);
        const metadata = subscription.metadata || {};

        // Steve: Elite Assets & Legacy monthly maintenance-fee invoice.
        // Separate path from the PYMES installment logic below (which
        // is untouched) — Elite subscriptions recur indefinitely per
        // property (no fixed installment count, no auto-cancel here;
        // the customer/admin cancels via the existing
        // /api/stripe/cancel-my-subscription route when desired), and
        // are attributed by property_id rather than pymes_plan_id.
        if (metadata.kind === "elite_maintenance" && metadata.property_id) {
          if (await invoiceAlreadyRecorded(invoice.id)) {
            console.log("[monthly-receipt] invoice already recorded, skipping", { invoiceId: invoice.id, subscriptionId });
            break;
          }
          const { error: eliteInsertError } = await supabaseAdmin
            .from("payments")
            .insert({
              user_id: metadata.user_id || null,
              property_id: metadata.property_id,
              stripe_session_id: invoice.id,
              stripe_subscription_id: subscriptionId,
              amount: (invoice.amount_paid || 0) / 100,
              currency: "CAD",
              payment_type: "elite_maintenance",
              status: "completed",
            });
          if (eliteInsertError) {
            console.error(
              "[webhook-diag] CRITICAL: elite_maintenance payments insert failed",
              { subscriptionId, metadata, error: eliteInsertError },
            );
            break;
          }
          await sendMonthlyReceipt(invoice, metadata.user_id, await eliteFeeLabel(metadata.property_id));
          break;
        }

        const userId = metadata.user_id;
        const pymesPlanId = metadata.pymes_plan_id;
        const totalInstallments = parseInt(
          metadata.total_installments || "0"
        );

        if (!userId || !pymesPlanId) break;

        if (await invoiceAlreadyRecorded(invoice.id)) {
          console.log("[monthly-receipt] invoice already recorded, skipping", { invoiceId: invoice.id, subscriptionId });
          break;
        }

        // Count this subscription's completed installment payments
        // (BUGFIX_PYME_COUNT_AND_EMAIL_WORDING.md).
        const installmentNumber = (await countCompletedInstallments(subscriptionId)) + 1;

        // Record installment payment
        const { error: installmentInsertError } = await supabaseAdmin.from("payments").insert({
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

        if (installmentInsertError) {
          console.error("[monthly-receipt] installment payments insert failed, receipt skipped", {
            invoiceId: invoice.id,
            subscriptionId,
            error: installmentInsertError,
          });
        } else {
          const ctx = await loadEmailContext(userId, null, pymesPlanId);
          const planName = ctx?.serviceName || "Installment plan";
          await sendMonthlyReceipt(
            invoice,
            userId,
            `${planName} — installment ${installmentNumber} of ${totalInstallments}`,
          );
        }

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
            // Steve: attribute cancellation of an Elite maintenance-fee
            // subscription back to its property too (null/no-op for
            // every other subscription type, PYMES included).
            property_id: metadata.property_id || null,
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
          // BUGFIX_PYME_COUNT_AND_EMAIL_WORDING.md: skip it when a PYME
          // plan ended because every installment was paid (our own
          // auto-cancel after the last installment) — nothing was cut short.
          const totalInstallments = parseInt(metadata.total_installments || "0");
          const pymeCompleted =
            !!pymesPlanId &&
            totalInstallments > 0 &&
            (await countCompletedInstallments(subscriptionId)) >= totalInstallments;
          const isElite = metadata.kind === "elite_maintenance";
          const ctx = pymeCompleted ? null : await loadEmailContext(userId, null, pymesPlanId || null);
          if (pymeCompleted) {
            console.log("[webhook-diag] PYME plan fully paid, skipping canceled email", { subscriptionId, totalInstallments });
          } else if (ctx) {
            await sendSubscriptionCanceledEmail({
              to: ctx.email,
              customerName: ctx.name,
              planName: isElite ? await eliteFeeLabel(metadata.property_id) : ctx.serviceName,
              platformFee: isElite,
            });
          }
        }

        // BUGFIX_MONTHLY_RECEIPT_EMAILS.md: Stripe auto-cancels the
        // subscription once every retry of a failed charge is exhausted.
        // Alert commercial so they can follow up. Voluntary cancellations
        // (cancel_at_period_end from customer/admin, or the auto-cancel
        // after the last PYME installment) have reason
        // "cancellation_requested" and are not alerted.
        if (
          subscription.cancellation_details?.reason === "payment_failed" &&
          (metadata.kind === "elite_maintenance" || pymesPlanId)
        ) {
          try {
            const isElite = metadata.kind === "elite_maintenance";
            const ctx = userId ? await loadEmailContext(userId, null, pymesPlanId || null) : null;
            let target = ctx?.serviceName || "Unknown plan";
            if (isElite) {
              const { data: property } = metadata.property_id
                ? await supabaseAdmin
                    .from("properties")
                    .select("address, city")
                    .eq("id", metadata.property_id)
                    .maybeSingle()
                : { data: null };
              target = property
                ? `Monthly platform fee — ${property.address}, ${property.city}`
                : `Monthly platform fee — property ${metadata.property_id || "unknown"}`;
            }
            await sendCommercialAlertEmail({
              subject: `Subscription canceled after failed payments — ${isElite ? "Elite platform fee" : "PYME installments"}`,
              intro:
                "Stripe canceled this subscription automatically because all retries of a monthly charge failed. No further charges will be attempted.",
              items: [
                {
                  Customer: ctx ? `${ctx.name} <${ctx.email}>` : `user ${userId || "unknown"}`,
                  [isElite ? "Property" : "PYME plan"]: target,
                  "Subscription ID": subscriptionId,
                  Reason: "payment_failed (all retries exhausted)",
                },
              ],
            });
            console.log("[sub-payment-failed] commercial alert sent", { subscriptionId });
          } catch (err) {
            console.error("[sub-payment-failed] commercial alert failed", { subscriptionId, err });
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
          console.log("[webhook-diag] plan_balance payment_failed", { propertyId, invoiceStatus: invoice.status });
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

        // PROMPT2 item 5: Premier Tier installment invoice failed —
        // mirrors the plan_balance branch above.
        if (invoice.metadata?.kind === "plan_installment") {
          const installmentId = invoice.metadata?.installment_id;
          console.log("[webhook-diag] plan_installment payment_failed", { installmentId });
          if (installmentId) {
            await supabaseAdmin
              .from("plan_installments")
              .update({ status: "failed", updated_at: new Date().toISOString() })
              .eq("id", installmentId);
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
        const isEliteMaintenance = metadata.kind === "elite_maintenance";
        await supabaseAdmin.from("payments").insert({
          user_id: userId,
          pymes_plan_id: pymesPlanId || null,
          // Steve: attribute a failed Elite maintenance-fee charge to
          // its property; null/no-op for every other subscription type.
          property_id: isEliteMaintenance ? metadata.property_id || null : null,
          stripe_session_id: invoice.id,
          stripe_subscription_id: subscriptionId,
          amount: (invoice.amount_due || 0) / 100,
          currency: "CAD",
          payment_type: isEliteMaintenance ? "elite_maintenance" : "installment",
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
            planName: isEliteMaintenance ? await eliteFeeLabel(metadata.property_id) : ctx.serviceName,
            amountCents: invoice.amount_due || 0,
            currency: (invoice.currency || "cad").toUpperCase(),
            platformFee: isEliteMaintenance,
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
