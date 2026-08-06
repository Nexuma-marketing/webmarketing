import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";
import { formatCurrency } from "@/lib/admin";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CheckCircle2, ArrowRight } from "lucide-react";

async function SuccessContent({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string; plan?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  let sessionDetails: {
    amount: number;
    serviceName: string;
    paymentType: string;
  } | null = null;

  if (params.session_id) {
    try {
      const session = await stripe.checkout.sessions.retrieve(
        params.session_id
      );
      sessionDetails = {
        amount: (session.amount_total || 0) / 100,
        serviceName:
          session.metadata?.plan_type ||
          session.metadata?.service_id ||
          "Service",
        paymentType: session.metadata?.payment_type || "one_time",
      };
    } catch {
      // Session may have expired
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Card className="border-green-200 bg-green-50/50">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <CardTitle className="text-2xl">Payment Successful!</CardTitle>
          <CardDescription>
            Thank you for your purchase. Your payment has been processed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sessionDetails && (
            <div className="rounded-md border bg-card p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-medium">
                  {formatCurrency(sessionDetails.amount)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Type</span>
                <span className="font-medium capitalize">
                  {sessionDetails.paymentType.replace("_", " ")}
                </span>
              </div>
              {sessionDetails.paymentType === "upfront" && (
                <p className="text-xs text-muted-foreground mt-2">
                  Your installment subscription has been set up. Monthly
                  payments will be charged automatically.
                </p>
              )}
            </div>
          )}

          {/* Next steps */}
          <div className="space-y-2">
            <p className="text-sm font-medium">What&apos;s Next?</p>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                A confirmation email has been sent to your inbox
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                Our team will reach out within 24 hours
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                Track your payments in the Payment History section
              </li>
            </ul>
          </div>

          <div className="flex flex-col gap-2 pt-2 sm:flex-row">
            <Link
              href="/dashboard"
              className={buttonVariants({ className: "flex-1 gap-2" })}
            >
              Go to Dashboard
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/dashboard/payments"
              className={buttonVariants({
                variant: "outline",
                className: "flex-1",
              })}
            >
              View Payment History
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function PaymentSuccessPage(props: {
  searchParams: Promise<{ session_id?: string; plan?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      }
    >
      <SuccessContent searchParams={props.searchParams} />
    </Suspense>
  );
}
