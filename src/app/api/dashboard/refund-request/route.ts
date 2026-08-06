import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Resend } from "resend";

// Steve 6/10 (6-2.md #52): customer-facing refund request endpoint.
// Alex docx 2026-06-07 — "Donde el cliente pide una devolucion de
// dinero? como es el proceso." There's an admin-only refund button
// in /admin/payments (calls /api/admin/stripe/refund), but no way
// for the customer to ASK for one without contacting Alex out of
// band. This route lets a customer submit a refund request from
// /dashboard/payments — it doesn't process the refund automatically,
// it just emails the commercial team with the payment details + the
// customer's stated reason. The team then approves/rejects in the
// existing admin UI.

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { payment_id, reason } = body as { payment_id?: string; reason?: string };
  if (!payment_id || !reason || reason.trim().length < 5) {
    return NextResponse.json(
      { error: "payment_id and a reason (5+ chars) are required" },
      { status: 400 },
    );
  }

  // Steve 6/10: pull the payment via service-role so we can confirm
  // ownership AND join the service / plan names in one place. We
  // also need profile info for the email body.
  const { data: payment } = await supabaseAdmin
    .from("payments")
    .select("id, user_id, amount, currency, status, stripe_session_id, stripe_payment_intent_id, created_at, service_id, pymes_plan_id")
    .eq("id", payment_id)
    .single();
  if (!payment) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }
  if (payment.user_id !== user.id) {
    return NextResponse.json(
      { error: "You can only request refunds on your own payments" },
      { status: 403 },
    );
  }
  if (payment.status !== "completed") {
    return NextResponse.json(
      { error: `Cannot request a refund on a ${payment.status} payment` },
      { status: 400 },
    );
  }

  const [{ data: profile }, { data: service }, { data: plan }] = await Promise.all([
    supabaseAdmin.from("profiles").select("full_name, email, phone, role").eq("id", user.id).single(),
    payment.service_id
      ? supabaseAdmin.from("services").select("name").eq("id", payment.service_id).single()
      : Promise.resolve({ data: null }),
    payment.pymes_plan_id
      ? supabaseAdmin.from("pymes_plans").select("name").eq("id", payment.pymes_plan_id).single()
      : Promise.resolve({ data: null }),
  ]);

  const itemName =
    (service?.name as string | undefined) ||
    (plan?.name as string | undefined) ||
    "(unknown service)";

  // Best-effort email to the commercial team. Failures don't block
  // the response — the customer still gets a "submitted" confirmation
  // and we log the error server-side so Alex can recover.
  if (process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const commercial = (process.env.COMMERCIAL_AREA_EMAIL || "alexsanabria33@hotmail.com")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const from = process.env.RESEND_FROM_EMAIL || "Nexuma Marketing <notifications@nexuma.ca>";
      const customerName = (profile?.full_name as string) || (profile?.email as string) || "Unknown customer";
      const customerEmail = (profile?.email as string) || user.email || "(no email)";
      const customerPhone = (profile?.phone as string) || "(no phone)";
      const amount = `${Number(payment.amount).toLocaleString()} ${payment.currency || "CAD"}`;
      const date = new Date(payment.created_at as string).toLocaleDateString("en-CA");
      await resend.emails.send({
        from,
        to: commercial,
        replyTo: customerEmail,
        subject: `Refund request — ${customerName} — ${amount}`,
        html: `
<div style="font-family:Arial,sans-serif;max-width:600px">
  <h2 style="color:#0B38D9">Refund request from a customer</h2>
  <table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:14px">
    <tr><td style="padding:6px;background:#f5f5f5;font-weight:bold">Customer</td><td style="padding:6px">${customerName}</td></tr>
    <tr><td style="padding:6px;background:#f5f5f5;font-weight:bold">Email</td><td style="padding:6px"><a href="mailto:${customerEmail}">${customerEmail}</a></td></tr>
    <tr><td style="padding:6px;background:#f5f5f5;font-weight:bold">Phone</td><td style="padding:6px">${customerPhone}</td></tr>
    <tr><td style="padding:6px;background:#f5f5f5;font-weight:bold">Service / Plan</td><td style="padding:6px">${itemName}</td></tr>
    <tr><td style="padding:6px;background:#f5f5f5;font-weight:bold">Amount</td><td style="padding:6px">${amount}</td></tr>
    <tr><td style="padding:6px;background:#f5f5f5;font-weight:bold">Original date</td><td style="padding:6px">${date}</td></tr>
    <tr><td style="padding:6px;background:#f5f5f5;font-weight:bold">Stripe session</td><td style="padding:6px"><code>${payment.stripe_session_id || "—"}</code></td></tr>
  </table>
  <p style="font-weight:bold">Customer's reason:</p>
  <blockquote style="border-left:3px solid #0B38D9;padding:8px 12px;background:#f9f9f9;margin:8px 0;font-style:italic">${reason.replace(/</g, "&lt;")}</blockquote>
  <p style="margin-top:24px">To process this refund, open <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://nexuma.ca"}/admin/payments">/admin/payments</a>, find the row, and click the Refund button. Stripe handles the actual money movement.</p>
  <p style="font-size:12px;color:#666">Replying to this email goes directly to the customer (${customerEmail}).</p>
</div>`,
      });
    } catch (err) {
      console.error("refund request email failed:", err);
    }
  }

  return NextResponse.json({ success: true });
}
