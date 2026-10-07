"use client";

import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowDown, ArrowUp, ArrowUpDown, Building2, Download } from "lucide-react";
import { formatCurrency, generateCSV } from "@/lib/admin";
import type {
  PropertyBalanceStatus,
  PropertyPaymentSummaryRow,
} from "@/lib/property-payment-summary";

// Sales Report → payment summary, one row per property (Property Owner
// + Investor). Rows are built server-side by
// src/lib/property-payment-summary.ts; this component only sorts,
// filters and renders them.

const STATUS_LABELS: Record<PropertyBalanceStatus, string> = {
  fully_paid: "Fully paid",
  pending_balance: "Pending balance",
  awaiting_lease: "Awaiting tenant lease signed",
  no_plan: "No plan purchased",
};

const STATUS_BADGE_CLASSES: Record<PropertyBalanceStatus, string> = {
  fully_paid: "bg-green-50 text-green-700 border-green-200",
  pending_balance: "bg-amber-50 text-amber-800 border-amber-200",
  awaiting_lease: "bg-blue-50 text-blue-700 border-blue-200",
  no_plan: "bg-muted text-muted-foreground border-border",
};

type StatusFilter = "all" | "owes" | PropertyBalanceStatus;

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All properties" },
  { value: "owes", label: "With pending balance" },
  { value: "pending_balance", label: STATUS_LABELS.pending_balance },
  { value: "awaiting_lease", label: STATUS_LABELS.awaiting_lease },
  { value: "fully_paid", label: STATUS_LABELS.fully_paid },
  { value: "no_plan", label: STATUS_LABELS.no_plan },
];

type SortKey =
  | "address"
  | "ownerName"
  | "plan"
  | "upfrontPaid"
  | "priorityListingPaid"
  | "pendingBalance"
  | "totalPaid"
  | "status";

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: "address", label: "Property" },
  { key: "ownerName", label: "Owner" },
  { key: "plan", label: "Plan" },
  { key: "upfrontPaid", label: "Upfront paid", numeric: true },
  { key: "priorityListingPaid", label: "Priority listing", numeric: true },
  { key: "pendingBalance", label: "Pending balance", numeric: true },
  { key: "totalPaid", label: "Total paid to date", numeric: true },
  { key: "status", label: "Balance status" },
];

function sortValue(row: PropertyPaymentSummaryRow, key: SortKey): string | number {
  switch (key) {
    case "upfrontPaid":
    case "priorityListingPaid":
    case "pendingBalance":
    case "totalPaid":
      return row[key];
    case "status":
      return STATUS_LABELS[row.status];
    case "plan":
      return row.plan || "";
    default:
      return row[key];
  }
}

export function PropertyPaymentSummaryTable({ rows }: { rows: PropertyPaymentSummaryRow[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  // Default: who owes the most, first.
  const [sortKey, setSortKey] = useState<SortKey>("pendingBalance");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const visibleRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (statusFilter === "owes" && row.pendingBalance <= 0) return false;
      if (statusFilter !== "all" && statusFilter !== "owes" && row.status !== statusFilter) return false;
      if (!term) return true;
      return [row.address, row.ownerName, row.ownerEmail, row.plan]
        .some((value) => value?.toLowerCase().includes(term));
    });
    const direction = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return cmp !== 0 ? cmp * direction : a.address.localeCompare(b.address);
    });
  }, [rows, search, statusFilter, sortKey, sortDir]);

  const totals = useMemo(
    () => ({
      pending: visibleRows.reduce((sum, row) => sum + row.pendingBalance, 0),
      paid: visibleRows.reduce((sum, row) => sum + row.totalPaid, 0),
      owing: visibleRows.filter((row) => row.pendingBalance > 0).length,
    }),
    [visibleRows],
  );

  function toggleSort(key: SortKey, numeric?: boolean) {
    if (key === sortKey) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(numeric ? "desc" : "asc");
    }
  }

  function downloadCSV() {
    const csv = generateCSV(
      visibleRows.map((row) => ({
        ...row,
        plan: row.plan || "",
        status: STATUS_LABELS[row.status],
        statusDetail: row.statusDetail || "",
      })),
      [
        { key: "address", label: "Property" },
        { key: "ownerName", label: "Owner" },
        { key: "ownerEmail", label: "Owner email" },
        { key: "plan", label: "Plan" },
        { key: "upfrontPaid", label: "Upfront paid (CAD)" },
        { key: "pendingBalance", label: "Pending balance (CAD)" },
        { key: "balancePaid", label: "Balance paid (CAD)" },
        { key: "priorityListingPaid", label: "Priority listing add-on paid (CAD)" },
        { key: "otherPaid", label: "Other paid (CAD)" },
        { key: "totalPaid", label: "Total paid to date (CAD)" },
        { key: "status", label: "Balance status" },
        { key: "statusDetail", label: "Status detail" },
      ],
    );
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `property-payment-summary-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-4 w-4" />
          Payment summary by property
        </CardTitle>
        <CardDescription>
          Property Owner and Investor properties, all time (CAD). Pending balance uses the same
          calculation the client sees in their Payment History. Priority listing is the $100 add-on,
          shown separately from the plan upfront and balance.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search address, owner or plan…"
            className="sm:max-w-xs"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            aria-label="Filter by balance status"
            className="h-10 rounded-lg border border-input bg-transparent px-3 text-sm"
          >
            {STATUS_FILTERS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <Button variant="outline" onClick={downloadCSV} disabled={visibleRows.length === 0} className="sm:ml-auto">
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          {visibleRows.length} {visibleRows.length === 1 ? "property" : "properties"} ·{" "}
          <span className="font-medium text-foreground">{formatCurrency(totals.pending)}</span> pending across{" "}
          {totals.owing} · <span className="font-medium text-foreground">{formatCurrency(totals.paid)}</span> paid to date
        </p>

        {visibleRows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {rows.length === 0 ? "No properties yet." : "No properties match these filters."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-muted-foreground">
                <tr>
                  {COLUMNS.map((col) => {
                    const active = col.key === sortKey;
                    const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
                    return (
                      <th
                        key={col.key}
                        aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                        className={`py-2 pr-3 font-medium ${col.numeric ? "text-right" : "text-left"}`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleSort(col.key, col.numeric)}
                          className={`inline-flex items-center gap-1 whitespace-nowrap hover:text-foreground ${active ? "text-foreground" : ""}`}
                        >
                          {col.label}
                          <Icon className={`h-3 w-3 ${active ? "" : "opacity-40"}`} />
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.propertyId} className="border-b last:border-0 align-top">
                    <td className="py-2 pr-3">{row.address}</td>
                    <td className="py-2 pr-3">
                      {row.ownerName}
                      {row.ownerEmail && row.ownerEmail !== row.ownerName && (
                        <span className="block text-xs text-muted-foreground">{row.ownerEmail}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">{row.plan || "—"}</td>
                    <td className="py-2 pr-3 text-right font-mono">{formatCurrency(row.upfrontPaid)}</td>
                    <td className="py-2 pr-3 text-right font-mono">
                      {row.priorityListingPaid > 0 ? formatCurrency(row.priorityListingPaid) : "—"}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono font-medium">
                      {row.pendingBalance > 0 ? formatCurrency(row.pendingBalance) : "—"}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono">{formatCurrency(row.totalPaid)}</td>
                    <td className="py-2 pr-3">
                      <Badge variant="outline" className={STATUS_BADGE_CLASSES[row.status]}>
                        {STATUS_LABELS[row.status]}
                      </Badge>
                      {row.statusDetail && (
                        <span className="mt-0.5 block text-xs text-muted-foreground">{row.statusDetail}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
