import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Steve 5/22 Milestone 4: admin payments list kept showing "Unknown"
// for every row because the PostgREST embed
//   profiles:user_id(full_name, email)
// silently returns null when RLS or FK introspection doesn't resolve
// cleanly across schemas. Same fix we used for /admin/consent-logs:
// authenticate the caller (admin only), then do a service-role
// manual two-query join.

export const dynamic = "force-dynamic";

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
  // Steve 6/5 (6-2.md #28): widened from admin-only to all internal
  // roles so sales / marketing can read payments (sales needs the
  // history for client follow-up; marketing wants promo redemption
  // numbers). Refund and cancel-subscription endpoints stay admin-only.
  const INTERNAL_ROLES = ["admin", "marketing", "sales", "support"];
  if (!callerProfile?.role || !INTERNAL_ROLES.includes(callerProfile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: paymentRows, error: payErr } = await supabaseAdmin
    .from("payments")
    .select(
      "id, user_id, service_id, pymes_plan_id, amount, currency, payment_type, installment_number, status, created_at, stripe_payment_intent_id, stripe_subscription_id",
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (payErr) {
    return NextResponse.json(
      { error: `payments fetch failed: ${payErr.message}` },
      { status: 500 },
    );
  }
  const rows = paymentRows ?? [];

  const userIds = Array.from(
    new Set(rows.map((r) => r.user_id as string | null).filter((v): v is string => !!v)),
  );
  const serviceIds = Array.from(
    new Set(rows.map((r) => r.service_id as string | null).filter((v): v is string => !!v)),
  );
  const planIds = Array.from(
    new Set(rows.map((r) => r.pymes_plan_id as string | null).filter((v): v is string => !!v)),
  );

  const [profilesRes, servicesRes, plansRes] = await Promise.all([
    userIds.length
      ? supabaseAdmin.from("profiles").select("id, full_name, email").in("id", userIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string | null }[] }),
    serviceIds.length
      ? supabaseAdmin.from("services").select("id, name").in("id", serviceIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    planIds.length
      ? supabaseAdmin.from("pymes_plans").select("id, name").in("id", planIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const profileMap = Object.fromEntries(
    (profilesRes.data ?? []).map((p) => [
      p.id as string,
      { full_name: (p.full_name as string | null) ?? null, email: (p.email as string | null) ?? null },
    ]),
  );
  const serviceMap = Object.fromEntries(
    (servicesRes.data ?? []).map((s) => [s.id as string, s.name as string]),
  );
  const planMap = Object.fromEntries(
    (plansRes.data ?? []).map((p) => [p.id as string, p.name as string]),
  );

  const payments = rows.map((p) => {
    const prof = p.user_id ? profileMap[p.user_id as string] : undefined;
    return {
      id: p.id as string,
      user_name: prof?.full_name || "Unknown",
      user_email: prof?.email || "",
      service_name:
        (p.service_id && serviceMap[p.service_id as string]) ||
        (p.pymes_plan_id && planMap[p.pymes_plan_id as string]) ||
        "—",
      amount: Number(p.amount) || 0,
      currency: (p.currency as string) || "CAD",
      payment_type: (p.payment_type as string | null) ?? null,
      installment_number: (p.installment_number as number | null) ?? null,
      status: p.status as string,
      created_at: p.created_at as string,
      stripe_payment_intent_id: (p.stripe_payment_intent_id as string | null) ?? null,
      stripe_subscription_id: (p.stripe_subscription_id as string | null) ?? null,
    };
  });

  const { data: promoStats, error: promoErr } = await supabaseAdmin
    .from("promotions")
    .select(
      "code, used_count, max_uses, is_active, valid_until, discount_type, discount_value",
    )
    .order("used_count", { ascending: false });
  if (promoErr) {
    return NextResponse.json(
      { error: `promotions fetch failed: ${promoErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ payments, promoStats: promoStats ?? [] });
}
