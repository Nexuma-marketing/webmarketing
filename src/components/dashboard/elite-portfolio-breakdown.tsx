import Link from "next/link";
import { ArrowRight, Zap } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckoutButton } from "@/components/checkout/checkout-button";
import { ELITE_SUB_TIERS } from "@/lib/constants";

export interface EliteBreakdownProperty {
  id: string;
  property_type: string;
  address: string;
  city: string;
  monthly_rent: number | null;
  elite_tier: string | null;
  cfp_monthly: number | null;
  payback_months: number | null;
}

export interface EliteServiceInfo {
  id: string;
  price: number;
  currency: string | null;
}

// Per-property Elite Assets & Legacy portfolio breakdown. Each property
// carries its own one-time portfolio fee + monthly maintenance fee and
// its own Stripe checkout — this is intentionally a list of independent
// rows, not one combined "acquire the whole portfolio" action, since
// billing is confirmed per property, never shared across a portfolio.
// Shared by Dashboard home and Recommended Services so both surfaces
// stay in sync and the Acquire button is fixed in one place.
export function ElitePortfolioBreakdown({
  properties,
  eliteServices,
  totalCFP,
}: {
  properties: EliteBreakdownProperty[];
  eliteServices: Partial<Record<string, EliteServiceInfo>>;
  totalCFP?: number;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Property Portfolio Breakdown</p>
      {properties.map((prop, i) => {
        const tier = prop.elite_tier ? ELITE_SUB_TIERS[prop.elite_tier] : null;
        const rent = Number(prop.monthly_rent) || 0;
        const cfpMonthly = prop.cfp_monthly == null ? null : Number(prop.cfp_monthly);
        const payback = prop.payback_months ? Number(prop.payback_months) : null;
        const service = prop.elite_tier ? eliteServices[prop.elite_tier] : undefined;

        return (
          <div key={prop.id} className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">
                  #{i + 1} {prop.city} &mdash; ${rent.toLocaleString()}/mo
                </p>
                <p className="text-xs text-muted-foreground">
                  {prop.property_type} &middot; {prop.address}
                </p>
              </div>
              {tier && (
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tier.bgColor} ${tier.color}`}>
                  {tier.name}
                </span>
              )}
            </div>

            {tier ? (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">One-time fee</p>
                    <p className="text-sm font-semibold">${tier.oneTimeFee.toLocaleString()} CAD</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Monthly maintenance</p>
                    <p className="text-sm font-semibold">${tier.monthlyFee.toLocaleString()} CAD/mo</p>
                  </div>
                  {cfpMonthly != null && (
                    <div>
                      <p className="text-xs text-muted-foreground">CFP</p>
                      <p className="text-sm font-semibold text-emerald-600">
                        ${cfpMonthly.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mo
                      </p>
                    </div>
                  )}
                </div>

                {payback != null && (
                  <div className="flex items-center gap-2 rounded-md bg-primary/5 px-3 py-1.5">
                    <Zap className="h-4 w-4 text-primary" />
                    <p className="text-sm">
                      <span className="font-medium">Payback:</span> {payback.toFixed(1)} months
                    </p>
                  </div>
                )}

                <p className="text-sm text-muted-foreground border-t pt-2">
                  {tier.feeDescription}
                </p>

                {service && Number(service.price) > 0 ? (
                  <div className="space-y-1.5">
                    <CheckoutButton
                      type="service"
                      serviceId={service.id}
                      propertyId={prop.id}
                      label={`Acquire ${tier.name} — Pay $${Number(service.price).toLocaleString()} ${service.currency || "CAD"} one-time`}
                    />
                    {/* Steve: disclose the recurring charge BEFORE checkout,
                        in our own UI in addition to Stripe Checkout's line
                        item — no one should be silently enrolled. */}
                    <p className="text-[11px] text-muted-foreground">
                      Completing this purchase also enrolls this property in an
                      automatic recurring charge of ${tier.monthlyFee} CAD/month
                      (maintenance fee), billed monthly until canceled.
                    </p>
                  </div>
                ) : (
                  <Link
                    href="/dashboard/services#contact"
                    className={cn(buttonVariants(), "w-full gap-2")}
                  >
                    Acquire {tier.name} Portfolio
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Below Elite portfolio minimum</p>
            )}
          </div>
        );
      })}

      {totalCFP != null && totalCFP > 0 && (
        <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3">
          <p className="text-sm font-medium text-emerald-700">
            Total Portfolio CFP: ${totalCFP.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CAD/mo
            &middot; ${(totalCFP * 12).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CAD/yr
          </p>
        </div>
      )}
    </div>
  );
}
