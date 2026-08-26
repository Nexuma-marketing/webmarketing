"use client";

import { useEffect, useState, useCallback } from "react";
import { DataTable } from "@/components/dashboard/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PropertyDetailModal } from "@/components/admin/property-detail-modal";
import { Eye, Search as SearchIcon } from "lucide-react";
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

export default function AdminPropertiesPage() {
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Steve 6/9 (6-2.md #41): detail modal state for the new View
  // button. selectedProperty drives both visibility and content;
  // photos load on open via the per-property endpoint.
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  // Steve 6/9 (6-2.md #42): multi-field search state (was previously
  // address-only inside DataTable). See filteredProperties below.
  const [propertySearch, setPropertySearch] = useState("");
  // Steve 6/9 (6-2.md #44): plan details (tagline + features) fetched
  // when the modal opens — sales asked for the full plan breakdown
  // alongside the tier badge.

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

  // Steve 6/10 (6-2.md #45): route the toggle through the
  // service-role PATCH endpoint so sales can flip availability
  // when a property goes off the market (contract signed) or
  // comes back on. Optimistic update + revert on error so the
  // switch doesn't lag.
  async function toggleAvailability(id: string, current: boolean) {
    const next = !current;
    setProperties((prev) =>
      prev.map((p) => (p.id === id ? { ...p, is_available: next } : p)),
    );
    const res = await fetch("/api/admin/properties", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, is_available: next }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      alert(`Availability change failed: ${body.error || res.status}`);
      // revert the optimistic update
      setProperties((prev) =>
        prev.map((p) => (p.id === id ? { ...p, is_available: current } : p)),
      );
    }
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
          onClick={() => setSelectedPropertyId(row.original.id)}
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

      <PropertyDetailModal
        propertyId={selectedPropertyId}
        onClose={() => setSelectedPropertyId(null)}
        onPhotoStatusChanged={loadProperties}
      />
    </div>
  );
}
