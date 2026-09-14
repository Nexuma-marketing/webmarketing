import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Resend } from "resend";

// Steve — Tenant Cleaning Services (lead-gen): there is no cleaning
// company partner integrated yet, so this route does not create a
// service/payment — it just emails the commercial team so they can
// manually follow up, per the same commercial-only best-effort pattern
// already used by /api/dashboard/refund-request. Deliberately no
// customer confirmation email: this is a lightweight expression of
// interest, not a formal consultation request.
export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, phone")
    .eq("id", user.id)
    .single();

  const customerName = (profile?.full_name as string) || user.email || "Unknown tenant";
  const customerEmail = (profile?.email as string) || user.email || "(no email)";
  const customerPhone = (profile?.phone as string) || "(no phone)";

  if (process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const commercial = (process.env.COMMERCIAL_AREA_EMAIL || "alexsanabria33@hotmail.com")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const from = process.env.RESEND_FROM_EMAIL || "Nexuma Marketing <notifications@nexuma.ca>";
      await resend.emails.send({
        from,
        to: commercial,
        replyTo: customerEmail,
        subject: `Cleaning Services interest — ${customerName}`,
        html: `
<div style="font-family:Arial,sans-serif;max-width:600px">
  <h2 style="color:#0B38D9">Tenant interested in Cleaning Services</h2>
  <p>A tenant clicked "Contact Us" on the Cleaning Services card in their dashboard, expressing interest in being connected with a cleaning provider.</p>
  <table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:14px">
    <tr><td style="padding:6px;background:#f5f5f5;font-weight:bold">Name</td><td style="padding:6px">${customerName}</td></tr>
    <tr><td style="padding:6px;background:#f5f5f5;font-weight:bold">Email</td><td style="padding:6px"><a href="mailto:${customerEmail}">${customerEmail}</a></td></tr>
    <tr><td style="padding:6px;background:#f5f5f5;font-weight:bold">Phone</td><td style="padding:6px">${customerPhone}</td></tr>
  </table>
  <p style="font-size:12px;color:#666">No cleaning company partner is integrated yet — follow up with this lead manually.</p>
</div>`,
      });
    } catch (err) {
      console.error("cleaning services interest email failed:", err);
    }
  }

  return NextResponse.json({ success: true });
}
