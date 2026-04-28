"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, Database, Users, Building2, FileText, CreditCard } from "lucide-react";
import { generateCSV } from "@/lib/admin";

type ExportTarget = "users" | "properties" | "leads" | "payments";

interface ExportConfig {
  target: ExportTarget;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

const EXPORT_TARGETS: ExportConfig[] = [
  {
    target: "users",
    label: "Users",
    icon: Users,
    description: "Export all user profiles with roles and registration dates",
  },
  {
    target: "properties",
    label: "Properties",
    icon: Building2,
    description: "Export all properties with tiers, pricing, and availability",
  },
  {
    target: "leads",
    label: "Leads",
    icon: FileText,
    description: "Export all leads with status and contact information",
  },
  {
    target: "payments",
    label: "Payments",
    icon: CreditCard,
    description: "Export all payment transactions with amounts and statuses",
  },
];

const COLUMN_DEFS: Record<ExportTarget, { key: string; label: string }[]> = {
  users: [
    { key: "full_name", label: "Name" },
    { key: "email", label: "Email" },
    { key: "role", label: "Role" },
    { key: "phone", label: "Phone" },
    { key: "property_count", label: "Properties" },
    { key: "is_premium_tenant", label: "Premium Tenant" },
    { key: "created_at", label: "Registered" },
  ],
  properties: [
    { key: "address", label: "Address" },
    { key: "city", label: "City" },
    { key: "province", label: "Province" },
    { key: "property_type", label: "Type" },
    { key: "monthly_rent", label: "Monthly Rent" },
    { key: "bedrooms", label: "Bedrooms" },
    { key: "bathrooms", label: "Bathrooms" },
    { key: "is_available", label: "Available" },
    { key: "service_tier", label: "Service Tier" },
    { key: "elite_tier", label: "Elite Tier" },
    { key: "cfp_monthly", label: "CFP Monthly" },
    { key: "payback_months", label: "Payback Months" },
    { key: "owner_full_name", label: "Owner Name" },
    { key: "owner_email", label: "Owner Email" },
    { key: "owner_phone", label: "Owner Phone" },
    { key: "created_at", label: "Created" },
  ],
  leads: [
    { key: "full_name", label: "Name" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "role", label: "Role" },
    { key: "source", label: "Source" },
    { key: "status", label: "Status" },
    { key: "notes", label: "Notes" },
    { key: "created_at", label: "Created" },
  ],
  payments: [
    { key: "user_email", label: "User Email" },
    { key: "amount", label: "Amount" },
    { key: "currency", label: "Currency" },
    { key: "payment_type", label: "Type" },
    { key: "status", label: "Status" },
    { key: "created_at", label: "Date" },
  ],
};

export default function AdminExportPage() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [exporting, setExporting] = useState<ExportTarget | null>(null);

  const supabase = createClient();

  async function handleExport(target: ExportTarget) {
    setExporting(target);

    let query;

    switch (target) {
      case "users":
        query = supabase
          .from("profiles")
          .select("full_name, email, role, phone, property_count, is_premium_tenant, created_at");
        if (roleFilter !== "all") {
          query = query.eq("role", roleFilter);
        }
        break;

      case "properties":
        query = supabase
          .from("properties")
          .select("address, city, province, property_type, monthly_rent, bedrooms, bathrooms, is_available, service_tier, elite_tier, cfp_monthly, payback_months, created_at, owner:owner_id(full_name, email, phone)");
        break;

      case "leads":
        query = supabase
          .from("leads")
          .select("full_name, email, phone, role, source, status, notes, created_at, user_id, profiles:user_id(role)");
        if (roleFilter !== "all") {
          query = query.eq("role", roleFilter);
        }
        break;

      case "payments":
        query = supabase
          .from("payments")
          .select("amount, currency, payment_type, status, created_at, profiles:user_id(email)");
        break;
    }

    // Apply date filters
    if (dateFrom) {
      query = query.gte("created_at", `${dateFrom}T00:00:00`);
    }
    if (dateTo) {
      query = query.lte("created_at", `${dateTo}T23:59:59`);
    }

    const { data } = await query.order("created_at", { ascending: false });

    if (data && data.length > 0) {
      const rawData = data as Record<string, unknown>[];
      let processedData: Record<string, unknown>[] = rawData;

      if (target === "payments") {
        processedData = rawData.map((row) => ({
          ...row,
          user_email: (row.profiles as { email: string } | null)?.email || "",
        }));
      } else if (target === "properties") {
        processedData = rawData.map((row) => {
          const owner = row.owner as { full_name: string; email: string; phone: string | null } | null;
          return {
            ...row,
            owner_full_name: owner?.full_name || "",
            owner_email: owner?.email || "",
            owner_phone: owner?.phone || "",
          };
        });
      } else if (target === "leads") {
        // Steve 4/28: leads.role can be NULL when the lead came from a public
        // form (contact_form). Fall back to the linked profile's role so the
        // CSV is never blank in column "Role".
        processedData = rawData.map((row) => {
          const profile = row.profiles as { role: string } | null;
          return {
            ...row,
            role: row.role || profile?.role || "",
          };
        });
      }

      const csv = generateCSV(
        processedData as Record<string, unknown>[],
        COLUMN_DEFS[target]
      );

      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${target}_export_${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }

    setExporting(null);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">Data Export</h1>
        <p className="text-muted-foreground">
          Export platform data as CSV files
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="h-4 w-4" />
            Export Filters
          </CardTitle>
          <CardDescription>
            Apply filters before exporting. Leave blank for all records.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <Label>Date From</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-[180px]"
              />
            </div>
            <div className="space-y-2">
              <Label>Date To</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-[180px]"
              />
            </div>
            <div className="space-y-2">
              <Label>Role (Users + Leads)</Label>
              <Select value={roleFilter} onValueChange={(v) => v && setRoleFilter(v)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="propietario">Property Owner</SelectItem>
                  <SelectItem value="propietario_preferido">Preferred Owner</SelectItem>
                  <SelectItem value="inversionista">Investor</SelectItem>
                  <SelectItem value="inquilino">Tenant</SelectItem>
                  <SelectItem value="inquilino_premium">Premium Tenant</SelectItem>
                  <SelectItem value="pymes">Business Owner</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(dateFrom || dateTo || roleFilter !== "all") && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                  setRoleFilter("all");
                }}
              >
                Clear Filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Export cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {EXPORT_TARGETS.map((config) => (
          <Card key={config.target}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <config.icon className="h-4 w-4" />
                  {config.label}
                </CardTitle>
                <Badge variant="outline" className="text-xs">
                  {COLUMN_DEFS[config.target].length} columns
                </Badge>
              </div>
              <CardDescription>{config.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1 mb-4">
                {COLUMN_DEFS[config.target].map((col) => (
                  <Badge key={col.key} variant="secondary" className="text-xs">
                    {col.label}
                  </Badge>
                ))}
              </div>
              <Button
                onClick={() => handleExport(config.target)}
                disabled={exporting !== null}
                className="w-full"
              >
                <Download className="mr-2 h-4 w-4" />
                {exporting === config.target
                  ? "Exporting..."
                  : `Export ${config.label} as CSV`}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
