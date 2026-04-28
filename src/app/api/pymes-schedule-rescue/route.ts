import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Resend } from "resend";

// Steve 4/26: "Schedule My Rescue Session" button on Sales Leak Diagnosis result page
// must trigger a commercial alert (and tenant confirmation), same as Captacion form.
const COMMERCIAL_EMAIL = process.env.COMMERCIAL_AREA_EMAIL || "alexsanabria33@hotmail.com";
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "WebMarketing <notifications@nexuma.ca>";

export async function POST(request: Request) {
  console.log("[pymes-schedule-rescue] POST received");
  try {
    const { diagnosis_id } = await request.json();
    if (!diagnosis_id) {
      return NextResponse.json({ error: "diagnosis_id required" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.warn("[pymes-schedule-rescue] Unauthenticated request");
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const [{ data: profile }, { data: diagnosis }] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, email, phone")
        .eq("id", user.id)
        .single(),
      supabase
        .from("pymes_diagnosis")
        .select("*")
        .eq("id", diagnosis_id)
        .eq("user_id", user.id)
        .single(),
    ]);

    if (!diagnosis) {
      console.warn(`[pymes-schedule-rescue] Diagnosis not found: ${diagnosis_id}`);
      return NextResponse.json({ error: "Diagnosis not found" }, { status: 404 });
    }

    const { error: leadError } = await supabase.from("leads").insert({
      user_id: user.id,
      full_name: profile?.full_name || user.email,
      email: profile?.email || user.email,
      phone: profile?.phone || null,
      role: "pymes",
      source: "pymes_schedule_rescue",
      status: "nuevo",
      notes: `Schedule Rescue Session request — diagnosis ${diagnosis.id}, recommended plan: ${diagnosis.recommended_plan}, urgency: ${diagnosis.urgency_level}, score: ${diagnosis.total_score}/35`,
    });
    if (leadError) {
      console.error("[pymes-schedule-rescue] Lead insert failed (continuing):", leadError);
    }

    if (!process.env.RESEND_API_KEY) {
      console.warn("[pymes-schedule-rescue] RESEND_API_KEY not set — skipping emails");
      return NextResponse.json({ success: true, emailSkipped: true });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const clientEmail = user.email || profile?.email;
    const recipientForCommercial = COMMERCIAL_EMAIL.split(",").map((s) => s.trim()).filter(Boolean);

    const recommendedPlan = (diagnosis.recommended_plan || "growth").toString();
    const urgency = (diagnosis.urgency_level || "high").toString();
    const score = diagnosis.total_score ?? "N/A";
    const monthlyRevenue = Number(diagnosis.monthly_revenue || 0);
    const estimatedLoss = Number(diagnosis.estimated_loss || 0);

    const commercialHtml = `
<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:600px;margin:0 auto">
  <h2 style="color:#0B38D9">New Rescue Session Request (Sales Leak Diagnosis)</h2>
  <p>A PYMES client has clicked <b>Schedule My Rescue Session</b> on the Sales Leak Diagnosis result page.</p>
  <table style="border-collapse:collapse;width:100%;max-width:560px;margin:16px 0">
    <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5;width:40%">Contact Name</td><td style="padding:8px">${profile?.full_name || "N/A"}</td></tr>
    <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5">Email</td><td style="padding:8px"><a href="mailto:${clientEmail || ""}">${clientEmail || "N/A"}</a></td></tr>
    ${profile?.phone ? `<tr><td style="padding:8px;font-weight:bold;background:#f5f5f5">Phone</td><td style="padding:8px">${profile.phone}</td></tr>` : ""}
    <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5">Company</td><td style="padding:8px">${diagnosis.company_name || "N/A"}</td></tr>
    <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5">Sector</td><td style="padding:8px">${diagnosis.sector || "N/A"}</td></tr>
    <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5">Monthly Revenue</td><td style="padding:8px">$${monthlyRevenue.toLocaleString()} CAD</td></tr>
    <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5">Estimated Annual Loss</td><td style="padding:8px">$${estimatedLoss.toLocaleString()} CAD</td></tr>
    <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5">Total Score</td><td style="padding:8px">${score}/35</td></tr>
    <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5">Urgency Level</td><td style="padding:8px">${urgency.toUpperCase()}</td></tr>
    <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5">Recommended Plan</td><td style="padding:8px">${recommendedPlan.toUpperCase()}</td></tr>
  </table>
  <h3 style="margin-top:20px">Question Scores</h3>
  <table style="border-collapse:collapse;width:100%;max-width:560px">
    <tr><td style="padding:6px;background:#f5f5f5">Online Presence</td><td style="padding:6px;text-align:right">${diagnosis.q1_online_presence ?? "-"} / 5</td></tr>
    <tr><td style="padding:6px;background:#f5f5f5">SEO Positioning</td><td style="padding:6px;text-align:right">${diagnosis.q2_seo_positioning ?? "-"} / 5</td></tr>
    <tr><td style="padding:6px;background:#f5f5f5">Lead Generation</td><td style="padding:6px;text-align:right">${diagnosis.q3_lead_generation ?? "-"} / 5</td></tr>
    <tr><td style="padding:6px;background:#f5f5f5">Lead Conversion</td><td style="padding:6px;text-align:right">${diagnosis.q4_lead_conversion ?? "-"} / 5</td></tr>
    <tr><td style="padding:6px;background:#f5f5f5">Client Retention</td><td style="padding:6px;text-align:right">${diagnosis.q5_client_retention ?? "-"} / 5</td></tr>
    <tr><td style="padding:6px;background:#f5f5f5">Repeat Purchases</td><td style="padding:6px;text-align:right">${diagnosis.q6_repeat_purchases ?? "-"} / 5</td></tr>
    <tr><td style="padding:6px;background:#f5f5f5">Marketing Strategy</td><td style="padding:6px;text-align:right">${diagnosis.q7_marketing_strategy ?? "-"} / 5</td></tr>
  </table>
  <p style="margin-top:20px;color:#666;font-size:12px">Please contact this lead within 24 hours to schedule the free 15-minute rescue session.</p>
</div>`;

    const clientHtml = `
<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:600px;margin:0 auto">
  <div style="background:linear-gradient(135deg,#0B38D9 0%,#0FA37F 100%);padding:28px 24px;border-radius:8px 8px 0 0">
    <h1 style="color:#fff;margin:0;font-size:24px">Your Rescue Session is on the way</h1>
  </div>
  <div style="background:#fff;padding:24px;border:1px solid #e5e5e5;border-top:none">
    <p style="font-size:16px">Hi ${profile?.full_name || "there"},</p>
    <p>We have received your request to schedule a Rescue Session for <b>${diagnosis.company_name || "your business"}</b>.</p>
    <table style="border-collapse:collapse;width:100%;max-width:500px;margin:20px 0;background:#f8f9fa;border-radius:6px">
      <tr><td style="padding:12px;font-weight:bold;width:45%">Recommended Plan</td><td style="padding:12px">${recommendedPlan.toUpperCase()}</td></tr>
      <tr><td style="padding:12px;font-weight:bold">Urgency Level</td><td style="padding:12px">${urgency.toUpperCase()}</td></tr>
      <tr><td style="padding:12px;font-weight:bold">Diagnosis Score</td><td style="padding:12px">${score} / 35</td></tr>
    </table>
    <p>Our commercial team will reach out within 24 hours to book your free 15-minute personalized session, where we will walk you through the action plan to stop the leak.</p>
    <p style="margin-top:24px">
      <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://webmarketing-lyart.vercel.app"}/results/pymes/${diagnosis.id}" style="display:inline-block;background:#0B38D9;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600">Review my Diagnosis</a>
    </p>
    <p style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e5e5;font-size:12px;color:#888;text-align:center">
      Nexuma marketing ltd
    </p>
  </div>
</div>`;

    console.log(`[pymes-schedule-rescue] Sending commercial -> ${recipientForCommercial.join(", ")}`);
    console.log(`[pymes-schedule-rescue] Sending client confirmation -> ${clientEmail || "(none)"}`);

    const sends: Promise<unknown>[] = [
      resend.emails.send({
        from: FROM_EMAIL,
        to: recipientForCommercial,
        subject: `New Rescue Session Request — ${diagnosis.company_name || profile?.full_name || "Unknown"}`,
        html: commercialHtml,
      }),
    ];
    if (clientEmail) {
      sends.push(
        resend.emails.send({
          from: FROM_EMAIL,
          to: [clientEmail],
          subject: `Your Rescue Session request was received — Nexuma`,
          html: clientHtml,
        }),
      );
    }

    const results = await Promise.allSettled(sends);
    const labels = clientEmail ? ["commercial", "client"] : ["commercial"];
    let anySuccess = false;
    results.forEach((r, i) => {
      if (r.status === "fulfilled") {
        anySuccess = true;
        console.log(`[pymes-schedule-rescue] ${labels[i]} email sent`, r.value);
      } else {
        console.error(`[pymes-schedule-rescue] ${labels[i]} email failed:`, r.reason);
      }
    });

    return NextResponse.json({ success: true, emailSent: anySuccess });
  } catch (err) {
    console.error("[pymes-schedule-rescue] Unhandled error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
