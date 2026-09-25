import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";
import { PaidOrCheckout } from "@/components/dashboard/paid-or-checkout";
import { PropertyBalanceSummary, type InstallmentDisplay } from "@/components/dashboard/property-balance-summary";
import { computeBalanceCents, PLAN_UPFRONT_AMOUNT_CAD } from "@/lib/plan-percentage";

// PROMPT2 item 6: Support Tier & Premier Tier restructured from one
// account-wide card into one card per property, mirroring
// elite-portfolio-breakdown.tsx's pattern — required for items 4/5 to
// work correctly for owners with 2-3 properties, since checkout
// previously had no way to know which property a Support/Premier
// payment was for.
//
// Property rank (30% for #1, 28% for #2/#3) uses the same
// index-into-owner's-properties-ordered-by-created_at convention as
// src/lib/owner-plan-display.ts's percentageForPlan — more accurate
// than the flat percentage src/lib/plan-percentage.ts's
// getPlanPercentage() returns (that helper has no per-property-index
// awareness; see the payment-flow report for detail). Only the first 3
// properties are covered, matching the plan's own terms.

export interface PortfolioProperty {
  id: string;
  address: string;
  city: string;
  monthly_rent: number | null;
}

export interface PropertyBalanceInfo {
  balanceInvoiceUrl?: string | null;
  balanceInvoiceStatus?: string | null;
  installments?: InstallmentDisplay[];
}

interface OwnerPlanPortfolioBreakdownProps {
  properties: PortfolioProperty[];
  planName: string;
  service?: { id: string; price: number; currency: string | null } | null;
  isPremier: boolean;
  paidServiceKeys: Set<string>;
  balanceByProperty: Record<string, PropertyBalanceInfo>;
}

export function OwnerPlanPortfolioBreakdown({
  properties,
  planName,
  service,
  isPremier,
  paidServiceKeys,
  balanceByProperty,
}: OwnerPlanPortfolioBreakdownProps) {
  const covered = properties.slice(0, 3);

  return (
    <div className="space-y-3">
      {covered.map((prop, index) => {
        const rent = Number(prop.monthly_rent) || 0;
        const percentage = index === 0 ? 0.3 : 0.28;
        const totalFeeCents = Math.round(rent * percentage * 100);
        const pendingBalanceCents = computeBalanceCents({ monthlyRentCad: rent, planPercentage: percentage });
        const alreadyPaid = !!service && paidServiceKeys.has(`${prop.id}:${service.id}`);
        const balance = balanceByProperty[prop.id];

        return (
          <div key={prop.id} className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">
                  #{index + 1} {prop.city} &mdash; ${rent.toLocaleString()}/mo
                </p>
                <p className="text-xs text-muted-foreground">{prop.address}</p>
              </div>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                {(percentage * 100).toFixed(0)}% of rent
              </span>
            </div>

            {rent > 0 && (
              <p className="text-xs text-muted-foreground">
                Total service fee: ~${(totalFeeCents / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })} CAD
                {" "}(${PLAN_UPFRONT_AMOUNT_CAD} upfront + balance)
              </p>
            )}

            {service && rent > 0 ? (
              <PaidOrCheckout
                alreadyPaid={alreadyPaid}
                type="service"
                serviceId={service.id}
                propertyId={prop.id}
                label={`Pay $${service.price} ${service.currency || "CAD"} upfront`}
              />
            ) : (
              <Link href="/dashboard/services#contact" className={cn(buttonVariants(), "w-full gap-2")}>
                Contact us
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}

            {alreadyPaid && (
              <PropertyBalanceSummary
                planName={planName}
                upfrontPaidCents={PLAN_UPFRONT_AMOUNT_CAD * 100}
                pendingBalanceCents={pendingBalanceCents}
                balanceInvoiceUrl={isPremier ? undefined : balance?.balanceInvoiceUrl}
                balanceInvoiceStatus={isPremier ? undefined : balance?.balanceInvoiceStatus}
                installments={isPremier ? balance?.installments : undefined}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
