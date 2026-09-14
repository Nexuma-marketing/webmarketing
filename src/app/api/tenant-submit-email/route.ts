import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Resend } from "resend";

// Steve 4/22 #8: Send email when Tenant completes preferences form
const COMMERCIAL_EMAIL = process.env.COMMERCIAL_AREA_EMAIL || "alexsanabria33@hotmail.com";
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Nexuma Marketing <notifications@nexuma.ca>";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { min_budget, max_budget, bedrooms_needed, move_in_date, is_premium } = body;

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

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ success: true, skipped: true });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const tenantType = is_premium ? "Premium Tenant" : "Tenant";
    const recipientForCommercial = COMMERCIAL_EMAIL.split(",").map((s) => s.trim()).filter(Boolean);

    // Steve — tenant commercial email match-status fix: commercial had no
    // urgency signal for a tenant who already has property matches at
    // submission time. Reuses the exact same filter predicate as
    // /api/admin/tenant-matches (budget range with the same 0.6-of-max
    // fallback when min_budget is unset, plus bedrooms) so the count shown
    // here always agrees with what sales sees on /admin/matches — not the
    // separate, more elaborate scored matching in matchPropertiesForTenant()
    // (used for the tenant-facing "Matched Properties" list), which can
    // legitimately return a different count. Best-effort: a lookup failure
    // must never block the confirmation emails from sending.
    let matchCount = 0;
    let topMatchAddress: string | null = null;
    try {
      const maxBudgetNum = max_budget ? Number(max_budget) : null;
      const rawMinBudget = min_budget ? Number(min_budget) : null;
      const minBudgetNum = rawMinBudget ?? (maxBudgetNum ? Math.floor(maxBudgetNum * 0.6) : null);
      const bedroomsNum = bedrooms_needed ? Number(bedrooms_needed) : null;

      let propQuery = supabase
        .from("properties")
        .select("address, city, monthly_rent")
        .eq("is_available", true);
      if (maxBudgetNum) propQuery = propQuery.lte("monthly_rent", maxBudgetNum);
      if (minBudgetNum) propQuery = propQuery.gte("monthly_rent", minBudgetNum);
      if (bedroomsNum && bedroomsNum > 0) propQuery = propQuery.gte("bedrooms", bedroomsNum);

      const { data: matchedProps } = await propQuery.order("monthly_rent", { ascending: true });
      matchCount = matchedProps?.length ?? 0;
      topMatchAddress = (matchedProps?.[0]?.address as string | undefined) || null;
    } catch (err) {
      console.error("[tenant-submit-email] match lookup failed:", err);
    }

    const matchStatusHtml =
      matchCount > 0
        ? `<p style="background:#fef3c7;border-left:4px solid #d97706;padding:10px 14px;margin:16px 0;font-size:14px">
    <strong>&#9888; This tenant has ${matchCount} matched propert${matchCount === 1 ? "y" : "ies"}</strong>${topMatchAddress ? ` — top match: ${topMatchAddress}` : ""} — review in <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://webmarketing-lyart.vercel.app"}/admin/matches">Tenant Matches</a>.
  </p>`
        : "";

    // 1. Email to commercial team
    const sends: Promise<unknown>[] = [
      resend.emails.send({
        from: FROM_EMAIL,
        to: recipientForCommercial,
        subject: `New ${tenantType} Registration — ${profile?.full_name || "Unknown"}`,
        html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:600px;margin:0 auto">
  <h2 style="color:#0B38D9">New ${tenantType} Registration</h2>
  <p>A new ${tenantType.toLowerCase()} has completed the preferences form.</p>
  <table style="border-collapse:collapse;width:100%;max-width:500px;margin:20px 0">
    <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5;width:40%">Name</td><td style="padding:8px">${profile?.full_name || "N/A"}</td></tr>
    <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5">Email</td><td style="padding:8px"><a href="mailto:${profile?.email || user.email}">${profile?.email || user.email}</a></td></tr>
    ${profile?.phone ? `<tr><td style="padding:8px;font-weight:bold;background:#f5f5f5">Phone</td><td style="padding:8px">${profile.phone}</td></tr>` : ""}
    <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5">Status</td><td style="padding:8px">${tenantType}</td></tr>
    <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5">Budget</td><td style="padding:8px">$${min_budget || "?"} – $${max_budget || "?"} CAD/mo</td></tr>
    <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5">Bedrooms needed</td><td style="padding:8px">${bedrooms_needed || "N/A"}</td></tr>
    <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5">Move-in date</td><td style="padding:8px">${move_in_date || "N/A"}</td></tr>
  </table>
  ${matchStatusHtml}
</div>`,
      }),
    ];

    // 2. Confirmation email to the tenant
    // Steve 4/23 #6: Use user.email (from auth) as primary, profile.email as backup.
    // user.email is guaranteed to exist after signup.
    const clientEmail = user.email || profile?.email;
    console.log(`[tenant-submit-email] Sending to client: ${clientEmail}`);
    if (clientEmail) {
      sends.push(
        resend.emails.send({
          from: FROM_EMAIL,
          to: [clientEmail],
          subject: `Your ${tenantType} registration is confirmed — Nexuma`,
          html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:600px;margin:0 auto">
  <div style="background:linear-gradient(135deg,#0B38D9 0%,#0FA37F 100%);padding:28px 24px;border-radius:8px 8px 0 0">
    <h1 style="color:#fff;margin:0;font-size:24px">Welcome, ${profile?.full_name || "there"}!</h1>
  </div>
  <div style="background:#fff;padding:24px;border:1px solid #e5e5e5;border-top:none">
    <p>Thank you for completing your tenant preferences. We're matching your profile with available properties.</p>
    <p>${is_premium ? "As a <strong>Premium Tenant</strong>, you qualify for priority matching and premium property access." : "We will notify you of matching properties."}</p>
    <p style="margin-top:24px">
      <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://webmarketing-lyart.vercel.app"}/dashboard" style="display:inline-block;background:#0B38D9;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600">See my matched properties</a>
    </p>
    <p style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e5e5;font-size:12px;color:#888;text-align:center">
      Nexuma marketing ltd
    </p>
  </div>
</div>`,
        }),
      );
    }

    console.log(`[tenant-submit-email] Sending commercial -> ${recipientForCommercial.join(", ")}`);
    console.log(`[tenant-submit-email] Sending tenant confirmation -> ${clientEmail || "(none)"}`);

    const results = await Promise.allSettled(sends);
    const labels = clientEmail ? ["commercial", "tenant"] : ["commercial"];
    let anySuccess = false;
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        anySuccess = true;
        console.log(`[tenant-submit-email] ${labels[index]} email sent`, result.value);
      } else {
        console.error(`[tenant-submit-email] ${labels[index]} email failed:`, result.reason);
      }
    });

    return NextResponse.json({ success: true, emailSent: anySuccess });
  } catch (err) {
    console.error("Tenant submit email error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
