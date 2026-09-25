import Link from "next/link";
import { CheckCircle2, Clock, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Steve — payment-flow overhaul (PROMPT2) items 2/3/5: shared
// "Paid: $200 · Pending balance: $X" + "Pay remaining balance" display.
// Purely presentational — the caller (Payment History, or the
// per-property plan cards from item 6) resolves the numbers via
// computeBalanceCents/getPlanPercentage (src/lib/plan-percentage.ts)
// and the property's balance_invoice_* columns / plan_installments rows.
//
// Two shapes, never both at once for the same property:
// - Lump-sum plans (Low Price, Founders, Support Tier): pass
//   `balanceInvoiceUrl`/`balanceInvoiceStatus` — item 1's flow.
// - Premier Tier: pass `installments` — item 5's calendar-based
//   schedule. `balanceInvoiceUrl` is never set for Premier (item 5's
//   spec: Premier's balance is never a single lump invoice).

export interface InstallmentDisplay {
  sequence: number;
  amountCents: number;
  dueDate: string;
  status: "scheduled" | "invoiced" | "paid" | "failed" | "voided";
  hostedInvoiceUrl?: string | null;
}

interface PropertyBalanceSummaryProps {
  planName: string;
  upfrontPaidCents: number;
  pendingBalanceCents: number;
  balanceInvoiceUrl?: string | null;
  balanceInvoiceStatus?: string | null;
  installments?: InstallmentDisplay[];
  /** Compact = a small "Pending: $X" line for per-property cards, no button. */
  compact?: boolean;
  className?: string;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}

const PAYABLE_STATUSES = new Set(["open", "overdue", "uncollectible"]);

export function PropertyBalanceSummary({
  planName,
  upfrontPaidCents,
  pendingBalanceCents,
  balanceInvoiceUrl,
  balanceInvoiceStatus,
  installments,
  compact = false,
  className,
}: PropertyBalanceSummaryProps) {
  if (pendingBalanceCents <= 0 && (!installments || installments.length === 0)) {
    return null;
  }

  if (compact) {
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>
        Paid: {formatCents(upfrontPaidCents)} · Pending balance:{" "}
        <Link href="/dashboard/payments" className="font-medium text-foreground underline underline-offset-2">
          {formatCents(pendingBalanceCents)}
        </Link>
      </p>
    );
  }

  const isPayable = !!balanceInvoiceUrl && !!balanceInvoiceStatus && PAYABLE_STATUSES.has(balanceInvoiceStatus);
  const isPaid = balanceInvoiceStatus === "paid";

  return (
    <div className={cn("rounded-md border bg-muted/30 p-3 space-y-2", className)}>
      <p className="text-sm font-medium">{planName} — balance</p>
      <p className="text-sm text-muted-foreground">
        Paid: <span className="font-medium text-foreground">{formatCents(upfrontPaidCents)}</span>
        {" · "}
        {isPaid ? (
          <span className="text-green-700">Balance paid in full</span>
        ) : (
          <>
            Pending balance: <span className="font-medium text-foreground">{formatCents(pendingBalanceCents)}</span>
          </>
        )}
      </p>

      {/* Lump-sum flow (items 1/2/3) — no installments passed */}
      {!installments && !isPaid && (
        <div>
          {isPayable ? (
            <a
              href={balanceInvoiceUrl!}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}
            >
              Pay remaining balance
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : (
            <Badge variant="secondary" className="gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Pending — becomes payable once your tenant signs the lease
            </Badge>
          )}
        </div>
      )}

      {/* Premier installment schedule (item 5) */}
      {installments && installments.length > 0 && (
        <div className="space-y-1.5 pt-1">
          {installments
            .sort((a, b) => a.sequence - b.sequence)
            .map((inst) => (
              <div key={inst.sequence} className="flex flex-wrap items-center justify-between gap-2 rounded border bg-card px-2.5 py-1.5 text-xs">
                <span>
                  Installment {inst.sequence} — {formatCents(inst.amountCents)}
                </span>
                {inst.status === "paid" ? (
                  <Badge className="gap-1 bg-green-50 text-green-700 border-green-200">
                    <CheckCircle2 className="h-3 w-3" /> Paid
                  </Badge>
                ) : inst.status === "invoiced" && inst.hostedInvoiceUrl ? (
                  <a
                    href={inst.hostedInvoiceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(buttonVariants({ size: "sm", variant: "outline" }), "h-6 gap-1 px-2 text-xs")}
                  >
                    Pay now <ExternalLink className="h-3 w-3" />
                  </a>
                ) : inst.status === "failed" ? (
                  <Badge variant="destructive">Payment failed</Badge>
                ) : (
                  <span className="text-muted-foreground">Due {formatDate(inst.dueDate)}</span>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
