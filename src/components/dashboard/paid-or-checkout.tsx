import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckoutButton } from "@/components/checkout/checkout-button";

// Steve — payment-flow overhaul (PROMPT2) item 4: shared swap-component
// so "already paid, don't let them click Pay again" is implemented once
// and reused at every "Choose & secure your money"-style render site,
// instead of each card duplicating (or forgetting) the check. The
// caller computes `alreadyPaid` server-side (via
// src/lib/payment-lookup.ts) and passes it in — this component is
// purely presentational.

interface PaidOrCheckoutProps {
  alreadyPaid: boolean;
  type: "service" | "pymes_upfront";
  serviceId?: string;
  pymesPlanId?: string;
  propertyId?: string;
  addOnServiceId?: string;
  netAgainstExisting?: boolean;
  label: string;
  /** Where the "already paid" state links to. Defaults to Payment History. */
  paidHref?: string;
  paidLabel?: string;
  className?: string;
}

export function PaidOrCheckout({
  alreadyPaid,
  paidHref = "/dashboard/payments",
  paidLabel = "Deposit paid ✓ — View balance",
  className,
  ...checkoutProps
}: PaidOrCheckoutProps) {
  if (alreadyPaid) {
    return (
      <Link
        href={paidHref}
        className={cn(buttonVariants({ variant: "outline" }), "w-full gap-2 border-green-300 text-green-700 hover:text-green-800", className)}
      >
        <CheckCircle2 className="h-4 w-4" />
        {paidLabel}
      </Link>
    );
  }
  return <CheckoutButton className={className} {...checkoutProps} />;
}
