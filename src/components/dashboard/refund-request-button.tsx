"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RotateCcw } from "lucide-react";

// Steve 6/10 (6-2.md #52): Alex 2026-06-07 — "Donde el cliente pide
// una devolucion de dinero?" Customer-facing refund request button
// on /dashboard/payments. Opens a modal asking for a reason, then
// POSTs to /api/dashboard/refund-request which emails the commercial
// team with the payment context + reason. Admin still processes the
// actual Stripe refund through /admin/payments — this just turns the
// request from an out-of-band email into a structured submission.

export function RefundRequestButton({
  paymentId,
  serviceName,
  amount,
  currency,
  paymentDate,
}: {
  paymentId: string;
  serviceName: string;
  amount: number;
  currency: string;
  paymentDate: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (reason.trim().length < 5) {
      setError("Please write at least a few words about why you want a refund.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/dashboard/refund-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payment_id: paymentId, reason: reason.trim() }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error || `Submission failed (${res.status})`);
      return;
    }
    setDone(true);
  }

  function close() {
    if (submitting) return;
    setOpen(false);
    setReason("");
    setDone(false);
    setError(null);
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <RotateCcw className="h-3 w-3 mr-1" />
        Request refund
      </Button>
      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request a refund</DialogTitle>
            <DialogDescription>
              {serviceName} — {amount.toLocaleString()} {currency} — paid {paymentDate}
            </DialogDescription>
          </DialogHeader>
          {done ? (
            <div className="space-y-3">
              <p className="text-sm text-green-700">
                Your refund request has been submitted. Our team will review it
                and contact you within 2 business days.
              </p>
              <DialogFooter>
                <Button onClick={close}>Close</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-3">
              {error && (
                <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="refund-reason">Why are you requesting a refund?</Label>
                <Textarea
                  id="refund-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={4}
                  placeholder="e.g., I was double-charged / the service was not what I expected / technical issue at signup..."
                />
                <p className="text-xs text-muted-foreground">
                  Per our policy all sales are final, but exceptional cases
                  (technical errors, duplicate charges) are reviewed by the team.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={close} disabled={submitting}>
                  Cancel
                </Button>
                <Button onClick={submit} disabled={submitting}>
                  {submitting ? "Submitting…" : "Submit request"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
