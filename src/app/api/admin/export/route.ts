import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Steve 6/5 (6-2.md #29): the CSV exports were showing blank
// Owner Name / Owner Email / Owner Phone for most rows in properties,
// and Name / Plan missing entirely from payments. Root causes:
// (a) cookie-context queries on admin-only tables returned partial
//     data via RLS, and
// (b) PostgREST embedded joins (`owner:owner_id(...)`, `profiles:user_id(...)`)
//     dropped silently for some rows.
// Service-role API does the joins explicitly via Promise.all, returning
// rich rows the client converts to CSV. Same internal-role gate used
// across the admin API surface.

export const dynamic = "force-dynamic";

const INTERNAL_ROLES = ["admin", "marketing", "sales", "support"];

type Target = "users" | "properties" | "leads" | "payments";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const target = url.searchParams.get("target") as Target | null;
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  const roleFilter = url.searchParams.get("role") || "all";

  if (!target || !["users", "properties", "leads", "payments"].includes(target)) {
    return NextResponse.json({ error: "Invalid target" }, { status: 400 });
  }

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

  const fromIso = dateFrom ? `${dateFrom}T00:00:00` : null;
  const toIso = dateTo ? `${dateTo}T23:59:59` : null;

  switch (target) {
    case "users": {
      let query = supabaseAdmin
        .from("profiles")
        .select("full_name, email, role, phone, property_count, is_premium_tenant, created_at");
      if (roleFilter !== "all") query = query.eq("role", roleFilter);
      if (fromIso) query = query.gte("created_at", fromIso);
      if (toIso) query = query.lte("created_at", toIso);
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ rows: data ?? [] });
    }

    case "properties": {
      let query = supabaseAdmin
        .from("properties")
        .select(
          "id, owner_id, address, city, province, property_type, monthly_rent, bedrooms, bathrooms, is_available, service_tier, elite_tier, cfp_monthly, payback_months, created_at",
        );
      if (fromIso) query = query.gte("created_at", fromIso);
      if (toIso) query = query.lte("created_at", toIso);
      const { data: rows, error } = await query.order("created_at", { ascending: false });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const ownerIds = Array.from(
        new Set((rows ?? []).map((r) => r.owner_id as string | null).filter((v): v is string => !!v)),
      );
      let ownerMap: Record<string, { full_name: string; email: string; phone: string }> = {};
      if (ownerIds.length > 0) {
        const { data: owners } = await supabaseAdmin
          .from("profiles")
          .select("id, full_name, email, phone")
          .in("id", ownerIds);
        ownerMap = Object.fromEntries(
          (owners ?? []).map((p) => [
            p.id as string,
            {
              full_name: (p.full_name as string) || "",
              email: (p.email as string) || "",
              phone: (p.phone as string) || "",
            },
          ]),
        );
      }
      const enriched = (rows ?? []).map((r) => {
        const owner = r.owner_id ? ownerMap[r.owner_id as string] : undefined;
        return {
          ...r,
          owner_full_name: owner?.full_name || "",
          owner_email: owner?.email || "",
          owner_phone: owner?.phone || "",
        };
      });
      return NextResponse.json({ rows: enriched });
    }

    case "leads": {
      let query = supabaseAdmin
        .from("leads")
        .select("full_name, email, phone, role, source, status, notes, created_at, user_id");
      if (fromIso) query = query.gte("created_at", fromIso);
      if (toIso) query = query.lte("created_at", toIso);
      const { data: rows, error } = await query.order("created_at", { ascending: false });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const userIds = Array.from(
        new Set((rows ?? []).map((r) => r.user_id as string | null).filter((v): v is string => !!v)),
      );
      let profileRoleMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabaseAdmin
          .from("profiles")
          .select("id, role")
          .in("id", userIds);
        profileRoleMap = Object.fromEntries(
          (profiles ?? []).map((p) => [p.id as string, (p.role as string) || ""]),
        );
      }
      let enriched = (rows ?? []).map((r) => ({
        ...r,
        role: (r.role as string) || (r.user_id ? profileRoleMap[r.user_id as string] : "") || "",
      }));
      if (roleFilter !== "all") {
        enriched = enriched.filter((r) => r.role === roleFilter);
      }
      return NextResponse.json({ rows: enriched });
    }

    case "payments": {
      let query = supabaseAdmin
        .from("payments")
        .select(
          "id, user_id, service_id, pymes_plan_id, amount, currency, payment_type, status, created_at",
        );
      if (fromIso) query = query.gte("created_at", fromIso);
      if (toIso) query = query.lte("created_at", toIso);
      const { data: rows, error } = await query.order("created_at", { ascending: false });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      const userIds = Array.from(
        new Set((rows ?? []).map((r) => r.user_id as string | null).filter((v): v is string => !!v)),
      );
      const serviceIds = Array.from(
        new Set((rows ?? []).map((r) => r.service_id as string | null).filter((v): v is string => !!v)),
      );
      const planIds = Array.from(
        new Set((rows ?? []).map((r) => r.pymes_plan_id as string | null).filter((v): v is string => !!v)),
      );

      const [profilesRes, servicesRes, plansRes] = await Promise.all([
        userIds.length
          ? supabaseAdmin.from("profiles").select("id, full_name, email").in("id", userIds)
          : Promise.resolve({ data: [] as { id: string; full_name: string; email: string }[] }),
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
          { full_name: (p.full_name as string) || "", email: (p.email as string) || "" },
        ]),
      );
      const serviceMap = Object.fromEntries((servicesRes.data ?? []).map((s) => [s.id as string, s.name as string]));
      const planMap = Object.fromEntries((plansRes.data ?? []).map((p) => [p.id as string, p.name as string]));

      const enriched = (rows ?? []).map((r) => {
        const profile = r.user_id ? profileMap[r.user_id as string] : undefined;
        return {
          user_name: profile?.full_name || "Unknown",
          user_email: profile?.email || "",
          plan_or_service:
            (r.service_id && serviceMap[r.service_id as string]) ||
            (r.pymes_plan_id && planMap[r.pymes_plan_id as string]) ||
            "—",
          amount: r.amount,
          currency: r.currency,
          payment_type: r.payment_type,
          status: r.status,
          created_at: r.created_at,
        };
      });

      return NextResponse.json({ rows: enriched });
    }
  }
}
