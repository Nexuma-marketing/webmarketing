import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Steve 6/5 (6-2.md #23): Property Management at /admin/properties was
// showing "Unknown" for every Owner column because the PostgREST embed
// `profiles:owner_id(full_name)` silently returned null — same family
// of bug as the original payments-page "Unknown user" issue we already
// solved with /api/admin/payments. Pattern reused here: authenticate
// caller server-side, use service-role + manual join.

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

  const { data: propertyRows, error: propErr } = await supabaseAdmin
    .from("properties")
    .select(
      "id, owner_id, address, city, monthly_rent, is_available, service_tier, elite_tier, bedrooms, bathrooms, area_sqft, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (propErr) {
    return NextResponse.json(
      { error: `properties fetch failed: ${propErr.message}` },
      { status: 500 },
    );
  }
  const rows = propertyRows ?? [];

  const ownerIds = Array.from(
    new Set(rows.map((r) => r.owner_id as string | null).filter((v): v is string => !!v)),
  );

  let ownerMap: Record<string, { full_name: string | null; email: string | null; phone: string | null }> = {};
  if (ownerIds.length > 0) {
    const { data: ownersData, error: ownersErr } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, phone")
      .in("id", ownerIds);
    if (ownersErr) {
      return NextResponse.json(
        { error: `profiles fetch failed: ${ownersErr.message}` },
        { status: 500 },
      );
    }
    ownerMap = Object.fromEntries(
      (ownersData ?? []).map((p) => [
        p.id as string,
        {
          full_name: (p.full_name as string | null) ?? null,
          email: (p.email as string | null) ?? null,
          phone: (p.phone as string | null) ?? null,
        },
      ]),
    );
  }

  const properties = rows.map((p) => {
    const owner = p.owner_id ? ownerMap[p.owner_id as string] : undefined;
    return {
      id: p.id as string,
      address: (p.address as string) || "",
      city: (p.city as string) || "",
      monthly_rent: (p.monthly_rent as number | null) ?? null,
      is_available: (p.is_available as boolean) ?? false,
      service_tier: (p.service_tier as string | null) ?? null,
      elite_tier: (p.elite_tier as string | null) ?? null,
      bedrooms: (p.bedrooms as number | null) ?? null,
      bathrooms: (p.bathrooms as number | null) ?? null,
      area_sqft: (p.area_sqft as number | null) ?? null,
      created_at: p.created_at as string,
      owner_name: owner?.full_name || "Unknown",
      owner_email: owner?.email || "",
      owner_phone: owner?.phone || "",
    };
  });

  return NextResponse.json({ properties });
}
