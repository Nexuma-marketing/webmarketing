"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { DataTable } from "@/components/dashboard/data-table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { SERVICE_TIERS, ELITE_TIERS } from "@/lib/constants";
import type { ColumnDef } from "@tanstack/react-table";

interface PropertyRow {
  id: string;
  address: string;
  city: string;
  monthly_rent: number | null;
  is_available: boolean;
  service_tier: string | null;
  elite_tier: string | null;
  bedrooms: number | null;
  created_at: string;
  owner_name: string;
  owner_email: string;
  owner_phone: string;
}

export default function AdminPropertiesPage() {
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [loading, setLoading] = useState(true);

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
  ];

  const tierOptions = Object.entries(SERVICE_TIERS).map(([value, label]) => ({
    value,
    label,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">Property Management</h1>
        <p className="text-muted-foreground">
          View and manage all registered properties
        </p>
      </div>

      <DataTable
        columns={columns}
        data={properties}
        loading={loading}
        searchKey="address"
        searchPlaceholder="Search by address..."
        filters={[
          {
            key: "service_tier",
            label: "Tier",
            options: tierOptions,
          },
        ]}
      />
    </div>
  );
}
