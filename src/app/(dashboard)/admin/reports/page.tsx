"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Download,
  DollarSign,
  TrendingUp,
  Tag,
  Users,
  CreditCard,
  CalendarDays,
} from "lucide-react";
import { generateCSV } from "@/lib/admin";

// Steve 5/15 Milestone 4: client asked specifically to "probar con
// módulo de pagos en milestone 4, para obtener datos de ventas".
// /admin/payments shows a raw transaction list with simple cards.
// This page complements it with the analytics view a business owner
// actually needs: revenue trend, top services, promo redemption,
// lead-to-customer funnel, and a one-click CSV export of everything.
//
// All data comes from the existing tables (payments, services,
// promotions, leads, profiles) so no schema change is required.

type PeriodKey = "all" | "ytd" | "30d" | "90d" | "1y";

const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "ytd", label: "Year to date" },
  { value: "1y", label: "Last 12 months" },
  { value: "all", label: "All time" },
];

interface PaymentRow {
  id: string;
  user_id: string;
  service_id: string | null;
  pymes_plan_id: string | null;
  amount: number;
  currency: string;
  payment_type: string | null;
  status: string;
  created_at: string;
}

interface ServiceRow {
  id: string;
  name: string;
}

interface PromoStat {
  id: string;
  code: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  used_count: number;
  max_uses: number | null;
  is_active: boolean;
  valid_until: string | null;
}

interface LeadRow {
  id: string;
  status: string | null;
  created_at: string;
}

function periodCutoff(period: PeriodKey): Date | null {
  const now = new Date();
  switch (period) {
    case "30d":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case "90d":
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case "1y":
      return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    case "ytd":
      return new Date(now.getFullYear(), 0, 1);
    case "all":
    default:
      return null;
  }
}

function formatCurrency(n: number): string {
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  });
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleString(undefined, { month: "short", year: "2-digit" });
}

export default function AdminReportsPage() {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [promos, setPromos] = useState<PromoStat[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodKey>("1y");
  // Steve 6/10 (6-2.md #49): Stripe reconciliation state. Lets
  // admin pull missing payment rows from Stripe when the report
  // sums diverge from the Stripe dashboard.
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Steve 6/5 (6-2.md #28): payments + promotions had admin-only RLS,
  // so the sales role saw CA$0 / 0 transactions even when admin saw
  // real revenue. Service-role API delivers the same data regardless
  // of role.
  const load = useCallback(async () => {
    const res = await fetch("/api/admin/reports", { cache: "no-store" });
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const json = (await res.json()) as {
      payments: PaymentRow[];
      services: ServiceRow[];
      promos: PromoStat[];
      leads: LeadRow[];
    };
    setPayments(json.payments || []);
    setServices(json.services || []);
    setPromos(json.promos || []);
    setLeads(json.leads || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Steve 6/10 (6-2.md #49): figure out whether the current user
  // is admin (and therefore allowed to trigger the Stripe sync).
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      setIsAdmin(profile?.role === "admin");
    })();
  }, []);

  async function reconcileFromStripe() {
    if (!confirm("Pull every paid Stripe checkout session from the last 90 days and insert any that are missing from the payments table? This may take 30s.")) return;
    setReconciling(true);
    setReconcileResult(null);
    try {
      const res = await fetch("/api/admin/stripe/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 90 }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        summary?: {
          stripe_paid_sessions?: number;
          already_in_db?: number;
          inserted?: number;
          missing_user?: number;
        };
        error?: string;
      };
      if (!res.ok) {
        setReconcileResult(`Failed: ${body.error || res.status}`);
        return;
      }
      const s = body.summary || {};
      setReconcileResult(
        `Stripe had ${s.stripe_paid_sessions ?? 0} paid sessions in 90d. ${s.already_in_db ?? 0} already in DB. Inserted ${s.inserted ?? 0} missing rows (${s.missing_user ?? 0} with no matching profile, kept as Unknown).`,
      );
      load();
    } finally {
      setReconciling(false);
    }
  }

  // ─── Filtered payments by selected period ─────────────────────
  const filteredPayments = useMemo(() => {
    const cutoff = periodCutoff(period);
    if (!cutoff) return payments;
    return payments.filter((p) => new Date(p.created_at) >= cutoff);
  }, [payments, period]);

  // ─── Revenue cards ─────────────────────────────────────────────
  const stats = useMemo(() => {
    const completed = filteredPayments.filter((p) => p.status === "completed");
    const pending = filteredPayments.filter((p) => p.status === "pending");
    const refunded = filteredPayments.filter((p) => p.status === "refunded");

    const revenue = completed.reduce((s, p) => s + Number(p.amount), 0);
    const pendingAmt = pending.reduce((s, p) => s + Number(p.amount), 0);
    const refundedAmt = refunded.reduce((s, p) => s + Number(p.amount), 0);
    const txCount = completed.length;
    const avgTx = txCount > 0 ? revenue / txCount : 0;
    const uniqueCustomers = new Set(completed.map((p) => p.user_id)).size;
    return { revenue, pendingAmt, refundedAmt, txCount, avgTx, uniqueCustomers };
  }, [filteredPayments]);

  // ─── Monthly trend (last 12 months regardless of period filter) ──
  const monthlyTrend = useMemo(() => {
    const buckets: Record<string, { revenue: number; tx: number }> = {};
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets[monthKey(d)] = { revenue: 0, tx: 0 };
    }
    for (const p of payments) {
      if (p.status !== "completed") continue;
      const key = monthKey(new Date(p.created_at));
      if (key in buckets) {
        buckets[key].revenue += Number(p.amount);
        buckets[key].tx += 1;
      }
    }
    return Object.entries(buckets).map(([k, v]) => ({
      month: monthLabel(k),
      revenue: Math.round(v.revenue * 100) / 100,
      transactions: v.tx,
    }));
  }, [payments]);

  // ─── Top services by revenue ───────────────────────────────────
  const topServices = useMemo(() => {
    const totals: Record<string, { name: string; revenue: number; count: number }> = {};
    const svcName = (id: string | null) =>
      services.find((s) => s.id === id)?.name || "Other";
    for (const p of filteredPayments) {
      if (p.status !== "completed") continue;
      const key = p.service_id || p.pymes_plan_id || "other";
      const name = p.service_id ? svcName(p.service_id) : p.payment_type || "PYMES plan";
      if (!totals[key]) totals[key] = { name, revenue: 0, count: 0 };
      totals[key].revenue += Number(p.amount);
      totals[key].count += 1;
    }
    return Object.values(totals)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);
  }, [filteredPayments, services]);

  // ─── Promo redemption summary ──────────────────────────────────
  const promoSummary = useMemo(() => {
    return promos.slice(0, 10).map((p) => ({
      ...p,
      remaining: p.max_uses ? Math.max(0, p.max_uses - p.used_count) : null,
    }));
  }, [promos]);

  // ─── Lead → customer funnel ────────────────────────────────────
  const funnel = useMemo(() => {
    const cutoff = periodCutoff(period);
    const inWindow = (iso: string) => !cutoff || new Date(iso) >= cutoff;
    const periodLeads = leads.filter((l) => inWindow(l.created_at));

    const total = periodLeads.length;
    // status taxonomy from leads.status: nuevo, contactado, en_proceso,
    // ganado, perdido. We treat en_proceso + ganado as "in pipeline".
    const contacted = periodLeads.filter(
      (l) => l.status && !["nuevo"].includes(l.status),
    ).length;
    const inPipeline = periodLeads.filter(
      (l) => l.status === "en_proceso" || l.status === "ganado",
    ).length;
    const won = periodLeads.filter((l) => l.status === "ganado").length;
    const completedPayingUsers = new Set(
      filteredPayments.filter((p) => p.status === "completed").map((p) => p.user_id),
    ).size;
    return [
      { stage: "Leads created", count: total },
      { stage: "Contacted", count: contacted },
      { stage: "In pipeline", count: inPipeline },
      { stage: "Won (lead status)", count: won },
      { stage: "Paying customers", count: completedPayingUsers },
    ];
  }, [leads, filteredPayments, period]);

  // ─── CSV export ────────────────────────────────────────────────
  function downloadCSV() {
    const headerRows: Record<string, unknown>[] = [
      {
        section: "REVENUE OVERVIEW",
        period: PERIOD_OPTIONS.find((p) => p.value === period)?.label,
        revenue: stats.revenue,
        pending: stats.pendingAmt,
        refunded: stats.refundedAmt,
        transactions: stats.txCount,
        avg_transaction: stats.avgTx.toFixed(2),
        unique_customers: stats.uniqueCustomers,
      },
    ];
    const monthlyRows = monthlyTrend.map((m) => ({
      section: "MONTHLY TREND",
      month: m.month,
      revenue: m.revenue,
      transactions: m.transactions,
    }));
    const serviceRows = topServices.map((s) => ({
      section: "TOP SERVICES",
      service: s.name,
      revenue: s.revenue,
      transactions: s.count,
    }));
    const promoRows = promoSummary.map((p) => ({
      section: "PROMO CODES",
      code: p.code,
      discount: p.discount_type === "percentage" ? `${p.discount_value}%` : `$${p.discount_value}`,
      used: p.used_count,
      max_uses: p.max_uses ?? "unlimited",
      is_active: p.is_active,
      valid_until: p.valid_until || "",
    }));
    const funnelRows = funnel.map((f) => ({ section: "FUNNEL", ...f }));
    const allRows = [
      ...headerRows,
      ...monthlyRows,
      ...serviceRows,
      ...promoRows,
      ...funnelRows,
    ];
    const allColumns = Array.from(
      new Set(allRows.flatMap((r) => Object.keys(r))),
    ).map((k) => ({ key: k, label: k }));
    const csv = generateCSV(allRows, allColumns);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sales-report-${period}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading report…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Sales Report</h1>
          <p className="text-muted-foreground">
            Revenue, transaction trends, and promo redemption analytics.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={(v: string | null) => v && setPeriod(v as PeriodKey)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={downloadCSV}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          {/* Steve 6/10 (6-2.md #49): admin can sync missing payments
              from Stripe when the totals diverge from the Stripe
              dashboard (e.g., after a CASCADE cleanup or a missed
              webhook). Admin-only — the endpoint will refuse other
              roles. */}
          {isAdmin && (
            <Button variant="outline" onClick={reconcileFromStripe} disabled={reconciling}>
              {reconciling ? "Syncing…" : "Sync from Stripe"}
            </Button>
          )}
        </div>
      </div>

      {reconcileResult && (
        <div
          className={`rounded-md border p-3 text-sm ${
            reconcileResult.startsWith("Failed")
              ? "border-red-300 bg-red-50 text-red-800"
              : "border-green-300 bg-green-50 text-green-800"
          }`}
        >
          {reconcileResult}
        </div>
      )}

      {/* ─── Revenue cards ───────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(stats.revenue)}</p>
            <p className="text-xs text-muted-foreground">{stats.txCount} completed transactions</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg. transaction</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(stats.avgTx)}</p>
            <p className="text-xs text-muted-foreground">across the period</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Paying customers</CardTitle>
            <Users className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.uniqueCustomers}</p>
            <p className="text-xs text-muted-foreground">unique users with completed payments</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pending & refunded</CardTitle>
            <CreditCard className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatCurrency(stats.pendingAmt)}
            </p>
            <p className="text-xs text-muted-foreground">
              pending · {formatCurrency(stats.refundedAmt)} refunded
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ─── Monthly trend ───────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4" />
            Revenue — last 12 months
          </CardTitle>
          <CardDescription>Completed payments grouped by month (CAD)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyTrend} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="month" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  formatter={(value, name) => {
                    const v = Number(value);
                    return name === "revenue"
                      ? [formatCurrency(v), "Revenue"]
                      : [String(v), "Transactions"];
                  }}
                />
                <Legend />
                <Line type="monotone" dataKey="revenue" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="transactions" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* ─── Top services + Funnel side by side ──────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top services by revenue</CardTitle>
            <CardDescription>{PERIOD_OPTIONS.find((p) => p.value === period)?.label}</CardDescription>
          </CardHeader>
          <CardContent>
            {topServices.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No completed payments in this period.
              </p>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topServices} layout="vertical" margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis type="number" fontSize={11} tickFormatter={(v) => `$${v}`} />
                    <YAxis dataKey="name" type="category" width={120} fontSize={11} />
                    <Tooltip
                      formatter={(value) => [formatCurrency(Number(value)), "Revenue"]}
                    />
                    <Bar dataKey="revenue" fill="#16a34a" radius={[0, 4, 4, 0]}>
                      {topServices.map((_, idx) => (
                        <Cell key={idx} fill={["#16a34a", "#22c55e", "#4ade80", "#86efac", "#bbf7d0"][idx % 5]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lead → customer funnel</CardTitle>
            <CardDescription>
              {PERIOD_OPTIONS.find((p) => p.value === period)?.label} · counts from leads + payments
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {funnel.map((step, i) => {
                const max = Math.max(1, ...funnel.map((f) => f.count));
                const pct = (step.count / max) * 100;
                return (
                  <div key={step.stage}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span>{step.stage}</span>
                      <span className="font-mono font-medium">{step.count}</span>
                    </div>
                    <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${
                          ["bg-blue-500", "bg-indigo-500", "bg-purple-500", "bg-pink-500", "bg-green-500"][i % 5]
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              &quot;Paying customers&quot; counts unique user_ids with completed payments,
              regardless of whether the lead status was updated to &quot;ganado&quot;.
              A gap here usually means leads need their status updated manually.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ─── Promo redemptions ───────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Tag className="h-4 w-4" />
            Promo code redemptions
          </CardTitle>
          <CardDescription>Top 10 codes by usage (all time)</CardDescription>
        </CardHeader>
        <CardContent>
          {promoSummary.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No promo codes configured yet. Add one in <code>/admin/pricing</code>.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium py-2">Code</th>
                    <th className="text-left font-medium py-2">Discount</th>
                    <th className="text-right font-medium py-2">Used</th>
                    <th className="text-right font-medium py-2">Max</th>
                    <th className="text-right font-medium py-2">Remaining</th>
                    <th className="text-left font-medium py-2">Status</th>
                    <th className="text-left font-medium py-2">Valid until</th>
                  </tr>
                </thead>
                <tbody>
                  {promoSummary.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="py-2">
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                          {p.code}
                        </code>
                      </td>
                      <td className="py-2">
                        {p.discount_type === "percentage"
                          ? `${p.discount_value}%`
                          : formatCurrency(p.discount_value)}
                      </td>
                      <td className="py-2 text-right font-mono">{p.used_count}</td>
                      <td className="py-2 text-right font-mono">
                        {p.max_uses ?? "—"}
                      </td>
                      <td className="py-2 text-right font-mono">
                        {p.remaining ?? "—"}
                      </td>
                      <td className="py-2">
                        <Badge variant={p.is_active ? "default" : "outline"}>
                          {p.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="py-2 text-xs text-muted-foreground">
                        {p.valid_until
                          ? new Date(p.valid_until).toLocaleDateString("en-CA")
                          : "no expiry"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
