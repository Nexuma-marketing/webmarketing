import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PaidOrCheckout } from "@/components/dashboard/paid-or-checkout";

// PROMPT2 item 7: standalone purchase of the "Priority Listing
// Placement (1 month)" add-on for an owner who skipped it at checkout.
// One component for both render sites (Dashboard home and Payment
// History) so they always start the exact same checkout. The caller
// decides whether to render it (add-on service active + not already
// purchased for this property).

export const PRIORITY_LISTING_SERVICE_NAME = "Add-on: Priority Listing Placement (1 month)";

export function PriorityListingCard({
  service,
  propertyId,
}: {
  service: { id: string; price: number | string; currency?: string | null };
  /** The property the add-on payment is attributed to. */
  propertyId: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Priority Listing Placement</CardTitle>
        <CardDescription>
          Boost your property to a priority listing position for 1 month.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <PaidOrCheckout
          alreadyPaid={false}
          type="service"
          serviceId={service.id}
          propertyId={propertyId}
          label={`Add priority listing — $${Number(service.price)} ${service.currency || "CAD"}`}
        />
      </CardContent>
    </Card>
  );
}
