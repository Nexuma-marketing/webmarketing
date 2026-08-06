import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { CreditCard, Download, Receipt, Calendar } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/admin";
import { CancelSubscriptionButton } from "@/components/dashboard/cancel-subscription-button";
import { RefundRequestButton } from "@/components/dashboard/refund-request-button";

const STATUS_BADGES: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  completed: { variant: "default", label: "Completed" },
  pending: { variant: "secondary", label: "Pending" },
  failed: { variant: "destructive", label: "Failed" },
  refunded: { variant: "outline", label: "Refunded" },
};

export default async function PaymentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Fetch payments with service/plan names
  const { data: payments } = await supabase
    .from("payments")
    .select(`
      *,
      services:service_id (name),
      pymes_plans:pymes_plan_id (name)
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const totalPaid = payments
    ?.filter((p) => p.status === "completed")
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0) || 0;

  const pendingCount = payments?.filter((p) => p.status === "pending").length || 0;

  // Steve 5/16 Milestone 4: surface ACTIVE installment subscriptions
  // so the user can see how many installments remain and cancel them
  // from this page. A subscription is "active" if it has at least one
  // payment row with stripe_subscription_id, the latest row is NOT
  // 'canceled' and there are fewer completed installments than the
  // expected total_installments.
  type SubGroup = {
    subscriptionId: string;
    planName: string;
    totalInstallments: number;
    completedCount: number;
    lastAmount: number;
    lastDate: string;
    canceled: boolean;
  };
  const subscriptionGroups: SubGroup[] = (() => {
    if (!payments) return [];
    const byId: Record<string, SubGroup & { rows: typeof payments }> = {};
    for (const p of payments) {
      if (!p.stripe_subscription_id) continue;
      const id = p.stripe_subscription_id as string;
      if (!byId[id]) {
        byId[id] = {
          subscriptionId: id,
          planName:
            p.pymes_plans?.name ||
            p.services?.name ||
            "Installment plan",
          totalInstallments: Number(p.total_installments) || 0,
          completedCount: 0,
          lastAmount: 0,
          lastDate: p.created_at,
          canceled: false,
          rows: [],
        };
      }
      byId[id].rows.push(p);
      if (p.status === "completed") byId[id].completedCount += 1;
      if (p.status === "canceled") byId[id].canceled = true;
      if (new Date(p.created_at) >= new Date(byId[id].lastDate)) {
        byId[id].lastAmount = Number(p.amount) || 0;
        byId[id].lastDate = p.created_at;
      }
      byId[id].totalInstallments =
        Number(p.total_installments) || byId[id].totalInstallments;
    }
    return Object.values(byId).filter(
      (g) =>
        !g.canceled &&
        (g.totalInstallments === 0 || g.completedCount < g.totalInstallments),
    );
  })();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">Payment History</h1>
        <p className="text-muted-foreground">
          Track your payments and installments
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalPaid)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Transactions</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{payments?.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Active installment subscriptions */}
      {subscriptionGroups.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Active installment plans
            </CardTitle>
            <CardDescription>
              These plans charge your card automatically. You can cancel any time.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {subscriptionGroups.map((g) => {
              const remaining =
                g.totalInstallments > 0
                  ? g.totalInstallments - g.completedCount
                  : null;
              return (
                <div
                  key={g.subscriptionId}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-md border p-3"
                >
                  <div className="space-y-1">
                    <p className="font-medium">{g.planName}</p>
                    <p className="text-xs text-muted-foreground">
                      {g.completedCount} paid
                      {remaining !== null
                        ? ` · ${remaining} remaining of ${g.totalInstallments}`
                        : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Last payment: {formatCurrency(g.lastAmount)} on{" "}
                      {formatDate(g.lastDate)}
                    </p>
                  </div>
                  <CancelSubscriptionButton subscriptionId={g.subscriptionId} />
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Payments table */}
      <Card>
        <CardHeader>
          <CardTitle>All Payments</CardTitle>
          <CardDescription>Your complete payment history</CardDescription>
        </CardHeader>
        <CardContent>
          {!payments || payments.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <CreditCard className="mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-muted-foreground">No payments yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Your payments will appear here once you subscribe to a service.
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Service / Plan</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Installment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment) => {
                    const serviceName =
                      payment.services?.name ||
                      payment.pymes_plans?.name ||
                      "—";
                    const badge = STATUS_BADGES[payment.status] || STATUS_BADGES.pending;

                    return (
                      <TableRow key={payment.id}>
                        <TableCell className="whitespace-nowrap">
                          {formatDate(payment.created_at)}
                        </TableCell>
                        <TableCell>{serviceName}</TableCell>
                        <TableCell className="font-medium">
                          {formatCurrency(Number(payment.amount))}
                        </TableCell>
                        <TableCell className="capitalize">
                          {payment.payment_type?.replace("_", " ") || "One-time"}
                        </TableCell>
                        <TableCell>
                          {payment.installment_number
                            ? `${payment.installment_number} of ${payment.total_installments || "—"}`
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {/* Steve 6/10 (6-2.md #52): only show Request
                              Refund on completed payments — refunded /
                              failed / pending rows don't qualify. */}
                          {payment.status === "completed" && (
                            <RefundRequestButton
                              paymentId={payment.id}
                              serviceName={serviceName}
                              amount={Number(payment.amount)}
                              currency={payment.currency || "CAD"}
                              paymentDate={formatDate(payment.created_at)}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Steve 6/10 (6-2.md #52): converted the static "email us"
          block into a pointer at the new in-row Request refund button.
          The button opens a modal, collects a reason, and emails the
          commercial team with the full payment context. The team
          processes the actual Stripe refund through /admin/payments. */}
      <div className="rounded-md border border-muted p-4 text-sm text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">Need help with a payment?</p>
        <p>
          Use the <b>Request refund</b> button on any completed payment above to send
          a request to our team. We&apos;ll review it within 2 business days and
          contact you at the email on your account.
        </p>
        <p>
          For anything else, write to{" "}
          <a
            href={`mailto:${process.env.NEXT_PUBLIC_CONTACT_EMAIL || "partners@nexuma.ca"}`}
            className="text-primary underline"
          >
            {process.env.NEXT_PUBLIC_CONTACT_EMAIL || "partners@nexuma.ca"}
          </a>
          .
        </p>
        <p className="text-xs">
          Per our policy, all sales are final once the service period has
          started. Refunds are considered only for exceptional circumstances
          (technical errors, duplicate charges).
        </p>
      </div>
    </div>
  );
}
