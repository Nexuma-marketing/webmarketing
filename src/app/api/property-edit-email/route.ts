import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Resend } from "resend";

// Sends an email when a customer saves changes in the per-property
// "Update Preferences" flow (/dashboard/preferences/[id]). Mirrors
// owner-submit-email / tenant-submit-email: same recipients (commercial
// team + the authenticated customer), same Promise.allSettled +
// per-recipient error checking, same general template style.
const COMMERCIAL_EMAIL = process.env.COMMERCIAL_AREA_EMAIL || "alexsanabria33@hotmail.com";
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Nexuma Marketing <notifications@nexuma.ca>";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { address, city } = body;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .single();

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ success: true, skipped: true });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const propertyLabel = [address, city].filter(Boolean).join(", ") || "your property";
    const recipientForCommercial = COMMERCIAL_EMAIL.split(",").map((s) => s.trim()).filter(Boolean);

    // 1. Email to commercial team
    const sends: Promise<unknown>[] = [
      resend.emails.send({
        from: FROM_EMAIL,
        to: recipientForCommercial,
        subject: `Property Updated — ${propertyLabel}`,
        html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:600px;margin:0 auto">
  <h2 style="color:#0B38D9">Property Details Updated</h2>
  <p>A customer updated their preferences for one of their properties.</p>
  <table style="border-collapse:collapse;width:100%;max-width:500px;margin:20px 0">
    <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5;width:40%">Name</td><td style="padding:8px">${profile?.full_name || "N/A"}</td></tr>
    <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5">Email</td><td style="padding:8px"><a href="mailto:${profile?.email || user.email}">${profile?.email || user.email}</a></td></tr>
    <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5">Property</td><td style="padding:8px">${propertyLabel}</td></tr>
  </table>
  <p style="color:#666;font-size:12px">Property details updated.</p>
</div>`,
      }),
    ];

    // 2. Confirmation email to the customer
    // user.email (from auth) is more reliable than profile.email.
    const clientEmail = user.email || profile?.email;
    console.log(`[property-edit-email] Sending to client: ${clientEmail}`);
    if (clientEmail) {
      sends.push(
        resend.emails.send({
          from: FROM_EMAIL,
          to: [clientEmail],
          subject: "Your property update is confirmed — Nexuma",
          html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:600px;margin:0 auto">
  <div style="background:linear-gradient(135deg,#0B38D9 0%,#0FA37F 100%);padding:28px 24px;border-radius:8px 8px 0 0">
    <h1 style="color:#fff;margin:0;font-size:24px">Property updated</h1>
  </div>
  <div style="background:#fff;padding:24px;border:1px solid #e5e5e5;border-top:none">
    <p>Hi ${profile?.full_name || "there"},</p>
    <p>We've saved your updated preferences for:</p>
    <table style="border-collapse:collapse;width:100%;max-width:500px;margin:20px 0">
      <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5;width:40%">Property</td><td style="padding:8px">${propertyLabel}</td></tr>
    </table>
    <p>If anything doesn't look right, you can update it again anytime from your dashboard.</p>
    <p style="margin-top:24px">
      <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://webmarketing-lyart.vercel.app"}/dashboard/preferences" style="display:inline-block;background:#0B38D9;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600">View my Properties</a>
    </p>
    <p style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e5e5;font-size:12px;color:#888;text-align:center">
      Nexuma marketing ltd
    </p>
  </div>
</div>`,
        }),
      );
    }

    console.log(`[property-edit-email] Sending commercial -> ${recipientForCommercial.join(", ")}`);
    console.log(`[property-edit-email] Sending customer confirmation -> ${clientEmail || "(none)"}`);

    const results = await Promise.allSettled(sends);
    const labels = clientEmail ? ["commercial", "customer"] : ["commercial"];
    let anySuccess = false;
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        anySuccess = true;
        console.log(`[property-edit-email] ${labels[index]} email sent`, result.value);
      } else {
        console.error(`[property-edit-email] ${labels[index]} email failed:`, result.reason);
      }
    });

    return NextResponse.json({ success: true, emailSent: anySuccess });
  } catch (err) {
    console.error("Property edit email error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
