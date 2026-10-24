import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";
import { sendSubscriptionCanceledEmail, sendSubscriptionScheduledCancelEmail } from "@/lib/email";
import { findSubscriptionByCheckoutSession, isCancellationScheduled } from "@/lib/upcoming-charges";

// BUGFIX_CANCELLATIONS_PANEL.md: cancellation of a PYME installment plan
// or an Elite monthly platform-fee subscription, only from the panel
// (Sales Report PYME section, Admin → Payments).
//
// - Roles: admin (end_of_period or now) and sales (end_of_period only).
//   Any other role → 403; sales + "now" → 403.
// - Payload: { paymentId, mode, reason }. The subscription is resolved
//   here, never taken from the browser: payments.stripe_subscription_id of
//   that row, or (trial month, no such id yet) the subscription whose
//   metadata.checkout_session_id equals the row's stripe_session_id.
// - Order: read Stripe state → change Stripe → insert the
//   subscription_cancellations record (UNIQUE stripe_subscription_id+mode)
//   → email. Only the request whose insert succeeds sends the email, so
//   two people cancelling at once produce one record and one email.
// - "now": the route sends the final "canceled" email itself and flags the
//   subscription (metadata.panel_cancel_mode = "now") before cancelling, so
//   the customer.subscription.deleted webhook skips its own email.

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CANCEL_ROLES = ["admin", "sales"];
type CancelMode = "end_of_period" | "now";
const TAG = "[cancel-subscription]";
const STRIPE_OPTS = { timeout: 15000, maxNetworkRetries: 0 };
const REASON_MIN = 5;
const REASON_MAX = 500;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function formatDay(iso: string | null | undefined): string {
  if (!iso) return "an unknown date";
  return new Date(iso).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}

/** "Already scheduled by {name} on {date}", from the latest panel record. */
async function alreadyDoneMessage(subscriptionId: string, what: "scheduled" | "canceled"): Promise<string> {
  const { data: record, error } = await supabaseAdmin
    .from("subscription_cancellations")
    .select("cancelled_by, created_at, mode")
    .eq("stripe_subscription_id", subscriptionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) console.warn(`${TAG} latest cancellation lookup failed`, { subscriptionId, error: error.message });
  if (!record) {
    return `Already ${what === "scheduled" ? "scheduled for cancellation" : "canceled"} (no record in the panel; it may have been done from Stripe).`;
  }
  let name = "another user";
  if (record.cancelled_by) {
    const { data: who } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email")
      .eq("id", record.cancelled_by as string)
      .maybeSingle();
    name = (who?.full_name as string | null) || (who?.email as string | null) || name;
  }
  const verb = what === "scheduled" ? "scheduled for cancellation" : "canceled";
  return `Already ${verb} by ${name} on ${formatDay(record.created_at as string | null)}.`;
}

function periodEndUnix(sub: Stripe.Subscription): number | null {
  if (sub.cancel_at) return sub.cancel_at;
  if (sub.status === "trialing" && sub.trial_end) return sub.trial_end;
  return sub.items?.data?.[0]?.current_period_end ?? null;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single();
  const role = (callerProfile?.role as string | null) ?? null;
  if (!role || !CANCEL_ROLES.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── Validate input ──
  let body: { paymentId?: unknown; mode?: unknown; reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  let mode: CancelMode | null = null;
  if (body.mode === "end_of_period") mode = "end_of_period";
  else if (body.mode === "now") mode = "now";
  if (!mode) {
    return NextResponse.json({ error: "mode must be \"end_of_period\" or \"now\"" }, { status: 400 });
  }
  if (mode === "now" && role !== "admin") {
    return NextResponse.json({ error: "Only an administrator can cancel immediately." }, { status: 403 });
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length < REASON_MIN || reason.length > REASON_MAX) {
    return NextResponse.json(
      { error: `A reason of ${REASON_MIN} to ${REASON_MAX} characters is required.` },
      { status: 400 },
    );
  }
  const paymentId = typeof body.paymentId === "string" ? body.paymentId.trim() : "";
  if (!paymentId) {
    return NextResponse.json({ error: "paymentId required" }, { status: 400 });
  }

  // ── The purchase row ──
  const { data: payment, error: paymentError } = await supabaseAdmin
    .from("payments")
    .select("id, user_id, property_id, pymes_plan_id, payment_type, stripe_session_id, stripe_subscription_id")
    .eq("id", paymentId)
    .maybeSingle();
  if (paymentError) {
    console.error(`${TAG} payment lookup failed`, { paymentId, error: paymentError.message });
    return NextResponse.json({ error: "Could not read the payment." }, { status: 500 });
  }
  const rowSubscriptionId = (payment?.stripe_subscription_id as string | null) ?? null;
  const rowSessionId = (payment?.stripe_session_id as string | null) ?? null;
  if (!payment || (!rowSubscriptionId && !(rowSessionId && rowSessionId.startsWith("cs_")))) {
    return NextResponse.json({ error: "This payment is not linked to a subscription." }, { status: 404 });
  }
  const clientUserId = (payment.user_id as string | null) ?? null;

  // ── Resolve the subscription server-side ──
  let sub: Stripe.Subscription | null = null;
  try {
    if (rowSubscriptionId) {
      sub = await stripe.subscriptions.retrieve(rowSubscriptionId, {}, STRIPE_OPTS);
    } else if (rowSessionId) {
      let customerId: string | null = null;
      if (clientUserId) {
        const { data: clientProfile } = await supabaseAdmin
          .from("profiles")
          .select("stripe_customer_id")
          .eq("id", clientUserId)
          .maybeSingle();
        customerId = (clientProfile?.stripe_customer_id as string | null) ?? null;
      }
      if (!customerId) {
        const session = await stripe.checkout.sessions.retrieve(rowSessionId, {}, STRIPE_OPTS);
        customerId =
          typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
      }
      if (customerId) sub = await findSubscriptionByCheckoutSession(customerId, rowSessionId, 15000);
    }
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode !== 404) {
      console.error(`${TAG} Stripe lookup failed`, { paymentId, error: errorMessage(err) });
      return NextResponse.json({ error: "Could not read the subscription from Stripe. Nothing was changed." }, { status: 502 });
    }
    sub = null;
  }
  if (!sub) {
    return NextResponse.json(
      { error: "No Stripe subscription was found for this purchase. Nothing was changed." },
      { status: 404 },
    );
  }
  const subscriptionId = sub.id;

  // ── Already done? (no Stripe call, no record, no email) ──
  if (sub.status === "canceled" || sub.status === "incomplete_expired") {
    return NextResponse.json(
      { error: await alreadyDoneMessage(subscriptionId, "canceled"), alreadyDone: true },
      { status: 409 },
    );
  }
  if (mode === "end_of_period" && isCancellationScheduled(sub)) {
    return NextResponse.json(
      { error: await alreadyDoneMessage(subscriptionId, "scheduled"), alreadyDone: true },
      { status: 409 },
    );
  }

  // ── Labels and the client for the emails ──
  const md: Stripe.Metadata = sub.metadata ?? {};
  const isElite = md.kind === "elite_maintenance";
  const propertyId = (payment.property_id as string | null) || md.property_id || null;
  const pymesPlanId = (payment.pymes_plan_id as string | null) || md.pymes_plan_id || null;
  let pymePlanName: string | null = null;
  if (pymesPlanId) {
    const { data: plan } = await supabaseAdmin.from("pymes_plans").select("name").eq("id", pymesPlanId).maybeSingle();
    pymePlanName = (plan?.name as string | null) ?? null;
  }
  let eliteLabel = "Monthly platform fee";
  if (isElite && propertyId) {
    const { data: property } = await supabaseAdmin
      .from("properties")
      .select("address, city")
      .eq("id", propertyId)
      .maybeSingle();
    if (property) eliteLabel = `Monthly platform fee — ${property.address}, ${property.city}`;
  }
  const planLabel = isElite ? eliteLabel : pymePlanName || "Payment plan";
  const emailUserId = clientUserId || md.user_id || null;
  let client: { email: string; name: string } | null = null;
  if (emailUserId) {
    const { data: clientProfile } = await supabaseAdmin
      .from("profiles")
      .select("email, full_name")
      .eq("id", emailUserId)
      .maybeSingle();
    if (clientProfile?.email) {
      client = {
        email: clientProfile.email as string,
        name: (clientProfile.full_name as string | null) || "there",
      };
    }
  }

  // ── Stripe change ──
  const nowIso = new Date().toISOString();
  let effectiveUnix: number | null = null;
  try {
    if (mode === "end_of_period") {
      const updated = await stripe.subscriptions.update(
        subscriptionId,
        { cancel_at_period_end: true, metadata: { canceled_by: role, canceled_at_iso: nowIso } },
        STRIPE_OPTS,
      );
      effectiveUnix = periodEndUnix(updated);
    } else {
      // Flag first, so the deleted webhook knows this route sends the email.
      await stripe.subscriptions.update(
        subscriptionId,
        { metadata: { panel_cancel_mode: "now", canceled_by: role, canceled_at_iso: nowIso } },
        STRIPE_OPTS,
      );
      try {
        const canceled = await stripe.subscriptions.cancel(
          subscriptionId,
          { prorate: false, invoice_now: false },
          STRIPE_OPTS,
        );
        effectiveUnix = canceled.canceled_at ?? Math.floor(Date.now() / 1000);
      } catch (cancelErr) {
        // Someone else may have canceled it a moment ago.
        const current = await stripe.subscriptions.retrieve(subscriptionId, {}, STRIPE_OPTS).catch(() => null);
        if (current?.status === "canceled") {
          return NextResponse.json(
            { error: await alreadyDoneMessage(subscriptionId, "canceled"), alreadyDone: true },
            { status: 409 },
          );
        }
        // Still active: remove the flag so a later cancellation gets its webhook email.
        await stripe.subscriptions
          .update(subscriptionId, { metadata: { panel_cancel_mode: "" } }, STRIPE_OPTS)
          .catch((err: unknown) =>
            console.error(`${TAG} could not clear panel_cancel_mode flag`, { subscriptionId, error: errorMessage(err) }),
          );
        throw cancelErr;
      }
    }
  } catch (err) {
    console.error(`${TAG} Stripe change failed`, { subscriptionId, mode, error: errorMessage(err) });
    return NextResponse.json({ error: `Stripe could not cancel the subscription: ${errorMessage(err)}` }, { status: 502 });
  }
  const effectiveIso = effectiveUnix ? new Date(effectiveUnix * 1000).toISOString() : null;

  // ── Record (the UNIQUE index decides who sends the email) ──
  let warning: string | null = null;
  const { error: insertError } = await supabaseAdmin.from("subscription_cancellations").insert({
    stripe_subscription_id: subscriptionId,
    payment_id: payment.id as string,
    user_id: emailUserId,
    property_id: propertyId,
    cancelled_by: user.id,
    cancelled_by_role: role,
    mode,
    reason,
    plan_label: planLabel,
    effective_at: effectiveIso,
  });
  if (insertError) {
    if (insertError.code === "23505") {
      console.log(`${TAG} already recorded by another request, no email`, { subscriptionId, mode });
      return NextResponse.json(
        { error: await alreadyDoneMessage(subscriptionId, mode === "now" ? "canceled" : "scheduled"), alreadyDone: true },
        { status: 409 },
      );
    }
    console.error(`${TAG} CRITICAL: cancellation done in Stripe but the record insert failed`, {
      subscriptionId,
      paymentId,
      mode,
      error: insertError.message,
      code: insertError.code,
    });
    warning = "The cancellation was made in Stripe, but the record could not be saved. Please tell the administrator.";
  }

  // ── One email to the client (commercial in BCC) ──
  if (client) {
    if (mode === "end_of_period") {
      await sendSubscriptionScheduledCancelEmail({
        to: client.email,
        customerName: client.name,
        planName: pymePlanName || "Installment plan",
        cycleEndUnix: effectiveUnix,
      });
    } else {
      await sendSubscriptionCanceledEmail({
        to: client.email,
        customerName: client.name,
        planName: isElite ? eliteLabel : pymePlanName || "Installment plan",
        platformFee: isElite,
      });
    }
  } else {
    console.warn(`${TAG} client email not found, no email sent`, { subscriptionId, paymentId });
    warning = warning || "The cancellation was made, but the client's email was not found, so no email was sent.";
  }

  console.log(`${TAG} done`, { subscriptionId, paymentId, mode, role, effectiveAt: effectiveIso });
  return NextResponse.json({
    ok: true,
    mode,
    status: mode === "now" ? "canceled" : "cancellation_scheduled",
    effectiveAt: effectiveIso,
    message:
      mode === "now"
        ? "The plan was canceled now. The client and the commercial team were notified by email."
        : `The plan will end on ${formatDay(effectiveIso)}. The client and the commercial team were notified by email.`,
    warning,
  });
}
