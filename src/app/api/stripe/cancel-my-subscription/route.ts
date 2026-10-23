import { NextResponse } from "next/server";

// BUGFIX_CANCELLATIONS_ADMIN_ONLY.md: customers can no longer cancel
// subscriptions or installment plans (PYME, Elite or any other plan).
// Only admin cancels, from the admin panel
// (/admin/payments → "Cancel sub", /api/admin/stripe/cancel-subscription),
// so the customer and commercial get their emails and the database keeps
// a record. This route is kept but disabled: it never calls Stripe and
// always answers 403. Nothing in the app calls it anymore.

export const dynamic = "force-dynamic";

export async function POST() {
  console.warn("[cancel-my-subscription] refused: customer cancellation is disabled");
  return NextResponse.json(
    {
      error:
        "Cancellations can't be made from your account. Please contact your Nexuma representative.",
    },
    { status: 403 },
  );
}
