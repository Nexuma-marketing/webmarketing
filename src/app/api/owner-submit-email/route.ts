import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Resend } from "resend";

// Steve 4/22 #8: Send email when Property Owner / Investor completes Discovery Brief
const COMMERCIAL_EMAIL = process.env.COMMERCIAL_AREA_EMAIL || "alexsanabria33@hotmail.com";
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Nexuma Marketing <notifications@nexuma.ca>";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { user_type, property_count, tier, cities, rents } = body;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email, phone, role")
      .eq("id", user.id)
      .single();

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ success: true, skipped: true });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);

    const roleLabel = user_type === "investor" ? "Investor" : "Property Owner";
    const citiesList = Array.isArray(cities) ? cities.filter(Boolean).join(", ") : "";
    const rentsList = Array.isArray(rents) ? rents.map((r: number) => `$${r?.toLocaleString() || 0}`).join(", ") : "";

    // 1. Email to commercial team
    const commercialHtml = `
<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:600px;margin:0 auto">
  <h2 style="color:#0B38D9">New ${roleLabel} Registration</h2>
  <p>A new ${roleLabel.toLowerCase()} has completed the Discovery Brief.</p>
  <table style="border-collapse:collapse;width:100%;max-width:500px;margin:20px 0">
    <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5;width:40%">Name</td><td style="padding:8px">${profile?.full_name || "N/A"}</td></tr>
    <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5">Email</td><td style="padding:8px"><a href="mailto:${profile?.email || user.email}">${profile?.email || user.email}</a></td></tr>
    ${profile?.phone ? `<tr><td style="padding:8px;font-weight:bold;background:#f5f5f5">Phone</td><td style="padding:8px">${profile.phone}</td></tr>` : ""}
    <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5">Role</td><td style="padding:8px">${roleLabel}</td></tr>
    <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5">Service Tier</td><td style="padding:8px">${tier || "N/A"}</td></tr>
    <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5">Properties</td><td style="padding:8px">${property_count || 0}</td></tr>
    ${citiesList ? `<tr><td style="padding:8px;font-weight:bold;background:#f5f5f5">Cities</td><td style="padding:8px">${citiesList}</td></tr>` : ""}
    ${rentsList ? `<tr><td style="padding:8px;font-weight:bold;background:#f5f5f5">Monthly Rents</td><td style="padding:8px">${rentsList}</td></tr>` : ""}
  </table>
  <p style="color:#666;font-size:12px">Please reach out to this ${roleLabel.toLowerCase()} to finalize their service plan and next steps.</p>
</div>`;

    const recipientForCommercial = COMMERCIAL_EMAIL.split(",").map((s) => s.trim()).filter(Boolean);
    const sends: Promise<unknown>[] = [
      resend.emails.send({
        from: FROM_EMAIL,
        to: recipientForCommercial,
        subject: `New ${roleLabel} Registration — ${profile?.full_name || "Unknown"}`,
        html: commercialHtml,
      }),
    ];

    // 2. Confirmation email to the client
    // Steve 4/23: user.email (from auth) is more reliable than profile.email
    const clientEmail = user.email || profile?.email;
    console.log(`[owner-submit-email] Sending to client: ${clientEmail}`);
    if (clientEmail) {
      const clientHtml = `
<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:600px;margin:0 auto">
  <div style="background:linear-gradient(135deg,#0B38D9 0%,#0FA37F 100%);padding:28px 24px;border-radius:8px 8px 0 0">
    <h1 style="color:#fff;margin:0;font-size:24px">Welcome, ${profile?.full_name || "there"}!</h1>
  </div>
  <div style="background:#fff;padding:24px;border:1px solid #e5e5e5;border-top:none">
    <p>Thank you for completing your Discovery Brief. Here is a summary of your registration:</p>
    <table style="border-collapse:collapse;width:100%;max-width:500px;margin:20px 0">
      <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5;width:40%">Role</td><td style="padding:8px">${roleLabel}</td></tr>
      <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5">Service Tier</td><td style="padding:8px">${tier || "N/A"}</td></tr>
      <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5">Properties registered</td><td style="padding:8px">${property_count || 0}</td></tr>
    </table>
    <p>Our commercial team will reach out shortly to walk you through the next steps.</p>
    <p style="margin-top:24px">
      <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://webmarketing-lyart.vercel.app"}/dashboard" style="display:inline-block;background:#0B38D9;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600">Go to my Dashboard</a>
    </p>
    <p style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e5e5;font-size:12px;color:#888;text-align:center">
      Nexuma marketing ltd
    </p>
  </div>
</div>`;

      sends.push(
        resend.emails.send({
          from: FROM_EMAIL,
          to: [clientEmail],
          subject: `Your ${roleLabel} registration is confirmed — Nexuma`,
          html: clientHtml,
        }),
      );
    }

    // Await sends before responding: serverless runtimes can freeze after a
    // response, preventing fire-and-forget Resend requests from completing.
    console.log(`[owner-submit-email] Sending commercial -> ${recipientForCommercial.join(", ")}`);
    console.log(`[owner-submit-email] Sending owner confirmation -> ${clientEmail || "(none)"}`);

    const results = await Promise.allSettled(sends);
    const labels = clientEmail ? ["commercial", "owner"] : ["commercial"];
    let anySuccess = false;
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        anySuccess = true;
        console.log(`[owner-submit-email] ${labels[index]} email sent`, result.value);
      } else {
        console.error(`[owner-submit-email] ${labels[index]} email failed:`, result.reason);
      }
    });

    return NextResponse.json({ success: true, emailSent: anySuccess });
  } catch (err) {
    console.error("Owner submit email error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
