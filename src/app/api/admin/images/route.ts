import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Steve 6/5 (6-2.md #26): Image Library "search by owner name" didn't
// find anything even when the owner clearly existed. The page's
// embedded `properties:property_id(...)` join + the second profiles
// query were both running through the cookie-context client, where
// they could silently return null/empty. Same pattern fix as the
// payments / properties / reassign routes — service-role plus
// manual join. Returns each image enriched with property + owner.

export const dynamic = "force-dynamic";

const INTERNAL_ROLES = ["admin", "marketing", "sales", "support"];
// Steve 6/9 (6-2.md #39): admin / marketing / sales can approve or
// reject photos. Support is read-only (per the permission matrix
// on /admin/team).
const IMAGE_WRITE_ROLES = ["admin", "marketing", "sales"];

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

  const { data: imageRows, error: imgErr } = await supabaseAdmin
    .from("property_images")
    .select("id, property_id, image_url, room_category, status, uploaded_at")
    .order("uploaded_at", { ascending: false })
    .limit(500);
  if (imgErr) {
    return NextResponse.json(
      { error: `images fetch failed: ${imgErr.message}` },
      { status: 500 },
    );
  }
  const rows = imageRows ?? [];

  const propertyIds = Array.from(
    new Set(rows.map((r) => r.property_id as string | null).filter((v): v is string => !!v)),
  );

  // Steve 6/10 (6-2.md #47): widened the property select so the
  // Image Library search bar can match by province, postal code,
  // and property type too — Alex June 4 list point 6 said the
  // owner-name search was broken; the actual data wasn't in the
  // payload for those fields. Including everything sales might
  // type into the box.
  let propertyMap: Record<string, { id: string; address: string; city: string; province: string; postal_code: string; property_type: string; owner_id: string | null }> = {};
  if (propertyIds.length > 0) {
    const { data: propsData, error: propsErr } = await supabaseAdmin
      .from("properties")
      .select("id, address, city, province, postal_code, property_type, owner_id")
      .in("id", propertyIds);
    if (propsErr) {
      return NextResponse.json(
        { error: `properties fetch failed: ${propsErr.message}` },
        { status: 500 },
      );
    }
    propertyMap = Object.fromEntries(
      (propsData ?? []).map((p) => [
        p.id as string,
        {
          id: p.id as string,
          address: (p.address as string) || "",
          city: (p.city as string) || "",
          province: (p.province as string) || "",
          postal_code: (p.postal_code as string) || "",
          property_type: (p.property_type as string) || "",
          owner_id: (p.owner_id as string | null) ?? null,
        },
      ]),
    );
  }

  const ownerIds = Array.from(
    new Set(
      Object.values(propertyMap)
        .map((p) => p.owner_id)
        .filter((v): v is string => !!v),
    ),
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

  const images = rows.map((img) => {
    const prop = img.property_id ? propertyMap[img.property_id as string] : undefined;
    const owner = prop?.owner_id ? ownerMap[prop.owner_id] : undefined;
    return {
      id: img.id as string,
      property_id: img.property_id as string,
      image_url: img.image_url as string,
      room_category: img.room_category as string,
      status: img.status as string,
      uploaded_at: img.uploaded_at as string,
      property: prop
        ? {
            id: prop.id,
            address: prop.address,
            city: prop.city,
            province: prop.province,
            postal_code: prop.postal_code,
            property_type: prop.property_type,
            owner_id: prop.owner_id,
          }
        : null,
      owner: owner
        ? {
            full_name: owner.full_name ?? "",
            email: owner.email ?? "",
            phone: owner.phone ?? "",
          }
        : null,
    };
  });

  return NextResponse.json({ images });
}

// Steve 6/9 (6-2.md #39): Approve / Reject buttons on /admin/images
// were calling supabase.from("property_images").update({status})
// directly from the cookie-context client. RLS allowed admin but
// silently dropped writes from sales / marketing — so Alex's
// "Aprobar o no fotos" complaint was that the buttons looked clickable
// but did nothing visible. Service-role PATCH fixes it cleanly.
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
  if (!callerProfile?.role || !IMAGE_WRITE_ROLES.includes(callerProfile.role)) {
    return NextResponse.json(
      { error: "Forbidden — your role can only read images" },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const { id, status } = body as { id?: string; status?: string };
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  if (!status || !["pending", "approved", "rejected"].includes(status)) {
    return NextResponse.json(
      { error: "status must be pending / approved / rejected" },
      { status: 400 },
    );
  }
  const { error } = await supabaseAdmin
    .from("property_images")
    .update({ status })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
