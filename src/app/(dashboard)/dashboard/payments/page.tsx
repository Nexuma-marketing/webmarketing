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
import { CreditCard, Download, Receipt, Calendar, Wallet } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/admin";
import { CancelSubscriptionButton } from "@/components/dashboard/cancel-subscription-button";
import { RefundRequestButton } from "@/components/dashboard/refund-request-button";
import { PropertyBalanceSummary, type InstallmentDisplay } from "@/components/dashboard/property-balance-summary";
import { PriorityListingCard, PRIORITY_LISTING_SERVICE_NAME } from "@/components/dashboard/priority-listing-card";
import { PLAN_UPFRONT_AMOUNT_CAD } from "@/lib/plan-percentage";
import { resolvePropertyPlanBalance } from "@/lib/property-plan-balance";
import { getCompletedPaymentForPropertyService } from "@/lib/payment-lookup";

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const isOwnerRole = profile?.role === "propietario" || profile?.role === "propietario_preferido";

  // Fetch payments with service/plan names
  const { data: payments, error: paymentsError } = await supabase
    .from("payments")
    .select(`
      *,
      services:service_id (name, category),
      pymes_plans:pymes_plan_id (name)
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (paymentsError) {
    console.error("[payments-page] Failed to load payments", paymentsError);
  }

  // Steve: property address/city is resolved with a separate lookup
  // instead of an embedded `properties:property_id (...)` join. An
  // embedded relation query fails (and silently returns no rows at
  // all, for every payment — not just the property-scoped ones) if
  // PostgREST hasn't picked up the new payments.property_id foreign
  // key yet after the migration that added it, e.g. before its schema
  // cache reloads. Fetching separately (same pattern already used for
  // property_images in dashboard/services/page.tsx) means a stale
  // schema cache or a not-yet-applied migration only hides the
  // property's address/city label, never the whole payment history.
  const propertyIds = Array.from(
    new Set(
      (payments || [])
        .map((p) => p.property_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const propertiesById: Record<string, { address: string; city: string }> = {};
  if (propertyIds.length > 0) {
    const { data: props, error: propsError } = await supabase
      .from("properties")
      .select("id, address, city")
      .in("id", propertyIds);
    if (propsError) {
      console.error("[payments-page] Failed to load property labels", propsError);
    }
    for (const prop of props || []) {
      propertiesById[prop.id as string] = {
        address: prop.address as string,
        city: prop.city as string,
      };
    }
  }

  // PROMPT2 items 2/3/5: pending-balance + Pay-remaining-balance /
  // installment display, one row per property with a completed plan
  // upfront payment. Property rank (30%/28% for Support/Premier) uses
  // the same index-into-owner's-properties-ordered-by-created_at
  // convention as src/lib/owner-plan-display.ts's percentageForPlan —
  // more accurate than plan-percentage.ts's flat getPlanPercentage()
  // for a multi-property owner (see the payment-flow report).
  interface PlanBalanceRow {
    propertyId: string;
    propertyLabel: string;
    planName: string;
    upfrontPaidCents: number;
    pendingBalanceCents: number;
    balanceInvoiceUrl: string | null;
    balanceInvoiceStatus: string | null;
    installments?: InstallmentDisplay[];
  }
  const planBalanceRows: PlanBalanceRow[] = [];
  let priorityListingAddOn: { id: string; price: number; currency: string | null } | null = null;
  let priorityListingPropertyId: string | undefined;
  let priorityListingAlreadyPaid = false;

  if (isOwnerRole) {
    const { data: ownerProperties } = await supabase
      .from("properties")
      .select("id, address, city, monthly_rent, balance_invoice_url, balance_invoice_status")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: true });
    const ownerPropIds = (ownerProperties || []).map((p) => p.id as string);

    const { data: installmentRows } = ownerPropIds.length > 0
      ? await supabase
          .from("plan_installments")
          .select("property_id, sequence, due_date, amount_cents, status, hosted_invoice_url")
          .in("property_id", ownerPropIds)
      : { data: [] as Record<string, unknown>[] };
    const installmentsByProperty: Record<string, InstallmentDisplay[]> = {};
    for (const row of installmentRows || []) {
      const pid = row.property_id as string;
      if (!installmentsByProperty[pid]) installmentsByProperty[pid] = [];
      installmentsByProperty[pid].push({
        sequence: row.sequence as number,
        amountCents: row.amount_cents as number,
        dueDate: row.due_date as string,
        status: row.status as InstallmentDisplay["status"],
        hostedInvoiceUrl: row.hosted_invoice_url as string | null,
      });
    }

    // Backward-compat: pre-existing Low Price/Founders/Support/Premier
    // payment rows have property_id = null (checkout never passed it
    // before this change). Unambiguous fallback for a single-property
    // owner only — see payment-lookup.ts's docstrings for the same
    // pattern used elsewhere.
    const isSingleProperty = ownerPropIds.length === 1;
    (ownerProperties || []).forEach((prop, index) => {
      const propId = prop.id as string;
      const planPayment = (payments || []).find(
        (p) =>
          (p.property_id === propId || (isSingleProperty && !p.property_id)) &&
          p.status === "completed" &&
          (p.services as { category?: string } | null)?.category === "plan",
      );
      if (!planPayment) return;
      const planName = (planPayment.services as { name?: string } | null)?.name || "Plan";
      const rent = Number(prop.monthly_rent) || 0;
      const balance = resolvePropertyPlanBalance({ planName, propertyIndex: index, monthlyRentCad: rent });
      if (!balance) return; // Elite/flat-fee plans have no percentage balance
      const { pendingBalanceCents, isPremier: isPremierProperty } = balance;
      planBalanceRows.push({
        propertyId: propId,
        propertyLabel: `${prop.address}, ${prop.city}`,
        planName,
        upfrontPaidCents: PLAN_UPFRONT_AMOUNT_CAD * 100,
        pendingBalanceCents,
        balanceInvoiceUrl: isPremierProperty ? null : (prop.balance_invoice_url as string | null),
        balanceInvoiceStatus: isPremierProperty ? null : (prop.balance_invoice_status as string | null),
        installments: isPremierProperty ? installmentsByProperty[propId] : undefined,
      });
    });

    // Item 7: standalone priority-listing add-on purchase for an owner
    // who skipped it at checkout — attached to their first property
    // (same default used at checkout time; Low Price is single-property
    // by definition).
    const { data: addOnSvc } = await supabase
      .from("services")
      .select("id, price, currency")
      .eq("name", PRIORITY_LISTING_SERVICE_NAME)
      .eq("is_active", true)
      .maybeSingle();
    if (addOnSvc && ownerPropIds[0]) {
      priorityListingAddOn = addOnSvc as { id: string; price: number; currency: string | null };
      priorityListingPropertyId = ownerPropIds[0];
      const paid = await getCompletedPaymentForPropertyService(supabase, ownerPropIds[0], addOnSvc.id as string);
      priorityListingAlreadyPaid = !!paid;
    }
  }

  const totalPaid = payments
    ?.filter((p) => p.status === "completed")
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0) || 0;

  // "Pending" summary tile: must read the SAME figure as the Plan
  // Balances cards below (PropertyBalanceSummary), which render
  // row.pendingBalanceCents unless balanceInvoiceStatus === "paid".
  // Previously this tile showed a count of payment rows with
  // status "pending" (usually 0), so it disagreed with the card.
  // Non-owner roles have no plan balances, so they keep seeing the
  // total of their pending payment rows.
  const pendingTotal = isOwnerRole
    ? planBalanceRows
        .filter((row) => row.balanceInvoiceStatus !== "paid")
        .reduce((sum, row) => sum + row.pendingBalanceCents, 0) / 100
    : payments
        ?.filter((p) => p.status === "pending")
        .reduce((sum, p) => sum + (Number(p.amount) || 0), 0) || 0;

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
            (p.property_id && propertiesById[p.property_id]
              ? `Elite maintenance — ${propertiesById[p.property_id].address}, ${propertiesById[p.property_id].city}`
              : "Installment plan"),
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
            <div className="text-2xl font-bold">{formatCurrency(pendingTotal)}</div>
          </CardContent>
        </Card>
      </div>

      {/* PROMPT2 items 2/3/5: pending balance + Pay remaining balance /
          installment schedule, one card per property with a completed
          plan upfront payment. This is the primary, always-available
          surface for paying the balance — no dependency on Stripe's
          own invoice email ever arriving (item 3). */}
      {planBalanceRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Plan Balances
            </CardTitle>
            <CardDescription>
              Your remaining balance per property, and how to pay it once it becomes payable.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {planBalanceRows.map((row) => (
              <div key={row.propertyId} className="space-y-1.5">
                <p className="text-sm font-medium">{row.propertyLabel}</p>
                <PropertyBalanceSummary
                  planName={row.planName}
                  upfrontPaidCents={row.upfrontPaidCents}
                  pendingBalanceCents={row.pendingBalanceCents}
                  balanceInvoiceUrl={row.balanceInvoiceUrl}
                  balanceInvoiceStatus={row.balanceInvoiceStatus}
                  installments={row.installments}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* PROMPT2 item 7: standalone priority-listing add-on purchase
          for an owner who skipped it at checkout. */}
      {priorityListingAddOn && priorityListingPropertyId && !priorityListingAlreadyPaid && (
        <PriorityListingCard service={priorityListingAddOn} propertyId={priorityListingPropertyId} />
      )}

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
                    const paymentProperty = payment.property_id
                      ? propertiesById[payment.property_id]
                      : undefined;
                    const serviceName =
                      payment.services?.name ||
                      payment.pymes_plans?.name ||
                      (paymentProperty
                        ? `Elite maintenance — ${paymentProperty.address}, ${paymentProperty.city}`
                        : "—");
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
                          {payment.status === "completed" && Number(payment.amount) > 0 && (
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
