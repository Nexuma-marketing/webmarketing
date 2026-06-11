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
// Steve 6/10 (6-2.md #45): toggle availability is a sales-flow
// action — the commercial team knows which properties have signed
// contracts (so they should be unavailable) and which are back on
// the market. Admin + marketing + sales can flip the switch;
// support stays read-only.
const PROPERTY_WRITE_ROLES = ["admin", "marketing", "sales"];

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

  // Steve 6/9 (6-2.md #41): widened SELECT to every customer-facing
  // column so the new property-detail modal on /admin/properties can
  // show "toda la informacion" Alex asked for in 2026-06-07 docx
  // Item 5 sub-issue 6.
  const { data: propertyRows, error: propErr } = await supabaseAdmin
    .from("properties")
    .select(
      "id, owner_id, title, description, address, city, province, postal_code, country, property_type, monthly_rent, is_available, service_tier, elite_tier, bedrooms, bathrooms, area_sqft, amenities, common_areas, pet_friendly, smart_home, dishwasher, occupancy_status, vacancy_date, availability_date, cfp_monthly, payback_months, balance_invoice_id, balance_invoice_status, balance_invoice_amount, balance_invoice_sent_at, balance_invoice_paid_at, created_at",
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

  // Steve 6/9 (6-2.md #41): pull photo counts per property in one
  // bulk query so the table can show "N photos" badges without an
  // N+1 query per row.
  const propertyIds = rows.map((r) => r.id as string);
  let photoCountByProp: Record<string, { total: number; pending: number; approved: number; rejected: number }> = {};
  if (propertyIds.length > 0) {
    const { data: photoRows } = await supabaseAdmin
      .from("property_images")
      .select("property_id, status")
      .in("property_id", propertyIds);
    photoCountByProp = (photoRows ?? []).reduce<typeof photoCountByProp>((acc, r) => {
      const pid = r.property_id as string;
      const status = (r.status as string) || "pending";
      if (!acc[pid]) acc[pid] = { total: 0, pending: 0, approved: 0, rejected: 0 };
      acc[pid].total++;
      if (status === "pending") acc[pid].pending++;
      else if (status === "approved") acc[pid].approved++;
      else if (status === "rejected") acc[pid].rejected++;
      return acc;
    }, {});
  }

  const properties = rows.map((p) => {
    const owner = p.owner_id ? ownerMap[p.owner_id as string] : undefined;
    const photos = photoCountByProp[p.id as string] ?? { total: 0, pending: 0, approved: 0, rejected: 0 };
    return {
      id: p.id as string,
      title: (p.title as string) || "",
      description: (p.description as string) || "",
      address: (p.address as string) || "",
      city: (p.city as string) || "",
      province: (p.province as string) || "",
      postal_code: (p.postal_code as string) || "",
      country: (p.country as string) || "",
      property_type: (p.property_type as string) || "",
      monthly_rent: (p.monthly_rent as number | null) ?? null,
      is_available: (p.is_available as boolean) ?? false,
      service_tier: (p.service_tier as string | null) ?? null,
      elite_tier: (p.elite_tier as string | null) ?? null,
      bedrooms: (p.bedrooms as number | null) ?? null,
      bathrooms: (p.bathrooms as number | null) ?? null,
      area_sqft: (p.area_sqft as number | null) ?? null,
      amenities: (p.amenities as string[] | null) ?? [],
      common_areas: (p.common_areas as string[] | null) ?? [],
      pet_friendly: (p.pet_friendly as boolean | null) ?? null,
      smart_home: (p.smart_home as boolean | null) ?? null,
      dishwasher: (p.dishwasher as boolean | null) ?? null,
      occupancy_status: (p.occupancy_status as string | null) ?? null,
      vacancy_date: (p.vacancy_date as string | null) ?? null,
      availability_date: (p.availability_date as string | null) ?? null,
      cfp_monthly: (p.cfp_monthly as number | null) ?? null,
      payback_months: (p.payback_months as number | null) ?? null,
      balance_invoice_id: (p.balance_invoice_id as string | null) ?? null,
      balance_invoice_status: (p.balance_invoice_status as string | null) ?? null,
      balance_invoice_amount: (p.balance_invoice_amount as number | null) ?? null,
      balance_invoice_sent_at: (p.balance_invoice_sent_at as string | null) ?? null,
      balance_invoice_paid_at: (p.balance_invoice_paid_at as string | null) ?? null,
      created_at: p.created_at as string,
      owner_name: owner?.full_name || "Unknown",
      owner_email: owner?.email || "",
      owner_phone: owner?.phone || "",
      photo_count: photos.total,
      photo_pending: photos.pending,
      photo_approved: photos.approved,
      photo_rejected: photos.rejected,
    };
  });

  return NextResponse.json({ properties });
}

// Steve 6/10 (6-2.md #45): the Available toggle on /admin/properties
// used to call supabase.from("properties").update() from the cookie-
// context client. RLS allowed admin but silently dropped the write
// for sales / marketing, so the switch visually flipped, the page
// refetched, and the value snapped back — Alex's "no sirve, no
// deja cambiar al comercial" complaint. PATCH endpoint with a
// proper role gate fixes it.
export async function PATCH(request: Request) {
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
  if (!callerProfile?.role || !PROPERTY_WRITE_ROLES.includes(callerProfile.role)) {
    return NextResponse.json(
      { error: "Forbidden — your role can only read properties" },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const { id, is_available } = body as { id?: string; is_available?: boolean };
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  if (typeof is_available !== "boolean") {
    return NextResponse.json(
      { error: "is_available (boolean) required" },
      { status: 400 },
    );
  }
  const { error } = await supabaseAdmin
    .from("properties")
    .update({ is_available })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Steve 6/11 (6-2.md #53): toggling Available -> false is Alex's
  // signal that the tenant signed the lease. Trigger the residential
  // % balance invoice flow on a best-effort basis — failure here
  // doesn't roll back the toggle, but the response carries the
  // invoice result so Sales sees what happened.
  let balanceInvoice: unknown = null;
  if (is_available === false) {
    try {
      const url = new URL(request.url);
      const invoiceRes = await fetch(
        `${url.protocol}//${url.host}/api/admin/properties/${id}/balance-invoice`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // Forward the caller's cookies so the auth gate on the
            // child route resolves to the same Sales / admin user.
            cookie: request.headers.get("cookie") || "",
          },
        },
      );
      const body = await invoiceRes.json().catch(() => null);
      balanceInvoice = body;
    } catch (err) {
      console.error("balance invoice trigger failed:", err);
      balanceInvoice = { error: err instanceof Error ? err.message : "unknown" };
    }
  }

  return NextResponse.json({ success: true, balance_invoice: balanceInvoice });
}
