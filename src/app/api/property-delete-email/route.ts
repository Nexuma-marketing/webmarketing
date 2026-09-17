import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Resend } from "resend";
import { OWNER_TIERS } from "@/lib/constants";
import { OWNER_PRIMARY_PLAN, formatOwnerPlanPrice } from "@/lib/owner-plan-display";
import type { PropertyServiceTier, UserRole } from "@/types/database";

// Sends an email when a customer deletes a property from "My Properties"
// (delete-property-button.tsx), which by then has already deleted the
// property and re-run /api/profiling. Mirrors property-edit-email /
// owner-submit-email: same recipients (commercial team + the
// authenticated customer), same Promise.allSettled + per-recipient error
// checking, same general template style. See
// PROPERTY_DELETE_EMAIL_NOTIFICATION_FIX.md.
const COMMERCIAL_EMAIL = process.env.COMMERCIAL_AREA_EMAIL || "alexsanabria33@hotmail.com";
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Nexuma Marketing <notifications@nexuma.ca>";

const ROLE_TO_TIER: Partial<Record<UserRole, PropertyServiceTier>> = {
  propietario: "basic",
  propietario_preferido: "preferred_owners",
  inversionista: "elite",
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { address, city, previousTier } = body as {
      address?: string;
      city?: string;
      previousTier?: PropertyServiceTier | null;
    };

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email, role")
      .eq("id", user.id)
      .single();

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ success: true, skipped: true });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const propertyLabel = [address, city].filter(Boolean).join(", ") || "the property";
    const recipientForCommercial = COMMERCIAL_EMAIL.split(",").map((s) => s.trim()).filter(Boolean);

    // Authoritative "new tier": read from the profile AFTER profiling has
    // already re-run (the caller awaits /api/profiling before calling
    // this route) — never trust the client for the tier that drives the
    // pricing terms shown below. previousTier, by contrast, can only come
    // from the client: it was captured before deletion, and the profile
    // row no longer reflects it by the time this route runs.
    const newTier: PropertyServiceTier | null = profile?.role
      ? ROLE_TO_TIER[profile.role as UserRole] ?? null
      : null;
    const tierChanged = Boolean(previousTier && newTier && previousTier !== newTier);

    let tierChangeHtml = "";
    let tierChangeLine = "";
    if (tierChanged && newTier) {
      const newTierInfo = OWNER_TIERS[newTier];
      const previousTierInfo = previousTier ? OWNER_TIERS[previousTier] : null;
      const primaryPlan = OWNER_PRIMARY_PLAN[newTier];

      let pricingText = "";
      if (primaryPlan) {
        const { data: remainingProperties } = await supabase
          .from("properties")
          .select("monthly_rent")
          .eq("owner_id", user.id);
        pricingText = formatOwnerPlanPrice(primaryPlan.pricing, primaryPlan.name, remainingProperties || []);
      }

      tierChangeLine = `Your service tier changed from ${previousTierInfo?.name || previousTier} to ${newTierInfo?.name || newTier}.`;
      tierChangeHtml = `
    <div style="margin:20px 0;padding:12px 16px;background:#fff7ed;border:1px solid #fed7aa;border-radius:6px">
      <p style="margin:0 0 4px;font-weight:bold;color:#92400e">Service tier changed</p>
      <p style="margin:0">
        Previously <strong>${previousTierInfo?.name || previousTier}</strong>, now <strong>${newTierInfo?.name || newTier}</strong>.
      </p>
      ${pricingText ? `<p style="margin:8px 0 0">${pricingText}</p>` : ""}
    </div>`;
    }

    // 1. Email to commercial team
    const sends: Promise<unknown>[] = [
      resend.emails.send({
        from: FROM_EMAIL,
        to: recipientForCommercial,
        subject: tierChanged
          ? `Property Removed & Tier Changed — ${propertyLabel}`
          : `Property Removed — ${propertyLabel}`,
        html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:600px;margin:0 auto">
  <h2 style="color:#0B38D9">Property Removed</h2>
  <p>A customer deleted one of their properties.</p>
  <table style="border-collapse:collapse;width:100%;max-width:500px;margin:20px 0">
    <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5;width:40%">Name</td><td style="padding:8px">${profile?.full_name || "N/A"}</td></tr>
    <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5">Email</td><td style="padding:8px"><a href="mailto:${profile?.email || user.email}">${profile?.email || user.email}</a></td></tr>
    <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5">Property removed</td><td style="padding:8px">${propertyLabel}</td></tr>
  </table>
  ${tierChangeHtml || "<p style=\"color:#666;font-size:12px\">No service tier change — property count stayed within the same tier bracket.</p>"}
</div>`,
      }),
    ];

    // 2. Confirmation email to the customer
    // user.email (from auth) is more reliable than profile.email.
    const clientEmail = user.email || profile?.email;
    console.log(`[property-delete-email] Sending to client: ${clientEmail}`);
    if (clientEmail) {
      sends.push(
        resend.emails.send({
          from: FROM_EMAIL,
          to: [clientEmail],
          subject: "Property removed — Nexuma",
          html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:600px;margin:0 auto">
  <div style="background:linear-gradient(135deg,#0B38D9 0%,#0FA37F 100%);padding:28px 24px;border-radius:8px 8px 0 0">
    <h1 style="color:#fff;margin:0;font-size:24px">Property removed</h1>
  </div>
  <div style="background:#fff;padding:24px;border:1px solid #e5e5e5;border-top:none">
    <p>Hi ${profile?.full_name || "there"},</p>
    <p>We've removed the following property from your account:</p>
    <table style="border-collapse:collapse;width:100%;max-width:500px;margin:20px 0">
      <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5;width:40%">Property</td><td style="padding:8px">${propertyLabel}</td></tr>
    </table>
    ${tierChangeHtml || ""}
    <p>If anything doesn't look right, you can review your remaining properties anytime from your dashboard.</p>
    <p style="margin-top:24px">
      <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://webmarketing-lyart.vercel.app"}/dashboard/properties" style="display:inline-block;background:#0B38D9;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600">View my Properties</a>
    </p>
    <p style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e5e5;font-size:12px;color:#888;text-align:center">
      Nexuma marketing ltd
    </p>
  </div>
</div>`,
        }),
      );
    }

    console.log(`[property-delete-email] Sending commercial -> ${recipientForCommercial.join(", ")}`);
    console.log(`[property-delete-email] Sending customer confirmation -> ${clientEmail || "(none)"}`);
    if (tierChangeLine) console.log(`[property-delete-email] ${tierChangeLine}`);

    const results = await Promise.allSettled(sends);
    const labels = clientEmail ? ["commercial", "customer"] : ["commercial"];
    let anySuccess = false;
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        anySuccess = true;
        console.log(`[property-delete-email] ${labels[index]} email sent`, result.value);
      } else {
        console.error(`[property-delete-email] ${labels[index]} email failed:`, result.reason);
      }
    });

    return NextResponse.json({ success: true, emailSent: anySuccess, tierChanged });
  } catch (err) {
    console.error("Property delete email error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
