"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  MapPin,
  Building2,
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
  CheckCircle2,
  Send,
} from "lucide-react";

interface PropertyImage {
  image_url: string;
  room_category: string;
}

interface Property {
  id: string;
  property_type: string;
  address: string;
  city: string;
  province: string | null;
  postal_code: string | null;
  monthly_rent: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  area_sqft: number | null;
  amenities: string[] | null;
  common_areas: string[] | null;
  availability_date: string | null;
  dishwasher: boolean;
  pet_friendly: boolean;
  smart_home: boolean;
  furnished: boolean;
  utilities_included: boolean;
  near_parks: boolean;
  near_skytrain: boolean;
  skytrain_lines: string[] | null;
  near_bus: boolean;
  near_mall: boolean;
  nearby_supermarkets: string[] | null;
}

export function MatchedPropertyCard({
  property,
  images,
}: {
  property: Property;
  images: PropertyImage[];
}) {
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Group images by room category
  const imagesByRoom: Record<string, PropertyImage[]> = {};
  for (const img of images) {
    if (!imagesByRoom[img.room_category]) imagesByRoom[img.room_category] = [];
    imagesByRoom[img.room_category].push(img);
  }

  async function handleApply() {
    setApplying(true);
    setError(null);
    try {
      const res = await fetch("/api/apply-property", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ property_id: property.id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error("Apply for free failed:", res.status, body);
        if (res.status === 401) {
          setError("Your session expired. Please refresh the page and try again.");
        } else {
          setError(`Could not submit (status ${res.status}). Please try again.`);
        }
        return;
      }
      setApplied(true);
    } catch (err) {
      console.error(err);
      setError("Network error. Please check your connection and try again.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      {/* Image gallery (all photos by room, smaller aspect) */}
      {images.length > 0 ? (
        <div className="space-y-3 p-4 bg-muted/30">
          {Object.entries(imagesByRoom).map(([room, roomImgs]) => (
            <div key={room}>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">
                {room} ({roomImgs.length})
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                {roomImgs.map((img, i) => (
                  <div key={i} className="aspect-[4/3] overflow-hidden rounded-md bg-background">
                    <img
                      src={img.image_url}
                      alt={`${room} ${i + 1}`}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex h-32 items-center justify-center bg-muted">
          <Building2 className="h-8 w-8 text-muted-foreground" />
        </div>
      )}

      <CardContent className="space-y-4 p-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold capitalize">{property.property_type}</h3>
            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
              <MapPin className="h-3.5 w-3.5" />
              {property.address}, {property.city}
              {property.province && `, ${property.province}`}
              {property.postal_code && ` ${property.postal_code}`}
            </p>
          </div>
          {property.monthly_rent && (
            <div className="text-right shrink-0">
              <p className="text-2xl font-bold text-primary">
                ${Number(property.monthly_rent).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">CAD / month</p>
            </div>
          )}
        </div>

        {/* Core stats */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {property.bedrooms != null && (
            <div className="flex items-center gap-1.5 text-sm">
              <Bed className="h-4 w-4 text-muted-foreground" />
              <span>{property.bedrooms} bed{property.bedrooms !== 1 ? "s" : ""}</span>
            </div>
          )}
          {property.bathrooms != null && (
            <div className="flex items-center gap-1.5 text-sm">
              <Bath className="h-4 w-4 text-muted-foreground" />
              <span>{property.bathrooms} bath{property.bathrooms !== 1 ? "s" : ""}</span>
            </div>
          )}
          {property.area_sqft != null && (
            <div className="flex items-center gap-1.5 text-sm">
              <Ruler className="h-4 w-4 text-muted-foreground" />
              <span>{property.area_sqft} sqft</span>
            </div>
          )}
          {property.availability_date && (
            <div className="flex items-center gap-1.5 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>Available {new Date(property.availability_date).toLocaleDateString()}</span>
            </div>
          )}
        </div>

        {/* Location features */}
        {(property.near_skytrain || property.near_bus || property.near_mall || property.near_parks) && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Location</p>
            <div className="flex flex-wrap gap-1.5">
              {property.near_skytrain && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <Train className="h-3 w-3" /> SkyTrain
                  {property.skytrain_lines && property.skytrain_lines.length > 0 &&
                    ` (${property.skytrain_lines.join(", ")})`}
                </Badge>
              )}
              {property.near_bus && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <Bus className="h-3 w-3" /> Bus
                </Badge>
              )}
              {property.near_mall && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <ShoppingBag className="h-3 w-3" /> Mall
                </Badge>
              )}
              {property.near_parks && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <Trees className="h-3 w-3" /> Parks
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Property features */}
        {(property.furnished || property.pet_friendly || property.utilities_included ||
          property.dishwasher || property.smart_home) && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Features</p>
            <div className="flex flex-wrap gap-1.5">
              {property.furnished && <Badge variant="secondary" className="gap-1 text-xs"><Home className="h-3 w-3" />Furnished</Badge>}
              {property.pet_friendly && <Badge variant="secondary" className="gap-1 text-xs"><PawPrint className="h-3 w-3" />Pet-friendly</Badge>}
              {property.utilities_included && <Badge variant="secondary" className="text-xs">Utilities included</Badge>}
              {property.dishwasher && <Badge variant="secondary" className="text-xs">Dishwasher</Badge>}
              {property.smart_home && <Badge variant="secondary" className="gap-1 text-xs"><Sparkles className="h-3 w-3" />Smart home</Badge>}
            </div>
          </div>
        )}

        {/* Amenities */}
        {property.amenities && property.amenities.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Amenities</p>
            <div className="flex flex-wrap gap-1.5">
              {property.amenities.map((a, i) => (
                <Badge key={i} variant="outline" className="text-xs">{a}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* Common areas */}
        {property.common_areas && property.common_areas.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Common areas</p>
            <div className="flex flex-wrap gap-1.5">
              {property.common_areas.map((a, i) => (
                <Badge key={i} variant="outline" className="text-xs">{a}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* Supermarkets */}
        {property.nearby_supermarkets && property.nearby_supermarkets.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Nearby supermarkets</p>
            <div className="flex flex-wrap gap-1.5">
              {property.nearby_supermarkets.map((s, i) => (
                <Badge key={i} variant="outline" className="text-xs">{s}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* Apply CTA */}
        <div className="pt-2 border-t">
          {applied ? (
            <div className="rounded-md border border-green-200 bg-green-50 p-4 text-center">
              <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-green-600" />
              <p className="font-medium text-green-800">Thank you.</p>
              <p className="text-sm text-green-700 mt-1">
                Our team will review your profile and contact you.
              </p>
            </div>
          ) : (
            <>
              <Button
                onClick={handleApply}
                disabled={applying}
                size="lg"
                className="w-full gap-2"
              >
                <Send className="h-4 w-4" />
                {applying ? "Submitting..." : "Apply for Free"}
              </Button>
              {error && (
                <p className="mt-2 text-sm text-red-600 text-center">{error}</p>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
