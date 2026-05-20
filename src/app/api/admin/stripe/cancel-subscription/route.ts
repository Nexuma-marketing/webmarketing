import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";
import { sendSubscriptionScheduledCancelEmail } from "@/lib/email";

// Steve 5/16 Milestone 4: admin-triggered cancellation of an
// installment subscription. Confirms admin role, then cancels the
// subscription in Stripe. The webhook
// (customer.subscription.deleted) writes status='canceled' +
// canceled_at into the payments rows when Stripe fires the event.

export const dynamic = "force-dynamic";

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
    .select("role")
    .eq("id", user.id)
    .single();
  if (callerProfile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { subscriptionId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.subscriptionId) {
    return NextResponse.json(
      { error: "subscriptionId required" },
      { status: 400 },
    );
  }

  // Find a payment that references this subscription to validate the
  // caller isn't passing an arbitrary Stripe ID.
  const { data: payment } = await supabaseAdmin
    .from("payments")
    .select("id, stripe_subscription_id")
    .eq("stripe_subscription_id", body.subscriptionId)
    .limit(1)
    .single();
  if (!payment) {
    return NextResponse.json(
      { error: "No payment row linked to that subscription" },
      { status: 404 },
    );
  }

  try {
    // Steve 5/20 Milestone 4: client policy is 'service continues
    // until end of current billing cycle, no prorated refund'.
    // Stripe's `cancel_at_period_end` flag does exactly that — the
    // subscription stays active for the rest of the current period
    // and the deleted event fires automatically when the period
    // ends. If you actually need to terminate immediately (fraud /
    // policy violation), use Stripe Dashboard manual cancel.
    const sub = await stripe.subscriptions.update(body.subscriptionId, {
      cancel_at_period_end: true,
      metadata: { canceled_by: "admin", canceled_at_iso: new Date().toISOString() },
    });

    // Email the affected customer + commercial team. We look up the
    // user_id from the payment row we already validated above, then
    // load the customer's profile and plan name.
    const { data: pymRow } = await supabaseAdmin
      .from("payments")
      .select("user_id, pymes_plan_id")
      .eq("stripe_subscription_id", body.subscriptionId)
      .limit(1)
      .single();
    const cycleEnd =
      sub.items?.data?.[0]?.current_period_end ??
      sub.cancel_at ??
      null;
    if (pymRow?.user_id) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("email, full_name")
        .eq("id", pymRow.user_id as string)
        .single();
      let planName = "Installment plan";
      if (pymRow.pymes_plan_id) {
        const { data: plan } = await supabaseAdmin
          .from("pymes_plans")
          .select("name")
          .eq("id", pymRow.pymes_plan_id as string)
          .single();
        if (plan?.name) planName = plan.name as string;
      }
      if (profile?.email) {
        await sendSubscriptionScheduledCancelEmail({
          to: profile.email as string,
          customerName: (profile.full_name as string) || "there",
          planName,
          cycleEndUnix: cycleEnd,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      status: sub.status,
      cancelAt: sub.cancel_at,
      currentPeriodEnd: cycleEnd,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Stripe error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
