import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Resend } from "resend";

// Steve 4/19: nexuma.ca domain + alexsanabria33@hotmail.com as commercial receiver
const COMMERCIAL_EMAIL = process.env.COMMERCIAL_AREA_EMAIL || process.env.CONTACT_NOTIFICATION_EMAIL || "alexsanabria33@hotmail.com";
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "WebMarketing <notifications@nexuma.ca>";

export async function POST(request: Request) {
  console.log("[apply-property] POST received");
  try {
    const { property_id } = await request.json();
    if (!property_id) {
      return NextResponse.json({ error: "property_id required" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.warn("[apply-property] Unauthenticated request");
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email, phone, role")
      .eq("id", user.id)
      .single();

    const { data: property } = await supabase
      .from("properties")
      .select("id, property_type, address, city, monthly_rent, owner_id")
      .eq("id", property_id)
      .single();

    if (!property) {
      console.warn(`[apply-property] Property not found: ${property_id}`);
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    const { error: leadError } = await supabase.from("leads").insert({
      user_id: user.id,
      full_name: profile?.full_name || user.email,
      email: profile?.email || user.email,
      phone: profile?.phone || null,
      role: profile?.role || "inquilino",
      source: "tenant_apply",
      status: "nuevo",
      notes: `Tenant application for property ${property.id} — ${property.property_type} at ${property.address}, ${property.city}`,
    });
    if (leadError) {
      console.error("[apply-property] Lead insert failed (continuing):", leadError);
    }

    if (!process.env.RESEND_API_KEY) {
      console.warn("[apply-property] RESEND_API_KEY not set — skipping emails");
      return NextResponse.json({ success: true, emailSkipped: true });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const tenantEmail = user.email || profile?.email;
    const recipientForCommercial = COMMERCIAL_EMAIL.split(",").map((s) => s.trim()).filter(Boolean);

    const commercialHtml = `
      <h2>New Tenant Application</h2>
      <p>A tenant has applied for a property via the matched properties feature.</p>
      <table style="border-collapse:collapse;width:100%;max-width:500px">
        <tr><td style="padding:8px;font-weight:bold">Tenant</td><td style="padding:8px">${profile?.full_name || "N/A"}</td></tr>
        <tr><td style="padding:8px;font-weight:bold">Email</td><td style="padding:8px"><a href="mailto:${user.email || profile?.email}">${user.email || profile?.email}</a></td></tr>
        ${profile?.phone ? `<tr><td style="padding:8px;font-weight:bold">Phone</td><td style="padding:8px">${profile.phone}</td></tr>` : ""}
        <tr><td style="padding:8px;font-weight:bold">Role</td><td style="padding:8px">${profile?.role || "tenant"}</td></tr>
        <tr><td style="padding:8px;font-weight:bold">Property</td><td style="padding:8px">${property.property_type} — ${property.address}, ${property.city}</td></tr>
        ${property.monthly_rent ? `<tr><td style="padding:8px;font-weight:bold">Rent</td><td style="padding:8px">$${Number(property.monthly_rent).toLocaleString()} CAD/mo</td></tr>` : ""}
      </table>
    `;

    const tenantHtml = `
<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:600px;margin:0 auto">
  <div style="background:linear-gradient(135deg,#0B38D9 0%,#0FA37F 100%);padding:28px 24px;border-radius:8px 8px 0 0">
    <h1 style="color:#fff;margin:0;font-size:24px">Thank you, ${profile?.full_name || "there"}!</h1>
  </div>
  <div style="background:#fff;padding:24px;border:1px solid #e5e5e5;border-top:none">
    <p style="font-size:16px">Our team will review your profile and contact you shortly about the property below:</p>
    <table style="border-collapse:collapse;width:100%;max-width:500px;margin:20px 0;background:#f8f9fa;border-radius:6px">
      <tr><td style="padding:12px;font-weight:bold;width:35%">Property</td><td style="padding:12px">${property.property_type}</td></tr>
      <tr><td style="padding:12px;font-weight:bold">Location</td><td style="padding:12px">${property.address}, ${property.city}</td></tr>
      ${property.monthly_rent ? `<tr><td style="padding:12px;font-weight:bold">Monthly rent</td><td style="padding:12px">$${Number(property.monthly_rent).toLocaleString()} CAD</td></tr>` : ""}
    </table>
    <p style="font-size:14px;color:#666">What happens next:</p>
    <ul style="font-size:14px;color:#666">
      <li>Our commercial team reviews your tenant profile</li>
      <li>We contact you within 24-48 hours to schedule a viewing</li>
      <li>If everything matches, we facilitate the lease signing (RTB-1 BC)</li>
    </ul>
    <p style="margin-top:24px">
      <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://webmarketing-lyart.vercel.app"}/dashboard" style="display:inline-block;background:#0B38D9;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600">Go to Dashboard</a>
    </p>
    <p style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e5e5;font-size:12px;color:#888;text-align:center">
      Nexuma marketing ltd
    </p>
  </div>
</div>`;

    // Steve 4/26 fix: must AWAIT sends. Vercel serverless freezes the function once the
    // response is returned, killing fire-and-forget promises before the Resend HTTP call
    // completes — which is why neither email was reaching Resend's dashboard.
    console.log(`[apply-property] Sending commercial -> ${recipientForCommercial.join(", ")}`);
    console.log(`[apply-property] Sending tenant confirmation -> ${tenantEmail || "(none)"}`);

    const sends: Promise<unknown>[] = [
      resend.emails.send({
        from: FROM_EMAIL,
        to: recipientForCommercial,
        subject: `New Tenant Application — ${property.property_type} in ${property.city}`,
        html: commercialHtml,
      }),
    ];
    if (tenantEmail) {
      sends.push(
        resend.emails.send({
          from: FROM_EMAIL,
          to: [tenantEmail],
          subject: `Application received — ${property.property_type} in ${property.city}`,
          html: tenantHtml,
        }),
      );
    }

    const results = await Promise.allSettled(sends);
    const labels = tenantEmail ? ["commercial", "tenant"] : ["commercial"];
    let anySuccess = false;
    results.forEach((r, i) => {
      if (r.status === "fulfilled") {
        anySuccess = true;
        console.log(`[apply-property] ${labels[i]} email sent`, r.value);
      } else {
        console.error(`[apply-property] ${labels[i]} email failed:`, r.reason);
      }
    });

    return NextResponse.json({ success: true, emailSent: anySuccess });
  } catch (err) {
    console.error("[apply-property] Unhandled error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
