"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
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

interface PaymentRow {
  id: string;
  user_name: string;
  user_email: string;
  service_name: string;
  amount: number;
  currency: string;
  payment_type: string | null;
  installment_number: number | null;
  status: string;
  created_at: string;
}

interface PromoStat {
  code: string;
  used_count: number;
  max_uses: number | null;
  is_active: boolean;
  valid_until: string | null;
  discount_type: "percentage" | "fixed";
  discount_value: number;
}

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  completed: "default",
  pending: "secondary",
  failed: "destructive",
  refunded: "outline",
};

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [promoStats, setPromoStats] = useState<PromoStat[]>([]);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  const loadPayments = useCallback(async () => {
    const [{ data: paymentData }, { data: promoData }] = await Promise.all([
      supabase
        .from("payments")
        .select(`
          id, amount, currency, payment_type, installment_number, status, created_at,
          profiles:user_id(full_name, email),
          services:service_id(name),
          pymes_plans:pymes_plan_id(name)
        `)
        .order("created_at", { ascending: false }),
      supabase
        .from("promotions")
        .select(
          "code, used_count, max_uses, is_active, valid_until, discount_type, discount_value",
        )
        .order("used_count", { ascending: false }),
    ]);

    const mapped = (paymentData || []).map((p) => ({
      id: p.id,
      user_name: (p.profiles as unknown as { full_name: string } | null)?.full_name || "Unknown",
      user_email: (p.profiles as unknown as { email: string } | null)?.email || "",
      service_name: (p.services as unknown as { name: string } | null)?.name ||
        (p.pymes_plans as unknown as { name: string } | null)?.name || "—",
      amount: Number(p.amount) || 0,
      currency: p.currency || "CAD",
      payment_type: p.payment_type,
      installment_number: p.installment_number,
      status: p.status,
      created_at: p.created_at,
    }));

    setPayments(mapped);
    setPromoStats((promoData as PromoStat[]) || []);
    setLoading(false);
  }, [supabase]);

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
      accessorKey: "payment_type",
      header: "Type",
      cell: ({ row }) => {
        const type = row.getValue("payment_type") as string | null;
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
        return (
          <Badge variant={STATUS_VARIANTS[status] || "secondary"} className="capitalize">
            {status}
          </Badge>
        );
      },
      filterFn: "equals",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">Payment Management</h1>
        <p className="text-muted-foreground">
          View all payments and revenue reports
        </p>
      </div>

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
              No promotion codes created yet. Create one in <b>Pricing &amp; Promotions</b>.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {promoStats.map((p) => {
                const today = new Date().toISOString().split("T")[0];
                const expired = !!(p.valid_until && p.valid_until < today);
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
                    key={p.code}
                    className="rounded-md border p-3 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="font-mono font-medium text-sm truncate">{p.code}</p>
                      <p className="text-xs text-muted-foreground">
                        {discountLabel} ·{" "}
                        {p.used_count}
                        {p.max_uses ? ` / ${p.max_uses}` : ""} redeemed
                      </p>
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
            ],
          },
        ]}
      />
    </div>
  );
}
