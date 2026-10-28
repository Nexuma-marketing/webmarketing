"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { DataTable } from "@/components/dashboard/data-table";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DollarSign, CreditCard, TrendingUp, Tag } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { stripeDashboardPaymentUrl } from "@/lib/stripe-dashboard";
import { promoDateStatus } from "@/lib/promotions";
import { createClient } from "@/lib/supabase/client";
import {
  CancelSubscriptionDialog,
  type CancelMode,
  type CancelTarget,
} from "@/components/admin/cancel-subscription-dialog";

interface PaymentRow {
  id: string;
  user_name: string;
  user_email: string;
  service_name: string;
  amount: number;
  // FIX_REFUND_VISIBILITY_REPORT.md: cumulative amount refunded in
  // Stripe (dollars). > 0 on a 'completed' row = partial refund.
  refunded_amount: number;
  currency: string;
  payment_type: string | null;
  installment_number: number | null;
  status: string;
  created_at: string;
  // Steve 5/16 Milestone 4: extra columns drive the refund / cancel
  // action buttons in the actions cell. We never expose them in the
  // visible table, only use them to decide which buttons render.
  stripe_payment_intent_id: string | null;
  stripe_subscription_id: string | null;
  stripe_session_id: string | null;
}

interface PromoStat {
  id: string;
  code: string;
  used_count: number;
  max_uses: number | null;
  is_active: boolean;
  valid_from: string | null;
  valid_until: string | null;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  // FIX_PROMOTIONS_REPORT.md: from promotion_redemptions.
  discount_total: number;
  over_limit: number;
}

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  completed: "default",
  pending: "secondary",
  failed: "destructive",
  refunded: "outline",
  canceled: "outline",
};

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [promoStats, setPromoStats] = useState<PromoStat[]>([]);
  const [loading, setLoading] = useState(true);

  // Steve 5/22 Milestone 4: client-side embedded join on profiles:user_id
  // returned null for every row → "Unknown" everywhere. Switched to a
  // server-side service-role route that joins manually. Same shape, no
  // RLS/FK introspection traps.
  const loadPayments = useCallback(async () => {
    const res = await fetch("/api/admin/payments", { cache: "no-store" });
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const json = (await res.json()) as { payments: PaymentRow[]; promoStats: PromoStat[] };
    setPayments(json.payments || []);
    setPromoStats(json.promoStats || []);
    setLoading(false);
  }, []);

  // Steve 5/16 Milestone 4: admin actions — issue a Stripe refund or
  // cancel an installment subscription. The webhook writes the
  // status/timestamp back into the row; we re-load to pick that up.
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  // FIX_REFUND_VISIBILITY_REPORT.md: the webhook updates the row a few
  // seconds after the refund is requested, so re-load at 4s and 10s.
  const reloadTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => reloadTimers.current.forEach(clearTimeout), []);

  async function handleRefund(row: PaymentRow) {
    // Stripe refunds what is left on the charge (amount − refunded_amount).
    const refunded = row.refunded_amount || 0;
    const remaining = row.amount - refunded;
    const question =
      refunded > 0
        ? `Refund $${remaining.toFixed(2)} ${row.currency} of $${row.amount.toFixed(2)} (already refunded $${refunded.toFixed(2)}) to ${row.user_name}?`
        : `Refund $${row.amount.toFixed(2)} ${row.currency} to ${row.user_name}?`;
    if (!confirm(
      `${question}\n\n` +
      "This issues a Stripe refund. The payment row will be marked 'refunded' once Stripe fires the webhook (usually within seconds).",
    )) return;
    setActionBusy(row.id);
    setActionMsg(null);
    const res = await fetch("/api/admin/stripe/refund", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId: row.id }),
    });
    const json = await res.json().catch(() => ({}));
    setActionBusy(null);
    if (!res.ok) {
      setActionMsg(`Error: ${json.error || res.statusText}`);
      return;
    }
    setActionMsg("Refund requested. The status updates in a few seconds.");
    reloadTimers.current.forEach(clearTimeout);
    reloadTimers.current = [
      setTimeout(() => loadPayments(), 4000),
      setTimeout(() => loadPayments(), 10000),
      setTimeout(() => setActionMsg(null), 12000),
    ];
  }

  // BUGFIX_CANCELLATIONS_PANEL.md: "Cancel sub" opens the shared modal
  // (mandatory reason, end of period or now). The route resolves the
  // subscription from the payment row and enforces roles: "Cancel now"
  // is offered to admin only.
  const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null);
  const [cancelModes, setCancelModes] = useState<CancelMode[]>(["end_of_period"]);
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      const modes: CancelMode[] = profile?.role === "admin" ? ["end_of_period", "now"] : ["end_of_period"];
      setCancelModes(modes);
    })();
  }, []);

  function handleCancelSubscription(row: PaymentRow) {
    if (!row.stripe_subscription_id) return;
    setActionMsg(null);
    setCancelTarget({ paymentId: row.id, clientName: row.user_name, planName: row.service_name });
  }

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const totalRevenue = payments
    .filter((p) => p.status === "completed")
    .reduce((sum, p) => sum + p.amount, 0);

  const pendingAmount = payments
    .filter((p) => p.status === "pending")
    .reduce((sum, p) => sum + p.amount, 0);

  const columns: ColumnDef<PaymentRow>[] = [
    {
      accessorKey: "created_at",
      header: "Date",
      cell: ({ row }) =>
        new Date(row.getValue("created_at")).toLocaleDateString("en-CA"),
    },
    {
      accessorKey: "user_name",
      header: "User",
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.getValue("user_name")}</p>
          <p className="text-xs text-muted-foreground">{row.original.user_email}</p>
        </div>
      ),
    },
    {
      accessorKey: "service_name",
      header: "Service / Plan",
    },
    {
      accessorKey: "amount",
      header: "Amount",
      cell: ({ row }) =>
        `$${(row.getValue("amount") as number).toLocaleString()} ${row.original.currency}`,
    },
    {
      accessorKey: "refunded_amount",
      header: "Refunded",
      cell: ({ row }) => {
        const refunded = row.original.refunded_amount || 0;
        return refunded > 0
          ? `$${refunded.toLocaleString()} ${row.original.currency}`
          : "—";
      },
    },
    {
      accessorKey: "payment_type",
      header: "Type",
      cell: ({ row }) => {
        const type = row.getValue("payment_type") as string | null;
        // BUGFIX_ELITE_PYME_SUBSCRIPTIONS.md: marker row written when an
        // Elite/PYME monthly subscription couldn't be created; the daily
        // reconcile flips it to "canceled" once resolved/dismissed.
        if (type === "subscription_setup_failed") {
          return row.original.status === "failed" ? (
            <span className="font-medium text-destructive">Subscription setup failed — action needed</span>
          ) : (
            <span className="text-muted-foreground">Subscription setup failed — resolved</span>
          );
        }
        // Cancellation marker rows (amount 0): the Status column already says "Canceled".
        if (type === "subscription_canceled") return <span>Subscription</span>;
        return (
          <span className="capitalize">{type?.replace("_", " ") || "One-time"}</span>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.getValue("status") as string;
        const partiallyRefunded = status === "completed" && (row.original.refunded_amount || 0) > 0;
        return (
          <div className="flex flex-wrap items-center gap-1">
            <Badge
              variant={STATUS_VARIANTS[status] || "secondary"}
              className={status === "canceled" ? "capitalize text-muted-foreground" : "capitalize"}
            >
              {status}
            </Badge>
            {partiallyRefunded && (
              <Badge variant="outline" className="text-xs">
                Partially refunded
              </Badge>
            )}
          </div>
        );
      },
      filterFn: "equals",
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const p = row.original;
        // Hidden once nothing is left to refund (amount − refunded_amount).
        const canRefund =
          p.status === "completed" &&
          !!p.stripe_payment_intent_id &&
          Math.round((p.amount - (p.refunded_amount || 0)) * 100) > 0;
        const canCancel = !!p.stripe_subscription_id && p.status !== "canceled";
        const stripeUrl = stripeDashboardPaymentUrl(p);
        if (!canRefund && !canCancel && !stripeUrl) {
          return <span className="text-xs text-muted-foreground">—</span>;
        }
        return (
          <div className="flex gap-1">
            {stripeUrl && (
              <a
                href={stripeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50"
              >
                Stripe ↗
              </a>
            )}
            {canRefund && (
              <button
                type="button"
                disabled={actionBusy === p.id}
                onClick={() => handleRefund(p)}
                className="rounded border border-red-300 px-2 py-0.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                {actionBusy === p.id ? "…" : "Refund"}
              </button>
            )}
            {canCancel && (
              <button
                type="button"
                disabled={actionBusy === p.id}
                onClick={() => handleCancelSubscription(p)}
                className="rounded border border-amber-300 px-2 py-0.5 text-xs text-amber-700 hover:bg-amber-50 disabled:opacity-50"
              >
                {actionBusy === p.id ? "…" : "Cancel sub"}
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <CancelSubscriptionDialog
        target={cancelTarget}
        allowedModes={cancelModes}
        initialMode="end_of_period"
        onClose={() => setCancelTarget(null)}
        onDone={(message) => {
          if (message) {
            setActionMsg(message);
            setTimeout(() => setActionMsg(null), 8000);
          }
          loadPayments();
        }}
      />
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">Payment Management</h1>
        <p className="text-muted-foreground">
          View all payments and revenue reports
        </p>
      </div>

      {actionMsg && (
        <div
          className={`rounded-md border p-3 text-sm ${
            actionMsg.startsWith("Error")
              ? "border-red-300 bg-red-50 text-red-800"
              : "border-green-300 bg-green-50 text-green-800"
          }`}
        >
          {actionMsg}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${totalRevenue.toLocaleString()} CAD
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${pendingAmount.toLocaleString()} CAD
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Transactions</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{payments.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Steve 5/4 Milestone 4: promo redemption metrics. Sorted by
          used_count descending so top performers stand out. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Tag className="h-4 w-4" />
            Promo Redemptions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {promoStats.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              No promotion codes created yet. Create one in <b>Promotions</b>.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {promoStats.map((p) => {
                // Same Vancouver-date rule as checkout.
                const expired = promoDateStatus(p) === "expired";
                const exhausted = p.max_uses !== null && p.used_count >= p.max_uses;
                const status = !p.is_active
                  ? { label: "Inactive", color: "bg-gray-100 text-gray-700" }
                  : expired
                    ? { label: "Expired", color: "bg-red-50 text-red-700" }
                    : exhausted
                      ? { label: "Used up", color: "bg-amber-50 text-amber-800" }
                      : { label: "Active", color: "bg-green-50 text-green-700" };
                const discountLabel =
                  p.discount_type === "percentage"
                    ? `${p.discount_value}% off`
                    : `$${p.discount_value} off`;
                return (
                  <div
                    key={p.id}
                    className="rounded-md border p-3 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="font-mono font-medium text-sm truncate">{p.code}</p>
                      <p className="text-xs text-muted-foreground">
                        {discountLabel} ·{" "}
                        {p.used_count}
                        {p.max_uses ? ` / ${p.max_uses}` : ""} redeemed
                      </p>
                      {(p.discount_total > 0 || p.over_limit > 0) && (
                        <p className="text-xs text-muted-foreground">
                          {p.discount_total > 0 ? `$${p.discount_total.toFixed(2)} CAD discounted` : ""}
                          {p.discount_total > 0 && p.over_limit > 0 ? " · " : ""}
                          {p.over_limit > 0 ? `${p.over_limit} paid over the limit` : ""}
                        </p>
                      )}
                    </div>
                    <Badge className={`${status.color} border-0 capitalize text-xs shrink-0`}>
                      {status.label}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        data={payments}
        loading={loading}
        searchKey="user_name"
        searchPlaceholder="Search by user..."
        filters={[
          {
            key: "status",
            label: "Status",
            options: [
              { value: "completed", label: "Completed" },
              { value: "pending", label: "Pending" },
              { value: "failed", label: "Failed" },
              { value: "refunded", label: "Refunded" },
              { value: "canceled", label: "Canceled" },
            ],
          },
        ]}
      />
    </div>
  );
}
