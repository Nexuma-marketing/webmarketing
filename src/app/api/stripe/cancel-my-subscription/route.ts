import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";
import { sendSubscriptionScheduledCancelEmail } from "@/lib/email";

// Steve 5/16 Milestone 4: user-initiated cancellation. The caller
// must own at least one payment row referencing the given Stripe
// subscription_id — that's how we authorize the cancel without
// requiring admin role. Webhook updates the DB; this route just
// asks Stripe to cancel.

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
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

  // Authorization: caller must own a payment row tied to this
  // subscription. Use service role for the lookup so RLS doesn't
  // hide rows that may have RLS gaps for self-read.
  const { data: ownership } = await supabaseAdmin
    .from("payments")
    .select("id")
    .eq("stripe_subscription_id", body.subscriptionId)
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!ownership) {
    return NextResponse.json(
      { error: "Not your subscription" },
      { status: 403 },
    );
  }

  try {
    // Steve 5/20 Milestone 4: cancel at period end so the customer
    // keeps service for the rest of the billing cycle they already
    // paid for. No prorated refund. Stripe fires
    // customer.subscription.deleted automatically at cycle end.
    const sub = await stripe.subscriptions.update(body.subscriptionId, {
      cancel_at_period_end: true,
      metadata: {
        canceled_by: "customer",
        canceled_at_iso: new Date().toISOString(),
      },
    });

    // Send the "scheduled to cancel" email immediately so the user
    // gets confirmation of the date their service ends. We do not
    // wait for the webhook because the actual cancellation event
    // (customer.subscription.deleted) only fires at cycle end —
    // which could be 4+ weeks from now.
    const cycleEnd =
      sub.items?.data?.[0]?.current_period_end ??
      sub.cancel_at ??
      null;
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email, full_name")
      .eq("id", user.id)
      .single();
    if (profile?.email) {
      const metadata = sub.metadata || {};
      const pymesPlanId = (metadata.pymes_plan_id as string) || null;
      let planName = "Installment plan";
      if (pymesPlanId) {
        const { data: plan } = await supabaseAdmin
          .from("pymes_plans")
          .select("name")
          .eq("id", pymesPlanId)
          .single();
        if (plan?.name) planName = plan.name as string;
      }
      await sendSubscriptionScheduledCancelEmail({
        to: profile.email as string,
        customerName: (profile.full_name as string) || "there",
        planName,
        cycleEndUnix: cycleEnd,
      });
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
