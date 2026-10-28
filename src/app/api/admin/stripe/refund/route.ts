import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";

// Steve 5/16 Milestone 4: admin-triggered Stripe refund. Verifies
// the caller is an admin via the cookie session, then issues a
// Stripe refund against the original payment intent. The webhook
// (charge.refunded) is what writes status='refunded' + refunded_at
// back into the payments row — this route does NOT mutate the DB
// directly so the audit trail stays single-sourced from Stripe.

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

  let body: { paymentId?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.paymentId) {
    return NextResponse.json({ error: "paymentId required" }, { status: 400 });
  }

  const { data: payment, error: fetchErr } = await supabaseAdmin
    .from("payments")
    .select("id, stripe_payment_intent_id, status, amount, refunded_amount")
    .eq("id", body.paymentId)
    .single();
  if (fetchErr || !payment) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }
  if (payment.status === "refunded") {
    return NextResponse.json({ error: "Already refunded" }, { status: 400 });
  }
  if (payment.status !== "completed") {
    return NextResponse.json(
      { error: `Cannot refund a ${payment.status} payment` },
      { status: 400 },
    );
  }
  // FIX_REFUND_VISIBILITY_REPORT.md: a partial refund leaves the row
  // 'completed'. When nothing is left to refund, answer clearly instead
  // of calling Stripe.
  const remainingCents =
    Math.round((Number(payment.amount) || 0) * 100) -
    Math.round((Number(payment.refunded_amount) || 0) * 100);
  if (remainingCents <= 0) {
    return NextResponse.json(
      { error: "Nothing left to refund: this payment is already fully refunded." },
      { status: 400 },
    );
  }
  if (!payment.stripe_payment_intent_id) {
    return NextResponse.json(
      { error: "Payment has no Stripe payment_intent — refund manually." },
      { status: 400 },
    );
  }

  // No `amount`: Stripe refunds whatever is left on the charge.
  try {
    const refund = await stripe.refunds.create({
      payment_intent: payment.stripe_payment_intent_id,
      reason: "requested_by_customer",
      metadata: {
        triggered_by: user.id,
        triggered_by_email: user.email || "",
        note: (body.reason || "").slice(0, 200),
      },
    });
    return NextResponse.json({ ok: true, refundId: refund.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Stripe error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
