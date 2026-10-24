"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

// BUGFIX_CANCELLATIONS_PANEL.md: cancellation modal used by the Sales
// Report PYME section and Admin → Payments. It only calls our server
// route (POST /api/admin/stripe/cancel-subscription), which resolves the
// subscription and enforces roles (sales: end of period only).

export type CancelMode = "end_of_period" | "now";

export interface CancelTarget {
  paymentId: string;
  clientName: string;
  planName: string;
}

const REASON_MIN = 5;
const REASON_MAX = 500;

const MODE_TITLES: Record<CancelMode, string> = {
  end_of_period: "Cancel at end of period",
  now: "Cancel now",
};

const MODE_TEXTS: Record<CancelMode, string> = {
  end_of_period:
    "The subscription will end at the end of the current period; no further charges will be made after that date. The client and the commercial team will be notified by email.",
  now:
    "Charges stop immediately and the plan is canceled now. This cannot be undone. The client and the commercial team will be notified by email.",
};

export function CancelSubscriptionDialog({
  target,
  allowedModes,
  initialMode,
  onClose,
  onDone,
}: {
  /** Null keeps the dialog closed. */
  target: CancelTarget | null;
  /** Modes this viewer may use. With two, the dialog lets them choose. */
  allowedModes: CancelMode[];
  initialMode: CancelMode;
  onClose: () => void;
  /** Called after the request finishes (success or error), to refresh data. */
  onDone: (successMessage: string | null) => void;
}) {
  const [mode, setMode] = useState<CancelMode>(initialMode);
  const [reason, setReason] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset every time the dialog opens for a (new) target.
  useEffect(() => {
    if (target) {
      setMode(allowedModes.includes(initialMode) ? initialMode : allowedModes[0] ?? "end_of_period");
      setReason("");
      setUnderstood(false);
      setError(null);
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, initialMode]);

  const trimmed = reason.trim();
  const reasonValid = trimmed.length >= REASON_MIN && trimmed.length <= REASON_MAX;
  const canConfirm = reasonValid && (mode !== "now" || understood) && !busy && allowedModes.includes(mode);

  async function confirm() {
    if (!target || !canConfirm) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/stripe/cancel-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId: target.paymentId, mode, reason: trimmed }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        message?: string;
        warning?: string | null;
        error?: string;
      };
      if (!res.ok) {
        setError(body.error || `The cancellation failed (${res.status}).`);
        onDone(null);
        return;
      }
      const message = [body.message || "Done.", body.warning || ""].filter(Boolean).join(" ");
      onDone(message);
      onClose();
    } catch {
      setError("The cancellation request failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={!!target}
      onOpenChange={(open: boolean) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{MODE_TITLES[mode]}</DialogTitle>
          <DialogDescription>
            {target ? (
              <>
                <span className="font-medium text-foreground">{target.clientName}</span> — {target.planName}
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {allowedModes.length > 1 && (
          <div className="flex gap-2">
            {allowedModes.map((m) => (
              <Button
                key={m}
                size="sm"
                variant={mode === m ? (m === "now" ? "destructive" : "default") : "outline"}
                onClick={() => {
                  setMode(m);
                  setUnderstood(false);
                }}
                disabled={busy}
              >
                {MODE_TITLES[m]}
              </Button>
            ))}
          </div>
        )}

        <p className={mode === "now" ? "text-sm font-medium text-red-700" : "text-sm"}>{MODE_TEXTS[mode]}</p>

        <div className="space-y-1">
          <label htmlFor="cancel-reason" className="text-sm font-medium">
            Reason (required)
          </label>
          <Textarea
            id="cancel-reason"
            value={reason}
            maxLength={REASON_MAX}
            onChange={(e) => setReason(e.target.value)}
            placeholder="What did the client ask for, and why?"
            disabled={busy}
          />
          <p className={`text-xs ${reasonValid || trimmed.length === 0 ? "text-muted-foreground" : "text-red-600"}`}>
            {trimmed.length}/{REASON_MAX} · minimum {REASON_MIN} characters
          </p>
        </div>

        {mode === "now" && (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={understood}
              onChange={(e) => setUnderstood(e.target.checked)}
              disabled={busy}
            />
            I understand this cancels the plan immediately
          </label>
        )}

        {error && (
          <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Close
          </Button>
          <Button variant={mode === "now" ? "destructive" : "default"} onClick={confirm} disabled={!canConfirm}>
            {busy ? "Working…" : MODE_TITLES[mode]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
