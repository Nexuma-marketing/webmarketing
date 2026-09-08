import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PropertyEditForm } from "@/components/property/property-edit-form";

export default async function EditPropertyPreferencesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Load by real database id, scoped to this owner — never by array
  // position. This is the fix for the "Update Preferences" mismatch bug:
  // there is exactly one candidate row here, identified by its own id.
  const { data: property } = await supabase
    .from("properties")
    .select("*")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (!property) notFound();

  const { data: images } = await supabase
    .from("property_images")
    .select("id, room_category, image_url, status")
    .eq("property_id", id)
    .order("room_category")
    .order("sort_order", { ascending: true });

  return <PropertyEditForm property={property} existingImages={images || []} />;
}
