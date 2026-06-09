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

  // Latest diagnosis + captacion per user, fetched in two bulk
  // queries then keyed by user_id in memory.
  const [{ data: diagRows }, { data: captRows }] = await Promise.all([
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

  const enriched = businesses.map((b) => {
    const diag = diagByUser[b.id as string] ?? null;
    const capt = captByUser[b.id as string] ?? null;
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
    };
  });

  return NextResponse.json({ businesses: enriched });
}
