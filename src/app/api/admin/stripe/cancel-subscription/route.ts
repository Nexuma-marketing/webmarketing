import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";

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
    const sub = await stripe.subscriptions.cancel(body.subscriptionId, {
      invoice_now: false,
      prorate: false,
    });
    return NextResponse.json({ ok: true, status: sub.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Stripe error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
