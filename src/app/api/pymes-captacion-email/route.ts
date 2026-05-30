import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Resend } from "resend";

const COMMERCIAL_EMAIL = process.env.COMMERCIAL_AREA_EMAIL || "alexsanabria33@hotmail.com";
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Nexuma Marketing <notifications@nexuma.ca>";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email, phone")
      .eq("id", user.id)
      .single();

    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);

      // 1. Commercial team notification
      resend.emails.send({
        from: FROM_EMAIL,
        to: COMMERCIAL_EMAIL.split(",").map((s) => s.trim()).filter(Boolean),
        subject: `New Client Acquisition Lead — ${body.business_name || "Unknown"}`,
        html: `
          <h2>New Rescue Session Request (Client Acquisition)</h2>
          <p>A PYMES client has completed the Client Acquisition form and requested a rescue session.</p>
          <table style="border-collapse:collapse;width:100%;max-width:600px">
            <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5">Contact Name</td><td style="padding:8px">${profile?.full_name || "N/A"}</td></tr>
            <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5">Email</td><td style="padding:8px"><a href="mailto:${profile?.email || user.email}">${profile?.email || user.email}</a></td></tr>
            ${profile?.phone ? `<tr><td style="padding:8px;font-weight:bold;background:#f5f5f5">Phone</td><td style="padding:8px">${profile.phone}</td></tr>` : ""}
            <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5">Business Name</td><td style="padding:8px">${body.business_name || "N/A"}</td></tr>
            <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5">Industry</td><td style="padding:8px">${body.industry || "N/A"}</td></tr>
            <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5">Goals</td><td style="padding:8px">${Array.isArray(body.business_goals) ? body.business_goals.join(", ") : body.business_goals || "N/A"}</td></tr>
            <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5">Biggest Challenge</td><td style="padding:8px">${body.biggest_challenge || "N/A"}</td></tr>
          </table>
          <p style="margin-top:20px;color:#666;font-size:12px">Please contact this lead within 24 hours to schedule their rescue session.</p>
        `,
      }).catch((err) => console.error("Captacion email send failed:", err));

      // 2. Customer confirmation email
      // Steve 5/27 Milestone 4: May 26 docx reported "Si entro por
      // Business owner en la pagina principal, no llega ningún e-mail"
      // — this route was only sending to commercial, never to the
      // customer. Added the matching confirmation email.
      const clientEmail = user.email || profile?.email;
      if (clientEmail) {
        resend.emails.send({
          from: FROM_EMAIL,
          to: [clientEmail],
          subject: `Your business consultation request is confirmed — Nexuma`,
          html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:600px;margin:0 auto">
  <div style="background:linear-gradient(135deg,#0B38D9 0%,#0FA37F 100%);padding:28px 24px;border-radius:8px 8px 0 0">
    <h1 style="color:#fff;margin:0;font-size:24px">Welcome, ${profile?.full_name || "there"}!</h1>
  </div>
  <div style="background:#fff;padding:24px;border:1px solid #e5e5e5;border-top:none">
    <p>Thank you for completing the Client Acquisition form for <b>${body.business_name || "your business"}</b>.</p>
    <p>Our commercial team will reach out within 24 hours to schedule your personalized rescue session.</p>
    <table style="border-collapse:collapse;width:100%;max-width:500px;margin:20px 0">
      <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5;width:40%">Business</td><td style="padding:8px">${body.business_name || "N/A"}</td></tr>
      <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5">Industry</td><td style="padding:8px">${body.industry || "N/A"}</td></tr>
    </table>
    <p style="margin-top:24px">
      <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://webmarketing-lyart.vercel.app"}/dashboard" style="display:inline-block;background:#0B38D9;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600">Go to my Dashboard</a>
    </p>
    <p style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e5e5;font-size:12px;color:#888;text-align:center">
      Nexuma marketing ltd
    </p>
  </div>
</div>`,
        }).catch((err) => console.error("Client confirmation email failed:", err));
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Captacion email error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
