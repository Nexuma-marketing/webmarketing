import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MapPin, Pencil } from "lucide-react";
import { formatCurrency } from "@/lib/admin";
import { ObjectivesEditor } from "@/components/property/objectives-editor";

export default async function PreferencesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: properties } = await supabase
    .from("properties")
    .select("id, property_type, address, city, monthly_rent")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  // Thumbnail per property, same pattern as /dashboard/properties.
  const propertyIds = properties?.map((p) => p.id) || [];
  const thumbnailMap: Record<string, string> = {};

  if (propertyIds.length > 0) {
    const { data: images } = await supabase
      .from("property_images")
      .select("property_id, image_url")
      .in("property_id", propertyIds)
      .order("sort_order", { ascending: true });

    if (images) {
      for (const img of images) {
        if (!thumbnailMap[img.property_id]) {
          thumbnailMap[img.property_id] = img.image_url;
        }
      }
    }
  }

  // Non-property preferences ("objectives") captured on the original
  // registration form live on discovery_briefs, keyed one-per-user —
  // safe to edit directly here since there is no per-property array
  // to misalign.
  const { data: brief } = await supabase
    .from("discovery_briefs")
    .select("id, objectives")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">Update Preferences</h1>
        <p className="text-muted-foreground">
          Select a property to edit its details, or update your investment objectives below.
        </p>
      </div>

      {brief && (
        <ObjectivesEditor briefId={brief.id} initialObjectives={brief.objectives || []} />
      )}

      {!properties || properties.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="mb-4 text-muted-foreground">
              You haven&apos;t registered any properties yet
            </p>
            <Link href="/forms/propietario" className={buttonVariants()}>
              Complete Discovery Brief
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {properties.map((property) => (
            <Card key={property.id} className="overflow-hidden">
              <div className="aspect-video bg-muted">
                {thumbnailMap[property.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumbnailMap[property.id]}
                    alt={property.address}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    No image
                  </div>
                )}
              </div>

              <CardHeader className="pb-2">
                <CardTitle className="text-lg capitalize">{property.property_type}</CardTitle>
                <CardDescription className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {property.address}, {property.city}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-3">
                {property.monthly_rent && (
                  <span className="text-lg font-bold">
                    {formatCurrency(Number(property.monthly_rent))}/mo
                  </span>
                )}
                <Link
                  href={`/dashboard/preferences/${property.id}`}
                  className={buttonVariants({ className: "w-full gap-2" })}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
