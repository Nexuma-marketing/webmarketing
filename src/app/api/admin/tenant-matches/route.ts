import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Steve 6/9 (6-2.md #38): Alex annotated screenshot 2 of the 2026-06-07
// docx — "Donde ve si un inquilino tuvo match o no, con una propiedad?"
// As sales role she had no way to see which tenants had matched which
// properties; the existing /admin/matching page only edits the RULES,
// not the live matches. She needs a per-tenant view: tenant name +
// email + premium-yes/no + list of matched property addresses (or
// "no matches yet").
//
// This route returns all tenants in the system with a precomputed
// list of matched properties using the same logic as
// matchPropertiesForTenant() in profiling.ts but executed via the
// service-role client so sales / marketing / support can read it.
// Match scoring is intentionally not reproduced — sales just needs
// to know "did this tenant get any match, and which ones."

export const dynamic = "force-dynamic";

const READ_ROLES = ["admin", "marketing", "sales", "support"];
const TENANT_ROLES = ["inquilino", "inquilino_premium"];

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

  // 1. Pull every tenant profile
  const { data: tenants, error: tenantsErr } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email, role, phone, created_at")
    .in("role", TENANT_ROLES)
    .order("created_at", { ascending: false });
  if (tenantsErr) {
    return NextResponse.json(
      { error: `tenants fetch failed: ${tenantsErr.message}` },
      { status: 500 },
    );
  }
  if (!tenants || tenants.length === 0) {
    return NextResponse.json({ tenants: [] });
  }

  // 2. Pull each tenant's latest preferences in one IN() query
  const tenantIds = tenants.map((t) => t.id as string);
  const { data: prefsRows } = await supabaseAdmin
    .from("tenant_preferences")
    .select("user_id, max_budget, min_budget, bedrooms_needed, preferred_amenities, is_premium, created_at, target_zones")
    .in("user_id", tenantIds)
    .order("created_at", { ascending: false });
  const prefsByTenant: Record<string, typeof prefsRows extends (infer U)[] | null ? U : never> = {};
  for (const row of prefsRows ?? []) {
    const uid = row.user_id as string;
    if (!prefsByTenant[uid]) prefsByTenant[uid] = row;
  }

  // 3. Pull every available property once, then filter per-tenant in JS.
  //    Faster than running a separate filter query per tenant for a
  //    small commercial team's data set.
  const { data: availableProps } = await supabaseAdmin
    .from("properties")
    .select("id, address, city, province, monthly_rent, bedrooms, bathrooms, owner_id, is_available")
    .eq("is_available", true);
  const properties = availableProps ?? [];

  // 4. For each tenant, return a flat list of matched property summaries
  const results = tenants.map((t) => {
    const prefs = prefsByTenant[t.id as string];
    const matches: { id: string; address: string; city: string; province: string; monthly_rent: number; bedrooms: number }[] = [];
    if (prefs) {
      const maxBudget = prefs.max_budget ? Number(prefs.max_budget) : null;
      const rawMin = prefs.min_budget ? Number(prefs.min_budget) : null;
      const minBudget = rawMin ?? (maxBudget ? Math.floor(maxBudget * 0.6) : null);
      const bedrooms = prefs.bedrooms_needed ? Number(prefs.bedrooms_needed) : null;
      for (const p of properties) {
        const rent = Number(p.monthly_rent ?? 0);
        if (maxBudget && rent > maxBudget) continue;
        if (minBudget && rent < minBudget) continue;
        if (bedrooms && Number(p.bedrooms ?? 0) < bedrooms) continue;
        matches.push({
          id: p.id as string,
          address: (p.address as string) || "",
          city: (p.city as string) || "",
          province: (p.province as string) || "",
          monthly_rent: rent,
          bedrooms: Number(p.bedrooms ?? 0),
        });
      }
    }
    return {
      id: t.id,
      full_name: t.full_name,
      email: t.email,
      role: t.role,
      phone: t.phone,
      created_at: t.created_at,
      has_preferences: !!prefs,
      is_premium: prefs?.is_premium ?? false,
      max_budget: prefs?.max_budget ?? null,
      bedrooms_needed: prefs?.bedrooms_needed ?? null,
      matches,
    };
  });

  return NextResponse.json({ tenants: results });
}
