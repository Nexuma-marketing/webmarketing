import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";
import { AlreadyPaidLink, PaidOrCheckout } from "@/components/dashboard/paid-or-checkout";
import { PropertyBalanceSummary, type InstallmentDisplay } from "@/components/dashboard/property-balance-summary";
import { computeBalanceCents, PLAN_UPFRONT_AMOUNT_CAD } from "@/lib/plan-percentage";
import { getPaidPlanForProperty, type OwnerPlanServiceRef } from "@/lib/payment-lookup";

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
  // Every owner plan's service (Low Price, Founders, Support, Premier)
  // — a property already paid under ANY of them is shown as paid here,
  // not just one paid under this card's own `service`. See
  // getPaidPlanForProperty.
  planServices: OwnerPlanServiceRef[];
  balanceByProperty: Record<string, PropertyBalanceInfo>;
}

export function OwnerPlanPortfolioBreakdown({
  properties,
  planName,
  service,
  isPremier,
  paidServiceKeys,
  planServices,
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
        // Paid under this card's own plan → full paid state + balance.
        // Paid under a different plan (e.g. Low Price, before the owner
        // added a 2nd property) → still not chargeable again, but this
        // card's percentage/balance don't apply to it.
        const alreadyPaid = !!service && paidServiceKeys.has(`${prop.id}:${service.id}`);
        const paidUnderOtherPlan = alreadyPaid
          ? null
          : getPaidPlanForProperty(paidServiceKeys, prop.id, planServices);
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
              {paidUnderOtherPlan ? (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                  Paid — {paidUnderOtherPlan.label}
                </span>
              ) : (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  {(percentage * 100).toFixed(0)}% of rent
                </span>
              )}
            </div>

            {paidUnderOtherPlan && (
              <p className="text-xs text-muted-foreground">
                This property is already covered by your {paidUnderOtherPlan.label} plan — no new upfront payment is needed.
              </p>
            )}

            {!paidUnderOtherPlan && rent > 0 && (
              <p className="text-xs text-muted-foreground">
                Total service fee: ~${(totalFeeCents / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })} CAD
                {" "}(${PLAN_UPFRONT_AMOUNT_CAD} upfront + balance)
              </p>
            )}

            {paidUnderOtherPlan ? (
              <AlreadyPaidLink label={`Paid under ${paidUnderOtherPlan.label} ✓ — View balance`} />
            ) : service && rent > 0 ? (
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
