import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Steve 6/5 (6-2.md #28): /admin/reports (Sales Report page) was
// returning CA$0 / 0 transactions when a sales user opened it, even
// though admin saw real revenue. Three of the four tables it queries
// (payments, promotions) had admin-only RLS, so the cookie-context
// SELECT from sales returned zero rows. Service-role API returns the
// same numbers regardless of role, gated by an internal-role check
// here.

export const dynamic = "force-dynamic";

const INTERNAL_ROLES = ["admin", "marketing", "sales", "support"];

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
  if (!callerProfile?.role || !INTERNAL_ROLES.includes(callerProfile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [paymentsRes, servicesRes, promosRes, leadsRes] = await Promise.all([
    supabaseAdmin
      .from("payments")
      .select(
        "id, user_id, service_id, pymes_plan_id, amount, currency, payment_type, status, created_at",
      )
      .order("created_at", { ascending: false }),
    supabaseAdmin.from("services").select("id, name"),
    supabaseAdmin
      .from("promotions")
      .select(
        "id, code, discount_type, discount_value, used_count, max_uses, is_active, valid_until",
      )
      .order("used_count", { ascending: false }),
    supabaseAdmin
      .from("leads")
      .select("id, status, created_at")
      .order("created_at", { ascending: false })
      .limit(2000),
  ]);

  return NextResponse.json({
    payments: paymentsRes.data ?? [],
    services: servicesRes.data ?? [],
    promos: promosRes.data ?? [],
    leads: leadsRes.data ?? [],
  });
}
