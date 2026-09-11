import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { CheckCircle2, Zap, ArrowRight } from "lucide-react";
import { CheckoutButton } from "@/components/checkout/checkout-button";
import type { PymesPlanDetails } from "@/lib/pymes-plan-display";

// Steve — PYME dashboard/services UX fix: this is the working plan card
// (with the real "Pay $X CAD upfront" Stripe checkout button) previously
// only rendered on /dashboard/services. It is now shared with the
// Dashboard home page so "Start Now" reuses the same working button
// instead of a dead #contact anchor.
export function PymesPlanCard({
  planDetails,
  pymesPlanRecordId,
}: {
  planDetails: PymesPlanDetails;
  pymesPlanRecordId?: string | null;
}) {
  return (
    <Card className={`${planDetails.borderColor} ${planDetails.bgColor}`}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Zap className={`h-5 w-5 ${planDetails.color}`} />
          <CardTitle className="text-lg">
            Your Recommended Plan: {planDetails.name}
          </CardTitle>
        </div>
        <CardDescription>{planDetails.tagline}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <span className={`text-3xl font-bold ${planDetails.color}`}>
            {planDetails.price}
          </span>
          <p className="text-sm text-muted-foreground">{planDetails.duration}</p>
          <div className="rounded-md border bg-card p-3 space-y-1.5">
            <p className="text-xs font-medium">Payment Options:</p>
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="outline" className="text-xs shrink-0">Option 1</Badge>
              <span className="text-muted-foreground">
                {planDetails.upfront}, then {planDetails.installment}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="outline" className="text-xs shrink-0">Option 2</Badge>
              <span className="text-muted-foreground">Full payment upfront (100%)</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Accepted: e-Transfer, credit card, or bank transfer
            </p>
          </div>
        </div>
        <ul className="space-y-1.5">
          {planDetails.features.map((feature, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${planDetails.color}`} />
              {feature}
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2 sm:flex-row">
          {pymesPlanRecordId ? (
            <CheckoutButton
              type="pymes_upfront"
              pymesPlanId={pymesPlanRecordId}
              label={`Pay ${planDetails.upfront}`}
              className="flex-1"
            />
          ) : (
            <Link
              href="/dashboard/services#contact"
              className={cn(buttonVariants(), "flex-1 gap-2")}
            >
              Start Now
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
          <Link
            href="/dashboard/services#contact"
            className={cn(buttonVariants({ variant: "outline" }), "flex-1 gap-2")}
          >
            Schedule a Consultation
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
