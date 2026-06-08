import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Steve 6/5 (6-2.md #25): /admin/reassign "Pick a client" panel
// showed "0 clients" and "No clients match" for every search. Same
// family of bug as /admin/payments and /admin/properties — the
// cookie-context client's read on `profiles` returns 0 rows because
// of a policy quirk on the recursive admin SELECT. Service-role API
// pattern fixes it. Same authorization check used elsewhere.
//
// Steve 6/9 (6-2.md #37): extended to cover the recommendations
// CRUD too. Alex reported "Reasignar servicios a clientes no está
// funcionando no hace nada, antes funcionaba." The page's Add /
// Swap / Remove buttons all wrote directly to service_recommendations
// via the cookie-context client; RLS silently blocked the writes so
// nothing visible happened. Now:
//   - GET           → users + services lists (legacy behaviour)
//   - GET ?userId=  → recommendations for that user (with service detail)
//   - POST          → add a new recommendation
//   - PUT           → swap a recommendation's service_id
//   - DELETE ?id=   → remove a recommendation

export const dynamic = "force-dynamic";

const INTERNAL_ROLES = ["admin", "marketing", "sales", "support"];
const CUSTOMER_ROLES = [
  "propietario",
  "propietario_preferido",
  "inversionista",
  "inquilino",
  "inquilino_premium",
  "pymes",
];

async function requireInternal() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in", status: 401 };
  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!callerProfile?.role || !INTERNAL_ROLES.includes(callerProfile.role)) {
    return { error: "Forbidden", status: 403 };
  }
  return { ok: true as const };
}

export async function GET(request: Request) {
  const auth = await requireInternal();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");

  // Steve 6/9: when a userId is passed, return that user's
  // recommendations with the referenced service's display fields.
  // PostgREST embedded joins via service-role normally work, but we
  // do a manual two-step join to stay consistent with #29 / #31 etc.
  if (userId) {
    const { data: recs, error } = await supabaseAdmin
      .from("service_recommendations")
      .select("id, user_id, service_id, reason, is_purchased, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) {
      return NextResponse.json(
        { error: `recommendations fetch failed: ${error.message}` },
        { status: 500 },
      );
    }
    const serviceIds = Array.from(
      new Set((recs ?? []).map((r) => r.service_id as string | null).filter((v): v is string => !!v)),
    );
    let serviceMap: Record<string, { id: string; name: string; category: string; price: number; currency: string }> = {};
    if (serviceIds.length > 0) {
      const { data: svcs } = await supabaseAdmin
        .from("services")
        .select("id, name, category, price, currency")
        .in("id", serviceIds);
      serviceMap = Object.fromEntries(
        (svcs ?? []).map((s) => [
          s.id as string,
          {
            id: s.id as string,
            name: (s.name as string) || "",
            category: (s.category as string) || "",
            price: Number(s.price ?? 0),
            currency: (s.currency as string) || "CAD",
          },
        ]),
      );
    }
    const enriched = (recs ?? []).map((r) => ({
      ...r,
      services: r.service_id ? serviceMap[r.service_id as string] ?? null : null,
    }));
    return NextResponse.json({ recommendations: enriched });
  }

  const [usersRes, servicesRes] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, role")
      .in("role", CUSTOMER_ROLES)
      .order("full_name"),
    supabaseAdmin
      .from("services")
      .select("id, name, category, price, currency, status")
      .or("status.is.null,status.neq.archived")
      .order("category")
      .order("name"),
  ]);

  if (usersRes.error) {
    return NextResponse.json(
      { error: `profiles fetch failed: ${usersRes.error.message}` },
      { status: 500 },
    );
  }
  if (servicesRes.error) {
    return NextResponse.json(
      { error: `services fetch failed: ${servicesRes.error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    users: usersRes.data ?? [],
    services: servicesRes.data ?? [],
  });
}

export async function POST(request: Request) {
  const auth = await requireInternal();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = await request.json().catch(() => ({}));
  const { user_id, service_id, reason } = body as {
    user_id?: string;
    service_id?: string;
    reason?: string | null;
  };
  if (!user_id || !service_id) {
    return NextResponse.json({ error: "user_id and service_id required" }, { status: 400 });
  }
  const { error } = await supabaseAdmin.from("service_recommendations").insert({
    user_id,
    service_id,
    reason: reason || "Manually assigned by admin",
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

export async function PUT(request: Request) {
  const auth = await requireInternal();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = await request.json().catch(() => ({}));
  const { id, service_id, reason } = body as {
    id?: string;
    service_id?: string;
    reason?: string;
  };
  if (!id || !service_id) {
    return NextResponse.json({ error: "id and service_id required" }, { status: 400 });
  }
  const { error } = await supabaseAdmin
    .from("service_recommendations")
    .update({ service_id, reason: reason || "Reassigned by admin" })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const auth = await requireInternal();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const { error } = await supabaseAdmin.from("service_recommendations").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
