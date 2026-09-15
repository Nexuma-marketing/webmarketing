import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";
import { CheckoutButton } from "@/components/checkout/checkout-button";
import { formatOwnerPlanPrice } from "@/lib/owner-plan-display";

type OwnerPropertyRent = { monthly_rent: number | null };

export function PrimaryPlanPricingCard({
  primaryPlan,
  primaryPlanTerms,
  primaryPlanService,
  accentColorClassName,
  ownerProperties,
}: {
  primaryPlan: { name: string; pricing: string; cta: string };
  primaryPlanTerms: string[];
  primaryPlanService?: { id: string; price: number | string; currency?: string | null } | null;
  accentColorClassName: string;
  ownerProperties: OwnerPropertyRent[];
}) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div>
        <p className="font-semibold">{primaryPlan.name}</p>
        <p className={`text-sm font-medium ${accentColorClassName}`}>
          {formatOwnerPlanPrice(primaryPlan.pricing, primaryPlan.name, ownerProperties)}
        </p>
      </div>
      {primaryPlanTerms.length > 0 && (
        <ul className="space-y-1.5">
          {primaryPlanTerms.map((term) => (
            <li key={term} className="flex items-start gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
              {term}
            </li>
          ))}
        </ul>
      )}
      {primaryPlanService && Number(primaryPlanService.price) > 0 ? (
        <CheckoutButton
          type="service"
          serviceId={primaryPlanService.id}
          label={`${primaryPlan.cta} — Pay $${Number(primaryPlanService.price)} ${primaryPlanService.currency || "CAD"} upfront`}
        />
      ) : (
        <Link href="/dashboard/services#contact" className={buttonVariants({ className: "w-full" })}>
          {primaryPlan.cta}
        </Link>
      )}
    </div>
  );
}
