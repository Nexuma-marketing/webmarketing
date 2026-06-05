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

  let propertyMap: Record<string, { id: string; address: string; city: string; owner_id: string | null }> = {};
  if (propertyIds.length > 0) {
    const { data: propsData, error: propsErr } = await supabaseAdmin
      .from("properties")
      .select("id, address, city, owner_id")
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

  let ownerMap: Record<string, { full_name: string | null; email: string | null }> = {};
  if (ownerIds.length > 0) {
    const { data: ownersData, error: ownersErr } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
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
            owner_id: prop.owner_id,
          }
        : null,
      owner: owner
        ? {
            full_name: owner.full_name ?? "",
            email: owner.email ?? "",
          }
        : null,
    };
  });

  return NextResponse.json({ images });
}
