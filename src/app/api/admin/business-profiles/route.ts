import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Steve 6/9 (6-2.md #40): Alex 2026-06-07 docx Item 5 — "Donde ve la
// informacion de empresas?" Annotation on screenshot 3 (Prueba ventas
// sales sidebar). Sales has no way to read what business owners
// (PYMES) filled out in their two assessment forms:
//   - pymes_diagnosis (Sales Leak Calculator)
//   - pymes_captacion (Client Acquisition form)
// Their contact info lives in profiles. This route consolidates all
// three into one per-business payload sales can use to prepare a
// call.

export const dynamic = "force-dynamic";

const READ_ROLES = ["admin", "marketing", "sales", "support"];

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!callerProfile?.role || !READ_ROLES.includes(callerProfile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: businesses, error: bizErr } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email, phone, role, created_at")
    .eq("role", "pymes")
    .order("created_at", { ascending: false });
  if (bizErr) {
    return NextResponse.json(
      { error: `pymes fetch failed: ${bizErr.message}` },
      { status: 500 },
    );
  }
  if (!businesses || businesses.length === 0) {
    return NextResponse.json({ businesses: [] });
  }

  const ids = businesses.map((b) => b.id as string);

  // Latest diagnosis + captacion per user, fetched in bulk
  // queries then keyed by user_id in memory. Also fetch the
  // recommended PYMES plans (from service_recommendations) and
  // completed plan purchases (from payments) so the UI can show
  // "what plan does this business have" — Alex docx Item 5
  // sub-issue 14.
  const [
    { data: diagRows },
    { data: captRows },
    { data: recRows },
    { data: payRows },
    { data: planRows },
  ] = await Promise.all([
    supabaseAdmin
      .from("pymes_diagnosis")
      .select(
        "user_id, company_name, sector, employee_count, monthly_revenue, has_website, has_social_media, social_media_platforms, current_marketing_channels, marketing_budget, main_challenge, business_goals, urgency_level, urgency_score, recommendation_message, created_at",
      )
      .in("user_id", ids)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("pymes_captacion")
      .select(
        "user_id, business_name, industry, years_in_business, business_goals, target_age_range, target_location, target_income, ideal_customer_description, current_channels, monthly_marketing_budget, biggest_challenge, created_at",
      )
      .in("user_id", ids)
      .order("created_at", { ascending: false }),
    // Steve 6/10 (6-2.md #46): recommendations point at either a
    // services row (legacy plans) or a pymes_plans row; both ids
    // are valid foreign keys. We pull both columns and resolve
    // names below.
    supabaseAdmin
      .from("service_recommendations")
      .select("user_id, service_id, reason, is_purchased, created_at")
      .in("user_id", ids)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("payments")
      .select("user_id, amount, currency, status, service_id, pymes_plan_id, created_at")
      .in("user_id", ids)
      .eq("status", "completed"),
    // Pull all active PYMES plans once so we can resolve names
    // for both recommendations and payments without an extra
    // round-trip per business.
    supabaseAdmin
      .from("pymes_plans")
      .select("id, plan_type, name, price, features")
      .eq("is_active", true),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const diagByUser: Record<string, any> = {};
  for (const row of diagRows ?? []) {
    const uid = row.user_id as string;
    if (!diagByUser[uid]) diagByUser[uid] = row;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const captByUser: Record<string, any> = {};
  for (const row of captRows ?? []) {
    const uid = row.user_id as string;
    if (!captByUser[uid]) captByUser[uid] = row;
  }

  // Index PYMES plans by id so we can resolve recommendation +
  // payment service_id references to a human-readable plan name.
  const pymesPlanById = Object.fromEntries(
    (planRows ?? []).map((p) => [
      p.id as string,
      {
        id: p.id as string,
        plan_type: (p.plan_type as string) || "",
        name: (p.name as string) || "",
        price: Number(p.price ?? 0),
        features: (p.features as string[]) ?? [],
      },
    ]),
  );

  // Also pull any legacy services rows referenced by either
  // recommendations or payments so we can name "Plan: PYMES —
  // Growth" etc. consistently.
  const serviceIds = Array.from(
    new Set(
      [
        ...((recRows ?? []).map((r) => r.service_id as string | null)),
        ...((payRows ?? []).map((r) => r.service_id as string | null)),
      ].filter((v): v is string => !!v),
    ),
  );
  let serviceById: Record<string, { id: string; name: string; price: number }> = {};
  if (serviceIds.length > 0) {
    const { data: svcRows } = await supabaseAdmin
      .from("services")
      .select("id, name, price")
      .in("id", serviceIds);
    serviceById = Object.fromEntries(
      (svcRows ?? []).map((s) => [
        s.id as string,
        {
          id: s.id as string,
          name: (s.name as string) || "",
          price: Number(s.price ?? 0),
        },
      ]),
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recsByUser: Record<string, any[]> = {};
  for (const row of recRows ?? []) {
    const uid = row.user_id as string;
    if (!recsByUser[uid]) recsByUser[uid] = [];
    const svcId = row.service_id as string | null;
    const svc = svcId ? serviceById[svcId] : null;
    recsByUser[uid].push({
      reason: row.reason,
      is_purchased: row.is_purchased,
      created_at: row.created_at,
      service_id: svcId,
      service_name: svc?.name || null,
      service_price: svc?.price ?? null,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paysByUser: Record<string, any[]> = {};
  for (const row of payRows ?? []) {
    const uid = row.user_id as string;
    if (!paysByUser[uid]) paysByUser[uid] = [];
    const svcId = row.service_id as string | null;
    const planId = row.pymes_plan_id as string | null;
    const svc = svcId ? serviceById[svcId] : null;
    const plan = planId ? pymesPlanById[planId] : null;
    paysByUser[uid].push({
      amount: Number(row.amount ?? 0),
      currency: row.currency,
      status: row.status,
      created_at: row.created_at,
      plan_name: svc?.name || plan?.name || null,
      plan_type: plan?.plan_type || null,
    });
  }

  const enriched = businesses.map((b) => {
    const diag = diagByUser[b.id as string] ?? null;
    const capt = captByUser[b.id as string] ?? null;
    const recommendations = recsByUser[b.id as string] ?? [];
    const purchases = paysByUser[b.id as string] ?? [];
    return {
      id: b.id,
      full_name: b.full_name,
      email: b.email,
      phone: b.phone,
      created_at: b.created_at,
      has_diagnosis: !!diag,
      has_captacion: !!capt,
      diagnosis: diag,
      captacion: capt,
      recommendations,
      purchases,
    };
  });

  return NextResponse.json({ businesses: enriched });
}
