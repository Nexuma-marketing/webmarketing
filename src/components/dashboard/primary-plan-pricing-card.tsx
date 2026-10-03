"use client";

import { useState } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";
import { PaidOrCheckout } from "@/components/dashboard/paid-or-checkout";
import { formatOwnerPlanPrice } from "@/lib/owner-plan-display";

type OwnerPropertyRent = { monthly_rent: number | null };

// PROMPT2 item 7: the "Optional: +$100 for priority listing placement"
// bullet (Low Price plan only) becomes an interactive checkbox instead
// of plain text — checked before paying the $200 upfront adds the
// add-on as a second Stripe Checkout line item (see
// src/app/api/stripe/checkout/route.ts's addOnServiceId handling).
// Matched by content rather than a hardcoded index so it stays correct
// if admin edits the plan copy (see plan_features:owner_low_price
// overrides in services/page.tsx).
const PRIORITY_LISTING_TERM_PATTERN = /priority listing/i;

export function PrimaryPlanPricingCard({
  primaryPlan,
  primaryPlanTerms,
  primaryPlanService,
  accentColorClassName,
  ownerProperties,
  propertyId,
  alreadyPaid = false,
  addOnService,
  notSelectedNote,
}: {
  primaryPlan: { name: string; pricing: string; cta: string };
  primaryPlanTerms: string[];
  primaryPlanService?: { id: string; price: number | string; currency?: string | null } | null;
  accentColorClassName: string;
  ownerProperties: OwnerPropertyRent[];
  // PROMPT2 item 4: basic tier (Low Price/Founders) is single-property
  // by definition, so the caller passes that property's id so checkout
  // can be attributed to it and re-purchase can be blocked.
  propertyId?: string;
  alreadyPaid?: boolean;
  // PROMPT2 item 7: the priority-listing add-on service row, when this
  // card's plan offers it (Low Price only).
  addOnService?: { id: string; price: number | string; currency?: string | null } | null;
  // When set, the card renders as a dimmed, non-actionable comparison
  // (no checkout/paid button) with this note — used for Low Price when
  // the owner's active plan on the property is Founders (see
  // FoundersActivePlanCard).
  notSelectedNote?: string;
}) {
  const [addOnChecked, setAddOnChecked] = useState(false);
  const addOnPrice = addOnService ? Number(addOnService.price) : 0;

  const baseUpfront = primaryPlanService ? Number(primaryPlanService.price) : 0;
  const totalLabel =
    addOnService && addOnChecked
      ? `${primaryPlan.cta} — Pay $${baseUpfront + addOnPrice} ${primaryPlanService?.currency || "CAD"} upfront ($${baseUpfront} + $${addOnPrice} priority listing)`
      : `${primaryPlan.cta} — Pay $${baseUpfront} ${primaryPlanService?.currency || "CAD"} upfront`;

  if (notSelectedNote) {
    return (
      <div className="rounded-lg border border-gray-200 bg-muted/30 p-4 space-y-3 text-gray-400">
        <div>
          <p className="font-semibold">{primaryPlan.name}</p>
          <p className="text-sm font-medium">
            {formatOwnerPlanPrice(primaryPlan.pricing, primaryPlan.name, ownerProperties)}
          </p>
        </div>
        {primaryPlanTerms.length > 0 && (
          <ul className="space-y-1.5">
            {primaryPlanTerms.map((term) => (
              <li key={term} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-gray-300" />
                {term}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs italic">{notSelectedNote}</p>
      </div>
    );
  }

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
          {primaryPlanTerms.map((term) => {
            if (addOnService && !alreadyPaid && PRIORITY_LISTING_TERM_PATTERN.test(term)) {
              return (
                <li key={term}>
                  <label className="flex items-start gap-2 rounded-md border border-dashed border-primary/40 bg-primary/5 p-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={addOnChecked}
                      onChange={(e) => setAddOnChecked(e.target.checked)}
                    />
                    <span>{term}</span>
                  </label>
                </li>
              );
            }
            return (
              <li key={term} className="flex items-start gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                {term}
              </li>
            );
          })}
        </ul>
      )}
      {primaryPlanService && Number(primaryPlanService.price) > 0 ? (
        <PaidOrCheckout
          alreadyPaid={alreadyPaid}
          type="service"
          serviceId={primaryPlanService.id}
          propertyId={propertyId}
          addOnServiceId={addOnChecked ? addOnService?.id : undefined}
          label={totalLabel}
        />
      ) : (
        <Link href="/dashboard/services#contact" className={buttonVariants({ className: "w-full" })}>
          {primaryPlan.cta}
        </Link>
      )}
    </div>
  );
}
