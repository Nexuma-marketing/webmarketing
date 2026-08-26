"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ExternalLink, ImageIcon } from "lucide-react";
import { ELITE_TIERS, SERVICE_TIERS } from "@/lib/constants";

export interface PropertyDetail {
  id: string;
  title: string;
  description: string;
  address: string;
  city: string;
  province: string;
  postal_code: string;
  country: string;
  property_type: string;
  monthly_rent: number | null;
  is_available: boolean;
  service_tier: string | null;
  elite_tier: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  area_sqft: number | null;
  amenities: string[];
  common_areas: string[];
  pet_friendly: boolean | null;
  smart_home: boolean | null;
  dishwasher: boolean | null;
  occupancy_status: string | null;
  availability_date: string | null;
  near_parks: boolean;
  near_churches: boolean;
  near_skytrain: boolean;
  skytrain_lines: string[];
  near_bus: boolean;
  near_mall: boolean;
  social_life: string | null;
  nearby_supermarkets: string[];
  owner_name: string;
  owner_email: string;
  owner_phone: string;
}

interface PhotoRow {
  id: string;
  image_url: string;
  room_category: string;
  status: string;
}

interface Props {
  propertyId: string | null;
  onClose: () => void;
  onPhotoStatusChanged?: () => void;
}

export function PropertyDetailModal({ propertyId, onClose, onPhotoStatusChanged }: Props) {
  const [property, setProperty] = useState<PropertyDetail | null>(null);
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [photoSavingId, setPhotoSavingId] = useState<string | null>(null);
  const [planDetails, setPlanDetails] = useState<{ tagline: string; features: string[] } | null>(null);

  useEffect(() => {
    if (!propertyId) {
      setProperty(null);
      setPhotos([]);
      setError("");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");
    setProperty(null);
    setPhotos([]);
    setPlanDetails(null);

    void (async () => {
      try {
        const detailRes = await fetch(`/api/admin/properties/${propertyId}`, { cache: "no-store" });
        if (!detailRes.ok) {
          const body = (await detailRes.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error || `Property details failed (${detailRes.status})`);
        }
        const detail = (await detailRes.json()) as { property: PropertyDetail; photos: PhotoRow[] };
        if (cancelled) return;
        setProperty(detail.property);
        setPhotos(detail.photos || []);

        if (detail.property.service_tier) {
          const planRes = await fetch(
            `/api/admin/plan-details/${encodeURIComponent(detail.property.service_tier)}`,
            { cache: "no-store" },
          );
          if (planRes.ok && !cancelled) {
            const plan = (await planRes.json()) as { tagline: string; features: string[] };
            setPlanDetails({ tagline: plan.tagline || "", features: plan.features || [] });
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Property details failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [propertyId]);

  async function setPhotoStatus(photoId: string, status: string) {
    setPhotoSavingId(photoId);
    const res = await fetch("/api/admin/images", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: photoId, status }),
    });
    setPhotoSavingId(null);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error || `Status change failed (${res.status})`);
      return;
    }
    setPhotos((current) => current.map((photo) => photo.id === photoId ? { ...photo, status } : photo));
    onPhotoStatusChanged?.();
  }

  return (
    <Dialog open={!!propertyId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-4xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{property?.title || property?.address || "Property Details"}</DialogTitle>
          <DialogDescription>
            {property ? [property.address, property.city, property.province].filter(Boolean).join(", ") : "Full property information"}
          </DialogDescription>
        </DialogHeader>
        {loading && <p className="text-sm text-muted-foreground">Loading property details...</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {property && (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <DetailSection title="Property">
                <KV k="Type" v={property.property_type || "—"} />
                <KV k="Bedrooms" v={String(property.bedrooms ?? "—")} />
                <KV k="Bathrooms" v={String(property.bathrooms ?? "—")} />
                <KV k="Area" v={property.area_sqft ? `${property.area_sqft} sqft` : "—"} />
                <KV k="Monthly rent" v={property.monthly_rent ? `$${Number(property.monthly_rent).toLocaleString()} CAD` : "—"} />
                <KV k="Tier" v={SERVICE_TIERS[property.service_tier || ""] || property.service_tier || "—"} />
                {property.elite_tier && <KV k="Elite tier" v={ELITE_TIERS[property.elite_tier] || property.elite_tier} />}
                <KV k="Available" v={property.is_available ? "Yes" : "No"} />
                {property.occupancy_status && <KV k="Occupancy" v={property.occupancy_status} />}
                {property.availability_date && <KV k="Available from" v={new Date(property.availability_date).toLocaleDateString("en-CA")} />}
              </DetailSection>
              <DetailSection title="Owner">
                <KV k="Name" v={property.owner_name} />
                <KV k="Email" v={property.owner_email || "—"} />
                <KV k="Phone" v={property.owner_phone || "—"} />
                {property.postal_code && <KV k="Postal code" v={property.postal_code} />}
                {property.country && <KV k="Country" v={property.country} />}
              </DetailSection>
            </div>

            <DetailSection title="Zone Profile">
              <KV k="Parks nearby" v={yesNo(property.near_parks)} />
              <KV k="Churches nearby" v={yesNo(property.near_churches)} />
              <KV k="Bus stop nearby" v={yesNo(property.near_bus)} />
              <KV k="SkyTrain nearby" v={yesNo(property.near_skytrain)} />
              <KV k="SkyTrain lines" v={property.skytrain_lines.length ? property.skytrain_lines.join(", ") : "—"} />
              <KV k="Shopping mall nearby" v={yesNo(property.near_mall)} />
              <KV k="Social life nearby" v={property.social_life || "—"} />
              <KV k="Nearby supermarkets" v={property.nearby_supermarkets.length ? property.nearby_supermarkets.join(", ") : "—"} />
            </DetailSection>

            <DetailSection title="Features">
              <KV k="Amenities" v={property.amenities.length ? property.amenities.join(", ") : "—"} />
              <KV k="Common areas" v={property.common_areas.length ? property.common_areas.join(", ") : "—"} />
              <KV k="Pet friendly" v={yesNo(!!property.pet_friendly)} />
              <KV k="Smart home" v={yesNo(!!property.smart_home)} />
              <KV k="Dishwasher" v={yesNo(!!property.dishwasher)} />
            </DetailSection>

            {property.description && <DetailSection title="Description"><p className="text-sm whitespace-pre-wrap">{property.description}</p></DetailSection>}

            {property.service_tier && (
              <DetailSection title={`Plan: ${SERVICE_TIERS[property.service_tier] || property.service_tier}`}>
                {planDetails?.tagline && <p className="text-sm italic mb-2">{planDetails.tagline}</p>}
                {planDetails?.features?.length ? (
                  <ul className="space-y-1 text-xs">{planDetails.features.map((feature, index) => <li key={index}>• {feature}</li>)}</ul>
                ) : <p className="text-xs text-muted-foreground">No plan details available.</p>}
              </DetailSection>
            )}

            <DetailSection title={`Photos (${photos.length})`}>
              {photos.length === 0 ? (
                <p className="text-sm text-muted-foreground italic"><ImageIcon className="h-4 w-4 inline mr-1" />No photos uploaded for this property yet.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {photos.map((photo) => (
                    <div key={photo.id} className="rounded-md border overflow-hidden">
                      <div className="relative aspect-video bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photo.image_url} alt={photo.room_category || "Property photo"} className="object-cover w-full h-full" />
                        <Badge className="absolute top-2 left-2 text-xs">{photo.status}</Badge>
                      </div>
                      <div className="p-2 space-y-1">
                        <p className="text-xs text-muted-foreground">{photo.room_category || "—"}</p>
                        <div className="flex gap-1">
                          <Button variant={photo.status === "approved" ? "default" : "outline"} size="sm" onClick={() => setPhotoStatus(photo.id, "approved")} disabled={photoSavingId === photo.id} className="flex-1 text-xs">Approve</Button>
                          <Button variant={photo.status === "rejected" ? "default" : "outline"} size="sm" onClick={() => setPhotoStatus(photo.id, "rejected")} disabled={photoSavingId === photo.id} className="flex-1 text-xs">Reject</Button>
                          <a href={photo.image_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center rounded-md px-2" aria-label="Open image in new tab"><ExternalLink className="h-3.5 w-3.5" /></a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </DetailSection>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-md border bg-muted/30 p-3 space-y-2"><p className="text-sm font-semibold">{title}</p><div className="space-y-1">{children}</div></div>;
}

function KV({ k, v }: { k: string; v: string }) {
  return <div className="flex gap-2 text-xs"><span className="text-muted-foreground min-w-[110px]">{k}:</span><span className="font-medium">{v}</span></div>;
}

function yesNo(value: boolean) {
  return value ? "Yes" : "No";
}
