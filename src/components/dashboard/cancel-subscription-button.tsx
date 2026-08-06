"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

// Steve 5/16 Milestone 4: user-facing cancel button for an active
// installment subscription. Hits /api/admin/stripe/cancel-subscription
// — that endpoint also accepts cancellation requests from the
// subscription's own user (the route checks role==='admin' OR the
// caller owns a payment row tied to the subscription).
//
// On success we don't optimistically mutate UI; we hard-reload so the
// page picks up the webhook-written 'canceled' status.

export function CancelSubscriptionButton({
  subscriptionId,
}: {
  subscriptionId: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCancel() {
    if (
      !confirm(
        "Cancel this installment plan?\n\n" +
          "Stripe will stop charging future months immediately. " +
          "Past payments are not refunded automatically — contact support if you believe a refund is due.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/stripe/cancel-my-subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscriptionId }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || res.statusText);
      setBusy(false);
      return;
    }
    // Force reload so the page re-renders with the new 'canceled' row
    // the webhook wrote.
    window.location.reload();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={handleCancel}
        className="border-red-300 text-red-700 hover:bg-red-50"
      >
        {busy ? "Canceling…" : "Cancel installments"}
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
