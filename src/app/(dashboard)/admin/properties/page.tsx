"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { DataTable } from "@/components/dashboard/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ExternalLink, Eye, ImageIcon, Search as SearchIcon } from "lucide-react";
import { SERVICE_TIERS, ELITE_TIERS } from "@/lib/constants";
import type { ColumnDef } from "@tanstack/react-table";

interface PropertyRow {
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
  vacancy_date: string | null;
  availability_date: string | null;
  cfp_monthly: number | null;
  payback_months: number | null;
  created_at: string;
  owner_name: string;
  owner_email: string;
  owner_phone: string;
  photo_count: number;
  photo_pending: number;
  photo_approved: number;
  photo_rejected: number;
}

// Steve 6/9 (6-2.md #41): per-property photo list used by the
// detail modal. Loaded lazily on row click so we don't bloat the
// table-level fetch.
interface PhotoRow {
  id: string;
  image_url: string;
  room_category: string;
  status: string;
  uploaded_at: string;
}

export default function AdminPropertiesPage() {
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Steve 6/9 (6-2.md #41): detail modal state for the new View
  // button. selectedProperty drives both visibility and content;
  // photos load on open via the per-property endpoint.
  const [selectedProperty, setSelectedProperty] = useState<PropertyRow | null>(null);
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [photoSavingId, setPhotoSavingId] = useState<string | null>(null);
  // Steve 6/9 (6-2.md #42): multi-field search state (was previously
  // address-only inside DataTable). See filteredProperties below.
  const [propertySearch, setPropertySearch] = useState("");

  const supabase = createClient();

  // Steve 6/5 (6-2.md #23): client-side embedded join
  // `profiles:owner_id(full_name)` returned null for every row → "Unknown"
  // in the Owner column. Same RLS/embed quirk that broke the original
  // /admin/payments. Switched to a server-role API route. Toggle on
  // is_available is still done via the cookie-context client because
  // admin RLS on properties allows writes by admin / marketing roles.
  const loadProperties = useCallback(async () => {
    const res = await fetch("/api/admin/properties", { cache: "no-store" });
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const json = (await res.json()) as { properties: PropertyRow[] };
    setProperties(json.properties || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadProperties();
  }, [loadProperties]);

  async function toggleAvailability(id: string, current: boolean) {
    await supabase
      .from("properties")
      .update({ is_available: !current })
      .eq("id", id);
    loadProperties();
  }

  // Steve 6/9 (6-2.md #41): open the detail modal — lazily fetch the
  // photos for that property from the per-property endpoint.
  async function openDetails(p: PropertyRow) {
    setSelectedProperty(p);
    setPhotos([]);
    setPhotosLoading(true);
    try {
      const res = await fetch(`/api/admin/properties/${p.id}/photos`, { cache: "no-store" });
      if (res.ok) {
        const json = (await res.json()) as { photos: PhotoRow[] };
        setPhotos(json.photos || []);
      }
    } finally {
      setPhotosLoading(false);
    }
  }

  // Approve / Reject buttons inside the detail modal reuse the same
  // /api/admin/images PATCH endpoint as the Image Library page so
  // there's one source of truth for the write path.
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
      alert(`Status change failed: ${body.error || res.status}`);
      return;
    }
    setPhotos((prev) => prev.map((p) => (p.id === photoId ? { ...p, status } : p)));
    // Refresh table photo-count badges to match.
    loadProperties();
  }

  const columns: ColumnDef<PropertyRow>[] = [
    {
      accessorKey: "address",
      header: "Address",
      cell: ({ row }) => (
        <span className="font-medium">{row.getValue("address")}</span>
      ),
    },
    {
      accessorKey: "owner_name",
      header: "Owner",
      cell: ({ row }) => {
        const name = row.getValue("owner_name") as string;
        const email = row.original.owner_email;
        return (
          <div>
            <p className="font-medium">{name}</p>
            {email && <p className="text-xs text-muted-foreground">{email}</p>}
          </div>
        );
      },
    },
    {
      accessorKey: "city",
      header: "City",
    },
    {
      accessorKey: "monthly_rent",
      header: "Rent",
      cell: ({ row }) => {
        const rent = row.getValue("monthly_rent") as number | null;
        return rent
          ? `$${Number(rent).toLocaleString()} CAD`
          : "—";
      },
    },
    {
      accessorKey: "service_tier",
      header: "Tier",
      cell: ({ row }) => {
        const tier = row.getValue("service_tier") as string | null;
        const elite = row.original.elite_tier;
        return (
          <div className="flex flex-col gap-1">
            {tier && (
              <Badge variant="outline" className="text-xs w-fit">
                {SERVICE_TIERS[tier] || tier}
              </Badge>
            )}
            {elite && (
              <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200 w-fit">
                {ELITE_TIERS[elite] || elite}
              </Badge>
            )}
          </div>
        );
      },
      filterFn: "equals",
    },
    {
      accessorKey: "is_available",
      header: "Available",
      cell: ({ row }) => (
        <Switch
          checked={row.getValue("is_available") as boolean}
          onCheckedChange={() =>
            toggleAvailability(row.original.id, row.original.is_available)
          }
        />
      ),
    },
    {
      accessorKey: "created_at",
      header: "Date",
      cell: ({ row }) =>
        new Date(row.getValue("created_at")).toLocaleDateString("en-CA"),
    },
    // Steve 6/9 (6-2.md #41): Photos column with badge counts per
    // status, plus a "View" button that opens the detail modal.
    {
      id: "photos",
      header: "Photos",
      cell: ({ row }) => {
        const r = row.original;
        if (r.photo_count === 0) {
          return <span className="text-muted-foreground text-xs">—</span>;
        }
        return (
          <div className="flex flex-wrap gap-1 text-xs">
            {r.photo_approved > 0 && (
              <Badge className="bg-green-50 text-green-700 border-green-200">
                {r.photo_approved}
              </Badge>
            )}
            {r.photo_pending > 0 && (
              <Badge className="bg-yellow-50 text-yellow-700 border-yellow-200">
                {r.photo_pending} pending
              </Badge>
            )}
            {r.photo_rejected > 0 && (
              <Badge className="bg-red-50 text-red-700 border-red-200">
                {r.photo_rejected} rejected
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => openDetails(row.original)}
        >
          <Eye className="h-3.5 w-3.5 mr-1" />
          View
        </Button>
      ),
    },
  ];

  const tierOptions = Object.entries(SERVICE_TIERS).map(([value, label]) => ({
    value,
    label,
  }));

  // Steve 6/9 (6-2.md #42): Alex docx Item 5 sub-issue 7 — sales
  // needs to search the property list by owner name / address /
  // city / property type, not just address. Filter the array
  // ourselves before passing to DataTable so we can match across
  // several columns at once. The empty-search early return keeps
  // the case-folding off the hot path when nothing is typed.
  const filteredProperties = propertySearch
    ? properties.filter((p) => {
        const q = propertySearch.toLowerCase();
        return (
          p.address.toLowerCase().includes(q) ||
          p.city.toLowerCase().includes(q) ||
          p.province.toLowerCase().includes(q) ||
          p.postal_code.toLowerCase().includes(q) ||
          (p.property_type || "").toLowerCase().includes(q) ||
          p.owner_name.toLowerCase().includes(q) ||
          p.owner_email.toLowerCase().includes(q) ||
          (p.owner_phone || "").toLowerCase().includes(q) ||
          (p.title || "").toLowerCase().includes(q)
        );
      })
    : properties;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">Property Management</h1>
        <p className="text-muted-foreground">
          View and manage all registered properties
        </p>
      </div>

      {/* Steve 6/9 (6-2.md #42): widened search bar — single input
          covers owner / address / city / type / postal code instead
          of address-only. Live filter on every keystroke. */}
      <div className="relative max-w-md">
        <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={propertySearch}
          onChange={(e) => setPropertySearch(e.target.value)}
          placeholder="Search by owner, address, city, type, postal code..."
          className="w-full rounded-md border border-input bg-transparent pl-9 pr-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      <DataTable
        columns={columns}
        data={filteredProperties}
        loading={loading}
        filters={[
          {
            key: "service_tier",
            label: "Tier",
            options: tierOptions,
          },
        ]}
      />

      {/* Steve 6/9 (6-2.md #41): property-detail modal with the full
          spec sheet on the left + photo carousel with inline Approve
          / Reject on the right. Sales asked for this in 2026-06-07
          docx Item 5 sub-issue 6 — "ver todas las propiedades
          registradas para buscar una nueva propuesta". */}
      <Dialog open={!!selectedProperty} onOpenChange={() => setSelectedProperty(null)}>
        {/* Steve 6/9: the base DialogContent caps at sm:max-w-sm; we
            need a much wider modal here for the spec sheet + photos
            grid. Use the same responsive prefix so tailwind-merge
            recognises the conflict and wins. */}
        <DialogContent className="sm:max-w-4xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedProperty?.title || selectedProperty?.address || "Property Details"}
            </DialogTitle>
            <DialogDescription>
              {selectedProperty?.address}
              {selectedProperty?.city && `, ${selectedProperty.city}`}
              {selectedProperty?.province && `, ${selectedProperty.province}`}
            </DialogDescription>
          </DialogHeader>
          {selectedProperty && (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <DetailSection title="Property">
                  <KV k="Type" v={selectedProperty.property_type || "—"} />
                  <KV k="Bedrooms" v={String(selectedProperty.bedrooms ?? "—")} />
                  <KV k="Bathrooms" v={String(selectedProperty.bathrooms ?? "—")} />
                  <KV k="Area" v={selectedProperty.area_sqft ? `${selectedProperty.area_sqft} sqft` : "—"} />
                  <KV
                    k="Monthly rent"
                    v={selectedProperty.monthly_rent ? `$${Number(selectedProperty.monthly_rent).toLocaleString()} CAD` : "—"}
                  />
                  <KV
                    k="Tier"
                    v={(SERVICE_TIERS[selectedProperty.service_tier || ""] as string) || selectedProperty.service_tier || "—"}
                  />
                  {selectedProperty.elite_tier && (
                    <KV k="Elite tier" v={(ELITE_TIERS[selectedProperty.elite_tier] as string) || selectedProperty.elite_tier} />
                  )}
                  <KV k="Available" v={selectedProperty.is_available ? "Yes" : "No"} />
                  {selectedProperty.occupancy_status && (
                    <KV k="Occupancy" v={selectedProperty.occupancy_status} />
                  )}
                  {selectedProperty.availability_date && (
                    <KV k="Available from" v={new Date(selectedProperty.availability_date).toLocaleDateString("en-CA")} />
                  )}
                </DetailSection>
                <DetailSection title="Owner">
                  <KV k="Name" v={selectedProperty.owner_name} />
                  <KV k="Email" v={selectedProperty.owner_email || "—"} />
                  <KV k="Phone" v={selectedProperty.owner_phone || "—"} />
                  {selectedProperty.postal_code && (
                    <KV k="Postal code" v={selectedProperty.postal_code} />
                  )}
                  {selectedProperty.country && (
                    <KV k="Country" v={selectedProperty.country} />
                  )}
                </DetailSection>
              </div>

              {(selectedProperty.amenities.length > 0 ||
                selectedProperty.common_areas.length > 0 ||
                selectedProperty.pet_friendly ||
                selectedProperty.smart_home ||
                selectedProperty.dishwasher) && (
                <DetailSection title="Features">
                  {selectedProperty.amenities.length > 0 && (
                    <KV k="Amenities" v={selectedProperty.amenities.join(", ")} />
                  )}
                  {selectedProperty.common_areas.length > 0 && (
                    <KV k="Common areas" v={selectedProperty.common_areas.join(", ")} />
                  )}
                  {selectedProperty.pet_friendly && <KV k="Pet friendly" v="Yes" />}
                  {selectedProperty.smart_home && <KV k="Smart home" v="Yes" />}
                  {selectedProperty.dishwasher && <KV k="Dishwasher" v="Yes" />}
                </DetailSection>
              )}

              {selectedProperty.description && (
                <DetailSection title="Description">
                  <p className="text-sm whitespace-pre-wrap">{selectedProperty.description}</p>
                </DetailSection>
              )}

              <DetailSection title={`Photos (${selectedProperty.photo_count})`}>
                {photosLoading ? (
                  <p className="text-sm text-muted-foreground">Loading photos...</p>
                ) : photos.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">
                    <ImageIcon className="h-4 w-4 inline mr-1" />
                    No photos uploaded for this property yet.
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {photos.map((photo) => (
                      <div key={photo.id} className="rounded-md border overflow-hidden">
                        <div className="relative aspect-video bg-muted">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={photo.image_url}
                            alt={photo.room_category}
                            className="object-cover w-full h-full"
                          />
                          <Badge
                            className={`absolute top-2 left-2 text-xs ${
                              photo.status === "approved"
                                ? "bg-green-50 text-green-700 border-green-200"
                                : photo.status === "rejected"
                                ? "bg-red-50 text-red-700 border-red-200"
                                : "bg-yellow-50 text-yellow-700 border-yellow-200"
                            }`}
                          >
                            {photo.status}
                          </Badge>
                        </div>
                        <div className="p-2 space-y-1">
                          <p className="text-xs text-muted-foreground">{photo.room_category || "—"}</p>
                          <div className="flex gap-1">
                            <Button
                              variant={photo.status === "approved" ? "default" : "outline"}
                              size="sm"
                              onClick={() => setPhotoStatus(photo.id, "approved")}
                              disabled={photoSavingId === photo.id}
                              className="flex-1 text-xs"
                            >
                              Approve
                            </Button>
                            <Button
                              variant={photo.status === "rejected" ? "default" : "outline"}
                              size="sm"
                              onClick={() => setPhotoStatus(photo.id, "rejected")}
                              disabled={photoSavingId === photo.id}
                              className="flex-1 text-xs"
                            >
                              Reject
                            </Button>
                            <a
                              href={photo.image_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground px-2"
                              aria-label="Open image in new tab"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
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
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
      <p className="text-sm font-semibold">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="text-muted-foreground min-w-[110px]">{k}:</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}
