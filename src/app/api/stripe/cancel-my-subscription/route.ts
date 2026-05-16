import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";

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
