import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  ArrowLeft,
  Building2,
  MapPin,
  Bed,
  Bath,
  Ruler,
  Train,
  Bus,
  ShoppingBag,
  Trees,
  Home,
  Calendar,
  PawPrint,
  Sparkles,
  ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default async function PropertyDetailsPage({
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

  // Load property and verify ownership
  const { data: property } = await supabase
    .from("properties")
    .select("*")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (!property) notFound();

  // Load images grouped by room
  const { data: images } = await supabase
    .from("property_images")
    .select("id, room_category, image_url, status, sort_order")
    .eq("property_id", id)
    .order("room_category")
    .order("sort_order", { ascending: true });

  const imagesByRoom: Record<string, typeof images> = {};
  for (const img of images || []) {
    if (!imagesByRoom[img.room_category]) imagesByRoom[img.room_category] = [];
    imagesByRoom[img.room_category]!.push(img);
  }

  return (
    <div className="space-y-6">
      {/* Back navigation */}
      <Link
        href="/dashboard/properties"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to My Properties
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl capitalize">
            {property.property_type}
          </h1>
          <p className="text-muted-foreground flex items-center gap-1 mt-1">
            <MapPin className="h-4 w-4" />
            {property.address}, {property.city}
            {property.province && `, ${property.province}`}
            {property.postal_code && ` ${property.postal_code}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={property.is_available ? "default" : "secondary"}
            className="text-sm"
          >
            {property.is_available ? "Available" : "Not Available"}
          </Badge>
          {property.monthly_rent && (
            <div className="text-right">
              <p className="text-2xl font-bold text-primary">
                ${Number(property.monthly_rent).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">CAD / month</p>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
        <Link
          href={`/dashboard/images?property=${property.id}`}
          className={cn(buttonVariants({ variant: "outline" }), "gap-2")}
        >
          <ImageIcon className="h-4 w-4" />
          Manage Images
        </Link>
      </div>

      {/* Core stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Property Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            {property.bedrooms != null && (
              <div className="flex items-center gap-2">
                <Bed className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Bedrooms</p>
                  <p className="text-sm font-medium">{property.bedrooms}</p>
                </div>
              </div>
            )}
            {property.bathrooms != null && (
              <div className="flex items-center gap-2">
                <Bath className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Bathrooms</p>
                  <p className="text-sm font-medium">{property.bathrooms}</p>
                </div>
              </div>
            )}
            {property.area_sqft != null && (
              <div className="flex items-center gap-2">
                <Ruler className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Size</p>
                  <p className="text-sm font-medium">{property.area_sqft} sqft</p>
                </div>
              </div>
            )}
            {property.availability_date && (
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Available from</p>
                  <p className="text-sm font-medium">
                    {new Date(property.availability_date).toLocaleDateString()}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Features */}
          <div className="mt-6 flex flex-wrap gap-2">
            {property.furnished && (
              <Badge variant="secondary" className="gap-1"><Home className="h-3 w-3" />Furnished</Badge>
            )}
            {property.pet_friendly && (
              <Badge variant="secondary" className="gap-1"><PawPrint className="h-3 w-3" />Pet-friendly</Badge>
            )}
            {property.utilities_included && (
              <Badge variant="secondary">Utilities included</Badge>
            )}
            {property.dishwasher && <Badge variant="secondary">Dishwasher</Badge>}
            {property.smart_home && (
              <Badge variant="secondary" className="gap-1"><Sparkles className="h-3 w-3" />Smart home</Badge>
            )}
            {property.shared_unit && <Badge variant="secondary">Shared unit</Badge>}
          </div>
        </CardContent>
      </Card>

      {/* Location */}
      {(property.near_skytrain || property.near_bus || property.near_mall || property.near_parks) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Location Features</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {property.near_skytrain && (
                <Badge variant="outline" className="gap-1">
                  <Train className="h-3 w-3" />
                  SkyTrain
                  {property.skytrain_lines && property.skytrain_lines.length > 0 &&
                    ` (${property.skytrain_lines.join(", ")})`}
                </Badge>
              )}
              {property.near_bus && (
                <Badge variant="outline" className="gap-1"><Bus className="h-3 w-3" />Bus</Badge>
              )}
              {property.near_mall && (
                <Badge variant="outline" className="gap-1"><ShoppingBag className="h-3 w-3" />Mall</Badge>
              )}
              {property.near_parks && (
                <Badge variant="outline" className="gap-1"><Trees className="h-3 w-3" />Parks</Badge>
              )}
            </div>
            {property.nearby_supermarkets && property.nearby_supermarkets.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium text-muted-foreground mb-2">Nearby supermarkets</p>
                <div className="flex flex-wrap gap-1.5">
                  {property.nearby_supermarkets.map((s: string, i: number) => (
                    <Badge key={i} variant="outline" className="text-xs">{s}</Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Amenities */}
      {property.amenities && property.amenities.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Amenities</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {property.amenities.map((a: string, i: number) => (
                <Badge key={i} variant="outline">{a}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Common areas */}
      {property.common_areas && property.common_areas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Common Areas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {property.common_areas.map((a: string, i: number) => (
                <Badge key={i} variant="outline">{a}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Images */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Property Images</CardTitle>
          <CardDescription>
            {images && images.length > 0
              ? `${images.length} image${images.length !== 1 ? "s" : ""} across ${Object.keys(imagesByRoom).length} room${Object.keys(imagesByRoom).length !== 1 ? "s" : ""}`
              : "No images uploaded yet"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {images && images.length > 0 ? (
            <div className="space-y-4">
              {Object.entries(imagesByRoom).map(([room, roomImgs]) => (
                <div key={room}>
                  <p className="text-sm font-medium mb-2">{room} ({roomImgs!.length})</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                    {roomImgs!.map((img) => (
                      <div key={img.id} className="relative aspect-[4/3] overflow-hidden rounded-md border bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.image_url}
                          alt={room}
                          className="h-full w-full object-cover"
                        />
                        <Badge
                          className={`absolute top-1 right-1 text-xs ${
                            img.status === "approved"
                              ? "bg-green-100 text-green-700"
                              : img.status === "rejected"
                                ? "bg-red-100 text-red-700"
                                : "bg-yellow-100 text-yellow-700"
                          }`}
                        >
                          {img.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center py-8 text-center">
              <Building2 className="mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No images uploaded for this property yet
              </p>
              <Link
                href={`/dashboard/images?property=${property.id}`}
                className={cn(buttonVariants({ size: "sm" }), "mt-4")}
              >
                Upload Images
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Financial (if elite/investor) */}
      {(property.cfp_monthly != null || property.payback_months != null) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Financial Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 grid-cols-2 md:grid-cols-3">
              {property.elite_tier && (
                <div>
                  <p className="text-xs text-muted-foreground">Portfolio</p>
                  <p className="text-sm font-medium capitalize">{property.elite_tier}</p>
                </div>
              )}
              {property.cfp_monthly != null && (
                <div>
                  <p className="text-xs text-muted-foreground">CFP Monthly</p>
                  <p className="text-sm font-medium text-emerald-600">
                    ${Number(property.cfp_monthly).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              )}
              {property.payback_months != null && (
                <div>
                  <p className="text-xs text-muted-foreground">Payback</p>
                  <p className="text-sm font-medium">
                    {Number(property.payback_months).toFixed(1)} months
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
