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
import { Badge } from "@/components/ui/badge";
import { Plus, MapPin, TrendingUp, Clock } from "lucide-react";
import { formatCurrency } from "@/lib/admin";
import { SERVICE_TIERS, ELITE_TIERS } from "@/lib/constants";
import { DeletePropertyButton } from "@/components/property/delete-property-button";

export default async function PropertiesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Load user profile to check if investor
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isInvestor = profile?.role === "inversionista";

  const { data: properties } = await supabase
    .from("properties")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  // Fetch first image for each property from property_images table
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">My Properties</h1>
          <p className="text-muted-foreground">
            Manage your registered properties
          </p>
        </div>
        <Link href="/forms/propietario/add-property" className={buttonVariants()}>
          <Plus className="mr-2 h-4 w-4" />
          New Property
        </Link>
      </div>

      {!properties || properties.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="mb-4 text-muted-foreground">
              You haven&apos;t registered any properties yet
            </p>
            <Link href="/forms/propietario" className={buttonVariants()}>
              Register my first property
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {properties.map((property) => {
            const rent = Number(property.monthly_rent) || 0;
            const cfp = Number(property.cfp_monthly) || 0;
            const payback = property.payback_months ? Number(property.payback_months) : null;
            // Steve #8: investors see portfolio name (Essentials/Signature/Lujo), NOT "Basic"
            const tierLabel = isInvestor
              ? (property.elite_tier ? (ELITE_TIERS[property.elite_tier] || property.elite_tier) : "Elite")
              : (property.service_tier ? (SERVICE_TIERS[property.service_tier] || property.service_tier) : null);
            // Steve 4/21 #10: only investors see portfolio label (Essentials/Signature/Lujo)
            const eliteLabel = isInvestor && property.elite_tier
              ? ELITE_TIERS[property.elite_tier] || property.elite_tier
              : null;

            return (
              <Card key={property.id} className="overflow-hidden">
                {/* Thumbnail */}
                <div className="aspect-video bg-muted">
                  {thumbnailMap[property.id] ? (
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
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-lg">{property.property_type}</CardTitle>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant={property.is_available ? "default" : "secondary"}>
                        {property.is_available ? "Available" : "Unavailable"}
                      </Badge>
                      {tierLabel && (
                        <Badge variant="outline" className="text-xs">
                          {tierLabel}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <CardDescription className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {property.address}, {property.city}
                    {property.province ? `, ${property.province}` : ""}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    {rent > 0 && (
                      <span className="text-lg font-bold">
                        {formatCurrency(rent)}/mo
                      </span>
                    )}
                  </div>

                  {(property.bedrooms || property.bathrooms || property.area_sqft) && (
                    <div className="flex gap-3 text-sm text-muted-foreground">
                      {property.bedrooms && <span>{property.bedrooms} bed</span>}
                      {property.bathrooms && <span>{property.bathrooms} bath</span>}
                      {property.area_sqft && <span>{property.area_sqft} sq ft</span>}
                    </div>
                  )}

                  {/* CFP & Payback for Elite properties */}
                  {cfp > 0 && (
                    <div className="rounded-md border p-3 space-y-2">
                      {eliteLabel && (
                        <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                          {eliteLabel}
                        </Badge>
                      )}
                      <div className="flex items-center gap-2 text-sm">
                        <TrendingUp className="h-3.5 w-3.5 text-green-600" />
                        <span className="text-muted-foreground">CFP:</span>
                        <span className="font-medium">{formatCurrency(cfp)}/mo</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="font-medium">{formatCurrency(cfp * 12)}/yr</span>
                      </div>
                      {payback !== null && payback !== Infinity && (
                        <div className="flex items-center gap-2 text-sm">
                          <Clock className="h-3.5 w-3.5 text-blue-600" />
                          <span className="text-muted-foreground">Payback:</span>
                          <span className="font-medium">{payback.toFixed(1)} months</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <Link
                      href={`/dashboard/images?property=${property.id}`}
                      className={buttonVariants({ variant: "outline", size: "sm", className: "flex-1" })}
                    >
                      Images
                    </Link>
                    <Link
                      href={`/dashboard/properties/${property.id}`}
                      className={buttonVariants({ variant: "outline", size: "sm", className: "flex-1" })}
                    >
                      Details
                    </Link>
                    <DeletePropertyButton
                      propertyId={property.id}
                      propertyLabel={`${property.property_type} — ${property.address}, ${property.city}`}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
