import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Resend } from "resend";

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Nexuma Marketing <notifications@nexuma.ca>";
const COMMERCIAL_EMAIL = process.env.COMMERCIAL_AREA_EMAIL || "alexsanabria33@hotmail.com";

// Steve 4/21 #6: PYMES result email template (exact wording from MVP)
function buildEmailHtml(params: {
  userName: string;
  annualLoss: number;
  monthlyLoss: number;
  score: number;
  urgencyLevel: string;
  recommendedPlan: string;
  planPrice: string;
  dashboardUrl: string;
  scheduleUrl: string;
}): string {
  const { userName, annualLoss, monthlyLoss, score, recommendedPlan, planPrice, dashboardUrl, scheduleUrl } = params;

  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;line-height:1.6">
  <div style="background:linear-gradient(135deg,#0B38D9 0%,#0FA37F 100%);padding:32px 24px;text-align:center;border-radius:12px 12px 0 0">
    <h1 style="color:#fff;margin:0;font-size:26px">Your Sales Leak Diagnosis</h1>
    <p style="color:rgba(255,255,255,0.9);margin:8px 0 0;font-size:14px">Personalized results for ${userName}</p>
  </div>

  <div style="background:#fff;padding:32px 24px;border:1px solid #e5e5e5;border-top:none">
    <p style="font-size:20px;font-weight:700;color:#0B38D9;margin:0 0 16px">
      What would you do with those $${annualLoss.toLocaleString()} extra per year?
    </p>

    <p style="font-size:15px;margin:0 0 16px">
      The data doesn't lie: maintaining your current structure is not "free" — it's costing you
      <strong style="color:#dc2626">$${monthlyLoss.toLocaleString()} every month</strong> in lost opportunities.
    </p>

    <p style="font-size:15px;margin:0 0 16px">
      The good news is that this score is not definitive — it's a roadmap.
    </p>

    <p style="font-size:15px;margin:0 0 24px">
      We have helped businesses with scores of <strong>${score} points</strong> rise to Total Optimization level,
      recovering their revenue and — most importantly — becoming profitable.
    </p>

    <div style="background:#f8f9fa;border-left:4px solid #0FA37F;padding:16px;margin:24px 0;border-radius:4px">
      <p style="margin:0;font-size:14px;color:#666">Your recommended plan</p>
      <p style="margin:4px 0 0;font-size:20px;font-weight:700;color:#0B38D9;text-transform:capitalize">
        Plan ${recommendedPlan} — ${planPrice}
      </p>
    </div>

    <!-- BOTÓN 1: Empezar ahora -->
    <div style="text-align:center;margin:24px 0 16px">
      <a href="${dashboardUrl}" style="display:inline-block;background:#0B38D9;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:16px">
        Start Now → Get the ${recommendedPlan} Plan
      </a>
    </div>

    <p style="text-align:center;font-size:13px;color:#666;margin:16px 0 24px">
      Click here to activate your recommended plan immediately.
    </p>

    <div style="border-top:1px solid #e5e5e5;padding-top:24px;margin-top:24px">
      <p style="font-size:16px;font-weight:600;margin:0 0 12px">Your next step:</p>
      <p style="font-size:15px;margin:0 0 20px">
        Don't let the loss figure keep growing. Book a personalized
        <strong>15-minute session at no cost</strong> where we break down these numbers
        and give you the action plan to stop the leak.
      </p>

      <!-- BOTÓN 2: AGENDAR MI SESIÓN DE RESCATE -->
      <div style="text-align:center;margin:16px 0">
        <a href="${scheduleUrl}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:16px">
          SCHEDULE MY RESCUE SESSION
        </a>
      </div>
    </div>

    <div style="margin-top:32px;padding-top:24px;border-top:1px solid #e5e5e5;font-size:12px;color:#888;text-align:center">
      <p style="margin:0">Nexuma marketing ltd</p>
      <p style="margin:4px 0 0">This email was sent because you completed the Sales Leak Diagnosis.</p>
    </div>
  </div>
</div>
  `.trim();
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { diagnosis_id, monthly_revenue } = body;

    if (!diagnosis_id) {
      return NextResponse.json({ error: "diagnosis_id required" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get diagnosis data — Steve 4/24 #6: include all 7 question scores for commercial email
    const { data: diagnosis } = await supabase
      .from("pymes_diagnosis")
      .select("total_score, urgency_level, estimated_loss, recommended_plan, monthly_revenue, sector, company_name, q1_online_presence, q2_seo_positioning, q3_lead_generation, q4_lead_conversion, q5_client_retention, q6_repeat_purchases, q7_marketing_strategy")
      .eq("id", diagnosis_id)
      .eq("user_id", user.id)
      .single();

    if (!diagnosis) {
      return NextResponse.json({ error: "Diagnosis not found" }, { status: 404 });
    }

    // Get user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .single();

    // Steve 4/23: user.email (from auth) is more reliable than profile.email
    const recipientEmail = user.email || profile?.email;
    console.log(`[pymes-result-email] Sending to client: ${recipientEmail}`);
    if (!recipientEmail) {
      return NextResponse.json({ error: "No email to send to" }, { status: 400 });
    }

    if (!process.env.RESEND_API_KEY) {
      console.warn("RESEND_API_KEY not set — skipping email");
      return NextResponse.json({ success: true, skipped: true });
    }

    const planPrices: Record<string, string> = {
      rescue: "$1,500 CAD",
      growth: "$2,500 CAD",
      scale: "$3,800 CAD",
    };

    // Steve's formula: monthly_loss = monthly_revenue * 0.3
    const monthlyLoss = Math.round((Number(monthly_revenue) || 0) * 0.3);
    const annualLoss = Number(diagnosis.estimated_loss) || monthlyLoss * 12;

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://webmarketing-lyart.vercel.app";

    const html = buildEmailHtml({
      userName: profile?.full_name || "Business Owner",
      annualLoss,
      monthlyLoss,
      score: Number(diagnosis.total_score) || 0,
      urgencyLevel: diagnosis.urgency_level || "moderate",
      recommendedPlan: diagnosis.recommended_plan || "growth",
      planPrice: planPrices[diagnosis.recommended_plan] || "$2,500 CAD",
      dashboardUrl: `${baseUrl}/dashboard/services`,
      scheduleUrl: `${baseUrl}/dashboard/services#contact`,
    });

    const resend = new Resend(process.env.RESEND_API_KEY);

    // Send to user (with Steve's template)
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [recipientEmail],
      subject: `Your Sales Leak Diagnosis Results — Save $${annualLoss.toLocaleString()}/year`,
      html,
    });

    // Steve 4/24 #6: Commercial email with FULL diagnostic — 4 blocks, 7 questions, all scores
    const score = (v: unknown) => Number(v) || 0;
    const q1 = score(diagnosis.q1_online_presence);
    const q2 = score(diagnosis.q2_seo_positioning);
    const q3 = score(diagnosis.q3_lead_generation);
    const q4 = score(diagnosis.q4_lead_conversion);
    const q5 = score(diagnosis.q5_client_retention);
    const q6 = score(diagnosis.q6_repeat_purchases);
    const q7 = score(diagnosis.q7_marketing_strategy);

    const blockSales = q3 + q4;             // Block 1: Sales (Lead Gen + Conversion)
    const blockBrand = q1 + q2;             // Block 2: Brand (Online presence + SEO)
    const blockSystems = q5 + q6;           // Block 3: Systems (Retention + Repeat)
    const blockFuture = q7;                 // Block 4: Future (Marketing Strategy)

    const scoreCell = (v: number) => `<td style="padding:8px;text-align:center;background:${v <= 2 ? "#fee2e2" : v >= 4 ? "#dcfce7" : "#fef3c7"};font-weight:600">${v}/5</td>`;

    const commercialHtml = `
<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:680px;margin:0 auto">
  <h2 style="color:#0B38D9">New Sales Leak Diagnosis Completed</h2>
  <p>A PYMES client has just completed the Sales Leak Diagnosis. Full diagnostic breakdown below.</p>

  <!-- Contact + Summary -->
  <table style="border-collapse:collapse;width:100%;margin:20px 0;border:1px solid #e5e5e5">
    <tr><td style="padding:10px;font-weight:bold;background:#f5f5f5;width:40%">Name</td><td style="padding:10px">${profile?.full_name || "N/A"}</td></tr>
    <tr><td style="padding:10px;font-weight:bold;background:#f5f5f5">Email</td><td style="padding:10px"><a href="mailto:${recipientEmail}">${recipientEmail}</a></td></tr>
    <tr><td style="padding:10px;font-weight:bold;background:#f5f5f5">Company</td><td style="padding:10px">${diagnosis.company_name || "N/A"}</td></tr>
    <tr><td style="padding:10px;font-weight:bold;background:#f5f5f5">Sector</td><td style="padding:10px">${diagnosis.sector || "N/A"}</td></tr>
    <tr><td style="padding:10px;font-weight:bold;background:#f5f5f5">Monthly Revenue</td><td style="padding:10px">$${Number(diagnosis.monthly_revenue || 0).toLocaleString()} CAD</td></tr>
    <tr><td style="padding:10px;font-weight:bold;background:#f5f5f5">Diagnostic Score</td><td style="padding:10px"><strong>${diagnosis.total_score}/35</strong> — Urgency: <strong>${diagnosis.urgency_level}</strong></td></tr>
    <tr><td style="padding:10px;font-weight:bold;background:#f5f5f5">Estimated Annual Loss</td><td style="padding:10px;color:#dc2626;font-weight:600">$${annualLoss.toLocaleString()} CAD</td></tr>
    <tr><td style="padding:10px;font-weight:bold;background:#f5f5f5">Recommended Plan</td><td style="padding:10px;text-transform:capitalize">Plan ${diagnosis.recommended_plan}</td></tr>
  </table>

  <!-- Per-block breakdown (Steve 4/24 #6: full MVP-aligned scores) -->
  <h3 style="color:#0B38D9;margin-top:32px;margin-bottom:8px">Per-Question Scores</h3>
  <p style="font-size:13px;color:#666;margin:0 0 12px">Scale 1-5 (1: Bad/No • 5: Excellent/Yes). Color: red &lt;= 2, yellow = 3, green &gt;= 4</p>

  <table style="border-collapse:collapse;width:100%;border:1px solid #e5e5e5;margin-bottom:12px">
    <thead>
      <tr style="background:#0B38D9;color:#fff">
        <th style="padding:10px;text-align:left">Block</th>
        <th style="padding:10px;text-align:left">Question</th>
        <th style="padding:10px;text-align:center;width:80px">Score</th>
      </tr>
    </thead>
    <tbody>
      <tr><td rowspan="2" style="padding:10px;background:#fef3c7;font-weight:600;vertical-align:top">BLOCK 1<br>SALES</td>
          <td style="padding:8px">Is your new-client flow constant and predictable month to month?</td>
          ${scoreCell(q3)}</tr>
      <tr><td style="padding:8px">Do you have an automatic system to follow up with prospects?</td>
          ${scoreCell(q4)}</tr>

      <tr><td rowspan="2" style="padding:10px;background:#fef3c7;font-weight:600;vertical-align:top;border-top:2px solid #e5e5e5">BLOCK 2<br>BRAND</td>
          <td style="padding:8px;border-top:2px solid #e5e5e5">Is your value proposition so clear a child would understand it in 10 seconds?</td>
          ${scoreCell(q1)}</tr>
      <tr><td style="padding:8px">Does your visual identity look more professional than your direct competition?</td>
          ${scoreCell(q2)}</tr>

      <tr><td rowspan="2" style="padding:10px;background:#fef3c7;font-weight:600;vertical-align:top;border-top:2px solid #e5e5e5">BLOCK 3<br>SYSTEMS</td>
          <td style="padding:8px;border-top:2px solid #e5e5e5">Can your business operate for a week without you intervening operationally?</td>
          ${scoreCell(q5)}</tr>
      <tr><td style="padding:8px">Do you measure the exact cost of acquiring each new client?</td>
          ${scoreCell(q6)}</tr>

      <tr><td style="padding:10px;background:#fef3c7;font-weight:600;vertical-align:top;border-top:2px solid #e5e5e5">BLOCK 4<br>FUTURE</td>
          <td style="padding:8px;border-top:2px solid #e5e5e5">COST OF INACTION — How serious would it be to keep going the same in 12 months?</td>
          ${scoreCell(q7)}</tr>
    </tbody>
  </table>

  <h3 style="color:#0B38D9;margin-top:24px;margin-bottom:8px">Block Subtotals</h3>
  <table style="border-collapse:collapse;width:100%;border:1px solid #e5e5e5">
    <tr style="background:#f5f5f5"><td style="padding:10px;font-weight:600">Sales (Q3+Q4)</td><td style="padding:10px;text-align:right;font-weight:600">${blockSales}/10</td></tr>
    <tr><td style="padding:10px;font-weight:600">Brand (Q1+Q2)</td><td style="padding:10px;text-align:right;font-weight:600">${blockBrand}/10</td></tr>
    <tr style="background:#f5f5f5"><td style="padding:10px;font-weight:600">Systems (Q5+Q6)</td><td style="padding:10px;text-align:right;font-weight:600">${blockSystems}/10</td></tr>
    <tr><td style="padding:10px;font-weight:600">Future (Q7)</td><td style="padding:10px;text-align:right;font-weight:600">${blockFuture}/5</td></tr>
  </table>

  <p style="color:#666;font-size:12px;margin-top:24px">Contact this lead within 24 hours to offer a rescue session.</p>
</div>`;

    await resend.emails.send({
      from: FROM_EMAIL,
      to: COMMERCIAL_EMAIL.split(",").map((s) => s.trim()).filter(Boolean),
      subject: `New PYMES Lead — ${profile?.full_name || "Unknown"} (Score ${diagnosis.total_score}/35)`,
      html: commercialHtml,
    }).catch((err) => console.error("PYMES commercial email failed:", err));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("PYMES result email error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
