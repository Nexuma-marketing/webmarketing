"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Briefcase, CalendarClock } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/admin";
import type {
  PymeInstallmentReport,
  PymePlanReport,
  PymePurchaseRow,
  PymePurchaseStatus,
} from "@/lib/pyme-installment-report";
import {
  CancelSubscriptionDialog,
  type CancelMode,
  type CancelTarget,
} from "@/components/admin/cancel-subscription-dialog";

// Sales Report → PYME installment plans (admin and sales). Data is built
// server-side by src/lib/pyme-installment-report.ts; this component
// only renders it.

const STATUS_LABELS: Record<PymePurchaseStatus, string> = {
  active: "Active",
  cancellation_scheduled: "Cancellation scheduled",
  payment_failed: "Payment failed",
  canceled: "Canceled",
  completed: "Completed",
  subscription_not_found: "Subscription not found",
  unknown: "Unknown",
};

const STATUS_BADGE_CLASSES: Record<PymePurchaseStatus, string> = {
  active: "bg-green-50 text-green-700 border-green-200",
  cancellation_scheduled: "bg-amber-50 text-amber-800 border-amber-200",
  payment_failed: "bg-red-50 text-red-700 border-red-200",
  canceled: "bg-muted text-muted-foreground border-border",
  completed: "bg-blue-50 text-blue-700 border-blue-200",
  subscription_not_found: "bg-orange-50 text-orange-800 border-orange-200",
  unknown: "bg-muted text-muted-foreground border-border",
};

// Same column widths for every plan's table, so they line up when several
// plans are expanded. Purchased: Company, Email, Upfront paid,
// Installments charged, Remaining, Next charge, Status, Actions.
const PURCHASED_COL_WIDTHS: string[] = ["160px", "170px", "110px", "110px", "120px", "110px", "270px", "190px"];

export type ViewerRole = "admin" | "sales" | null;

// BUGFIX_CANCELLATIONS_PANEL.md: which cancel buttons a row shows.
// Active/trialing (and past_due) not scheduled: admin both, sales end of
// period. Scheduled: admin "Cancel now" only. Anything else: none.
function cancelModesFor(row: PymePurchaseRow, role: ViewerRole): CancelMode[] {
  if (!row.subscriptionId || !role) return [];
  if (row.status === "active" || row.status === "payment_failed") {
    return role === "admin" ? ["end_of_period", "now"] : ["end_of_period"];
  }
  if (row.status === "cancellation_scheduled") return role === "admin" ? ["now"] : [];
  return [];
}
// Recommended, not purchased: Company, Email, Diagnosis date.
const RECOMMENDED_COL_WIDTHS: string[] = ["220px", "260px", "200px"];

function statusText(row: PymePurchaseRow): string {
  if (row.status === "cancellation_scheduled" && row.cancelDate) {
    return `${STATUS_LABELS.cancellation_scheduled} (${formatDate(row.cancelDate)})`;
  }
  if (row.status === "payment_failed") return `${STATUS_LABELS.payment_failed} (past_due)`;
  if (row.status === "unknown" && row.stripeStatus) return `Stripe: ${row.stripeStatus}`;
  return STATUS_LABELS[row.status];
}

function PlanList({
  plan,
  viewerRole,
  onCancel,
}: {
  plan: PymePlanReport;
  viewerRole: ViewerRole;
  onCancel: (row: PymePurchaseRow, mode: CancelMode) => void;
}) {
  const [tab, setTab] = useState<"purchased" | "recommended">("purchased");
  return (
    <details className="rounded-md border">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
        {plan.planName} — {plan.purchasedCompanies} purchased ·{" "}
        {plan.recommendedNotPurchasedCompanies} recommended, not purchased
      </summary>
      <div className="space-y-3 border-t px-4 py-3">
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={tab === "purchased" ? "default" : "outline"}
            onClick={() => setTab("purchased")}
          >
            Purchased ({plan.purchased.length})
          </Button>
          <Button
            size="sm"
            variant={tab === "recommended" ? "default" : "outline"}
            onClick={() => setTab("recommended")}
          >
            Recommended, not purchased ({plan.recommendedNotPurchased.length})
          </Button>
        </div>

        {tab === "purchased" ? (
          plan.purchased.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No completed upfront payments for this plan.
            </p>
          ) : (
            <div className="overflow-x-auto">
              {/* Fixed column widths so the Rescue, Growth and Scale tables line up. */}
              <table className="w-full min-w-[1240px] table-fixed text-sm">
                <colgroup>
                  {PURCHASED_COL_WIDTHS.map((width, i) => (
                    <col key={i} style={{ width }} />
                  ))}
                </colgroup>
                <thead className="border-b text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Company</th>
                    <th className="px-3 py-2 text-left font-medium">Email</th>
                    <th className="px-3 py-2 text-right font-medium">Upfront paid</th>
                    <th className="px-3 py-2 text-right font-medium">Installments charged</th>
                    <th className="px-3 py-2 text-right font-medium">Remaining</th>
                    <th className="px-3 py-2 text-left font-medium">Next charge</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-left font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.purchased.map((row) => (
                    <tr key={row.paymentId} className="border-b last:border-0">
                      <td className="truncate px-3 py-2" title={row.name}>{row.name}</td>
                      <td className="truncate px-3 py-2 text-xs text-muted-foreground" title={row.email || undefined}>
                        {row.email || "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className="font-mono">{formatCurrency(row.upfrontAmount)}</span>
                        <div className="text-xs text-muted-foreground">{formatDate(row.upfrontDate)}</div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {row.chargedInstallments !== null && row.totalInstallments
                          ? `${row.chargedInstallments} of ${row.totalInstallments}`
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-mono">
                        {row.remainingInstallments === null
                          ? "—"
                          : row.remainingInstallments && row.installmentAmount
                            ? `${row.remainingInstallments} × ${formatCurrency(row.installmentAmount)}`
                            : String(row.remainingInstallments)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs">
                        {row.nextChargeDate ? formatDate(row.nextChargeDate) : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={STATUS_BADGE_CLASSES[row.status]}>
                          {statusText(row)}
                        </Badge>
                        {row.lastCancellation &&
                          (row.status === "cancellation_scheduled" || row.status === "canceled") && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {row.lastCancellation.mode === "now" ? "Canceled now" : "Scheduled"} by{" "}
                              {row.lastCancellation.byName || "unknown"} on {formatDate(row.lastCancellation.at)}:{" "}
                              <span className="italic">&ldquo;{row.lastCancellation.reason}&rdquo;</span>
                            </p>
                          )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col items-start gap-1">
                          {cancelModesFor(row, viewerRole).map((mode) => (
                            <Button
                              key={mode}
                              size="sm"
                              variant={mode === "now" ? "destructive" : "outline"}
                              onClick={() => onCancel(row, mode)}
                            >
                              {mode === "now" ? "Cancel now" : "Cancel at end of period"}
                            </Button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : plan.recommendedNotPurchased.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No companies with this recommended plan are pending purchase.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] table-fixed text-sm">
              <colgroup>
                {RECOMMENDED_COL_WIDTHS.map((width, i) => (
                  <col key={i} style={{ width }} />
                ))}
              </colgroup>
              <thead className="border-b text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Company</th>
                  <th className="px-3 py-2 text-left font-medium">Email</th>
                  <th className="px-3 py-2 text-left font-medium">Diagnosis date</th>
                </tr>
              </thead>
              <tbody>
                {plan.recommendedNotPurchased.map((row) => (
                  <tr key={row.userId} className="border-b last:border-0">
                    <td className="truncate px-3 py-2" title={row.name}>{row.name}</td>
                    <td className="truncate px-3 py-2 text-xs text-muted-foreground" title={row.email || undefined}>
                      {row.email || "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {formatDate(row.diagnosisDate)}
                      {row.source === "pymes_captacion" && (
                        <span className="text-muted-foreground"> (Client Acquisition)</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </details>
  );
}

export function PymeInstallmentPlansSection({
  report,
  error,
  viewerRole = null,
  onChanged,
}: {
  report: PymeInstallmentReport | null;
  error: boolean;
  /** admin: both cancel modes; sales: end of period only; null: no buttons. */
  viewerRole?: ViewerRole;
  /** Reloads the report after a cancellation attempt. */
  onChanged?: () => void;
}) {
  const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null);
  const [cancelMode, setCancelMode] = useState<CancelMode>("end_of_period");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  function openCancel(row: PymePurchaseRow, mode: CancelMode, planName: string) {
    setSuccessMessage(null);
    setCancelMode(mode);
    setCancelTarget({ paymentId: row.paymentId, clientName: row.name, planName });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Briefcase className="h-4 w-4" />
          PYME installment plans
        </CardTitle>
        <CardDescription>
          Upfront payments, monthly installments from Stripe, and recommended plans not yet purchased
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {successMessage && (
          <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-800">
            {successMessage}
          </div>
        )}
        {error && (
          <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            PYME data could not be loaded.
          </div>
        )}
        {!report && !error && (
          <p className="py-4 text-center text-sm text-muted-foreground">Loading PYME plans…</p>
        )}
        {report && (
          <>
            {!report.stripeAvailable && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                Stripe data unavailable. Showing purchases from the database only; installments,
                next charge dates and statuses could not be loaded.
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Upcoming PYME installments</CardTitle>
                  <CalendarClock className="h-4 w-4 text-blue-600" />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {report.upcomingTotal === null ? "—" : formatCurrency(report.upcomingTotal)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    remaining installments on active subscriptions
                  </p>
                </CardContent>
              </Card>
              {report.plans.map((plan) => (
                <Card key={plan.planType}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">{plan.planName}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{plan.purchasedCompanies}</p>
                    <p className="text-xs text-muted-foreground">
                      {plan.purchasedCompanies === 1 ? "company" : "companies"} purchased ·{" "}
                      {plan.recommendedNotPurchasedCompanies} recommended, not purchased
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="space-y-2">
              {report.plans.map((plan) => (
                <PlanList
                  key={plan.planType}
                  plan={plan}
                  viewerRole={viewerRole}
                  onCancel={(row, mode) => openCancel(row, mode, plan.planName)}
                />
              ))}
            </div>
          </>
        )}
        <CancelSubscriptionDialog
          target={cancelTarget}
          allowedModes={[cancelMode]}
          initialMode={cancelMode}
          onClose={() => setCancelTarget(null)}
          onDone={(message) => {
            if (message) setSuccessMessage(message);
            onChanged?.();
          }}
        />
      </CardContent>
    </Card>
  );
}
