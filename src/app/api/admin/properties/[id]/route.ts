import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getPropertyPlanName, isPremierTierPlan } from "@/lib/balance-invoice";

export const dynamic = "force-dynamic";

const INTERNAL_ROLES = ["admin", "marketing", "sales", "support"];

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: callerProfile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!callerProfile?.role || !INTERNAL_ROLES.includes(callerProfile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: property, error: propertyError } = await supabaseAdmin
    .from("properties")
    .select("id, owner_id, title, description, address, city, province, postal_code, country, property_type, monthly_rent, is_available, service_tier, elite_tier, bedrooms, bathrooms, area_sqft, amenities, common_areas, pet_friendly, smart_home, dishwasher, occupancy_status, availability_date, near_parks, near_churches, near_skytrain, skytrain_lines, near_bus, near_mall, social_life, nearby_supermarkets, tenant_lease_signed_at, balance_invoice_url, balance_invoice_status")
    .eq("id", id)
    .single();
  if (propertyError || !property) {
    return NextResponse.json({ error: propertyError?.message || "Property not found" }, { status: propertyError?.code === "PGRST116" ? 404 : 500 });
  }

  // The purchased plan is not a column on `properties` (service_tier is
  // only the property-count bucket) — it is the most recent completed
  // plan payment scoped to the property. Drives the modal's Premier-only
  // "Reschedule installments" action.
  const [ownerResult, photosResult, purchasedPlanName, installmentsResult] = await Promise.all([
    property.owner_id
      ? supabaseAdmin.from("profiles").select("full_name, email, phone").eq("id", property.owner_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabaseAdmin.from("property_images").select("id, image_url, room_category, status, uploaded_at").eq("property_id", id).order("uploaded_at", { ascending: false }),
    getPropertyPlanName(id),
    supabaseAdmin.from("plan_installments").select("sequence, due_date, percentage, amount_cents, status").eq("property_id", id).order("sequence", { ascending: true }),
  ]);
  if (ownerResult.error) return NextResponse.json({ error: `owner fetch failed: ${ownerResult.error.message}` }, { status: 500 });
  if (photosResult.error) return NextResponse.json({ error: `property_images fetch failed: ${photosResult.error.message}` }, { status: 500 });

  // Not fatal for the rest of the modal — but logged, since a silent
  // failure here is exactly how the missing grant went unnoticed.
  if (installmentsResult.error) {
    console.error("[premier-installments] Admin property detail: failed to load installments", {
      propertyId: id,
      error: installmentsResult.error,
    });
  }

  return NextResponse.json({
    property: {
      ...property,
      title: property.title || "",
      description: property.description || "",
      postal_code: property.postal_code || "",
      country: property.country || "",
      amenities: property.amenities || [],
      common_areas: property.common_areas || [],
      skytrain_lines: property.skytrain_lines || [],
      nearby_supermarkets: property.nearby_supermarkets || [],
      owner_name: ownerResult.data?.full_name || "Unknown",
      owner_email: ownerResult.data?.email || "",
      owner_phone: ownerResult.data?.phone || "",
      purchased_plan_name: purchasedPlanName,
      uses_installments: isPremierTierPlan(purchasedPlanName),
      installments: installmentsResult.data || [],
      installments_error: installmentsResult.error?.message || null,
    },
    photos: photosResult.data || [],
  });
}
