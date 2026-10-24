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
import { Download, Scale } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/admin";
import type {
  ComparisonDays,
  ComparisonStatus,
  StripeDbComparison,
} from "@/lib/stripe-db-comparison";

// Sales Report → Stripe vs Database (admin + sales). Read-only. Data is
// built server-side by src/lib/stripe-db-comparison.ts; this component
// only requests and renders it. It never runs on page load because it
// queries Stripe.

const DAY_OPTIONS: ComparisonDays[] = [30, 60, 90];

const STATUS_BADGE_CLASSES: Record<ComparisonStatus, string> = {
  ok: "bg-green-50 text-green-700 border-green-200",
  missing_in_database: "bg-red-50 text-red-700 border-red-200",
  not_in_stripe: "bg-orange-50 text-orange-800 border-orange-200",
  amount_differs: "bg-amber-50 text-amber-800 border-amber-200",
  refunded_still_completed: "bg-purple-50 text-purple-700 border-purple-200",
};

// Same widths on every render so the table stays aligned. Date, Customer,
// Scope, Type, Stripe, Database, Difference, Status, Note.
const COL_WIDTHS: string[] = ["100px", "200px", "190px", "120px", "110px", "110px", "110px", "220px", "240px"];

function money(n: number): string {
  return formatCurrency(n);
}

export function StripeComparisonSection() {
  const [days, setDays] = useState<ComparisonDays>(90);
  const [report, setReport] = useState<StripeDbComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onlyDifferences, setOnlyDifferences] = useState(false);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/reports/stripe-comparison?days=${days}`, { cache: "no-store" });
      const body = (await res.json().catch(() => null)) as (StripeDbComparison & { error?: string }) | null;
      if (!res.ok || !body || body.error) {
        setError(body?.error || `The comparison could not be completed (${res.status}).`);
        setReport(null);
        return;
      }
      setReport(body);
    } catch {
      setError("The comparison could not be completed. Please try again later.");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  async function downloadCsv() {
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/reports/stripe-comparison?days=${days}&format=csv`, { cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error || `The CSV could not be generated (${res.status}).`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `stripe-vs-database-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("The CSV could not be generated. Please try again later.");
    } finally {
      setDownloading(false);
    }
  }

  const visibleRows = useMemo(() => {
    if (!report) return [];
    return onlyDifferences ? report.rows.filter((r) => r.difference !== 0) : report.rows;
  }, [report, onlyDifferences]);

  const matches = !!report && report.totals.difference === 0 && report.rowsWithDifference === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Scale className="h-4 w-4" />
          Stripe vs Database
        </CardTitle>
        <CardDescription>
          Compares the last {days} days. Only completed payments are counted in the database. If
          there is a difference, check Stripe (Payments and Payout reconciliation) and the bank.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {DAY_OPTIONS.map((option) => (
            <Button
              key={option}
              size="sm"
              variant={days === option ? "default" : "outline"}
              onClick={() => setDays(option)}
              disabled={loading}
            >
              {option} days
            </Button>
          ))}
          <Button size="sm" onClick={run} disabled={loading}>
            {loading ? "Comparing…" : "Run comparison"}
          </Button>
          <Button size="sm" variant="outline" onClick={downloadCsv} disabled={downloading || loading}>
            <Download className="mr-1 h-4 w-4" />
            {downloading ? "Preparing…" : "Download CSV"}
          </Button>
        </div>

        {error && (
          <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>
        )}

        {!report && !error && !loading && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Choose a period and press &quot;Run comparison&quot;. It reads Stripe and may take up to a minute.
          </p>
        )}

        {report && (
          <>
            {report.truncated && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                Stripe or the database returned more items than the limit (1,000 per list). Results are
                incomplete — choose a shorter period.
              </div>
            )}
            {report.warnings.map((warning) => (
              <div key={warning} className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                {warning}
              </div>
            ))}

            {matches ? (
              <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm font-medium text-green-800">
                Everything matches (Difference 0).
              </div>
            ) : (
              <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                Difference: <span className="font-bold">{money(report.totals.difference)}</span> ·{" "}
                {report.rowsWithDifference} {report.rowsWithDifference === 1 ? "payment" : "payments"} with a
                difference.
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] table-fixed text-sm">
                <colgroup>
                  <col style={{ width: "220px" }} />
                  <col style={{ width: "130px" }} />
                  <col style={{ width: "130px" }} />
                  <col style={{ width: "140px" }} />
                </colgroup>
                <thead className="border-b text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Group</th>
                    <th className="px-3 py-2 text-right font-medium">Stripe (net)</th>
                    <th className="px-3 py-2 text-right font-medium">Database</th>
                    <th className="px-3 py-2 text-right font-medium">Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {report.groups.map((g) => (
                    <tr key={g.group} className="border-b">
                      <td className="px-3 py-2">{g.label}</td>
                      <td className="px-3 py-2 text-right font-mono">{money(g.stripe)}</td>
                      <td className="px-3 py-2 text-right font-mono">{money(g.database)}</td>
                      <td className={`px-3 py-2 text-right font-mono ${g.difference !== 0 ? "font-bold text-red-700" : ""}`}>
                        {money(g.difference)}
                      </td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="px-3 py-2">Total</td>
                    <td className="px-3 py-2 text-right font-mono">{money(report.totals.stripe)}</td>
                    <td className="px-3 py-2 text-right font-mono">{money(report.totals.database)}</td>
                    <td className={`px-3 py-2 text-right font-mono ${report.totals.difference !== 0 ? "text-red-700" : "text-green-700"}`}>
                      {money(report.totals.difference)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {formatDate(report.periodStart)} – {formatDate(report.periodEnd)} · {report.rows.length} payments
              </p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={onlyDifferences}
                  onChange={(e) => setOnlyDifferences(e.target.checked)}
                />
                Show only differences
              </label>
            </div>

            {visibleRows.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {onlyDifferences ? "No payments with a difference." : "No payments in this period."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1400px] table-fixed text-sm">
                  <colgroup>
                    {COL_WIDTHS.map((width, i) => (
                      <col key={i} style={{ width }} />
                    ))}
                  </colgroup>
                  <thead className="border-b text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Date</th>
                      <th className="px-3 py-2 text-left font-medium">Customer</th>
                      <th className="px-3 py-2 text-left font-medium">Scope</th>
                      <th className="px-3 py-2 text-left font-medium">Type</th>
                      <th className="px-3 py-2 text-right font-medium">Stripe (net)</th>
                      <th className="px-3 py-2 text-right font-medium">Database</th>
                      <th className="px-3 py-2 text-right font-medium">Difference</th>
                      <th className="px-3 py-2 text-left font-medium">Status</th>
                      <th className="px-3 py-2 text-left font-medium">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((r) => (
                      <tr key={r.key} className="border-b align-top last:border-0">
                        <td className="whitespace-nowrap px-3 py-2 text-xs">{formatDate(r.date)}</td>
                        <td className="px-3 py-2">
                          <div className="truncate" title={r.customerName}>{r.customerName}</div>
                          <div className="truncate text-xs text-muted-foreground" title={r.customerEmail || undefined}>
                            {r.customerEmail || "—"}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="truncate" title={r.scope}>{r.scope}</div>
                          <div className="text-xs text-muted-foreground">{r.groupLabel}</div>
                        </td>
                        <td className="px-3 py-2 text-xs">{r.paymentTypeLabel}</td>
                        <td className="px-3 py-2 text-right font-mono">
                          {money(r.stripeAmount)}
                          {r.stripeRefunded > 0 && (
                            <div className="text-xs text-muted-foreground">−{money(r.stripeRefunded)} refunded</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{money(r.databaseAmount)}</td>
                        <td className={`px-3 py-2 text-right font-mono ${r.difference !== 0 ? "font-bold text-red-700" : ""}`}>
                          {money(r.difference)}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className={`h-auto whitespace-normal ${STATUS_BADGE_CLASSES[r.status]}`}>
                            {r.statusLabel}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{r.note || ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
