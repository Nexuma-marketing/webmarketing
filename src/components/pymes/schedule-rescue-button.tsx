"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CalendarCheck, CheckCircle2 } from "lucide-react";

export function ScheduleRescueButton({ diagnosisId }: { diagnosisId: string }) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/pymes-schedule-rescue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diagnosis_id: diagnosisId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error("Schedule rescue failed:", res.status, body);
        if (res.status === 401) {
          setError("Your session expired. Please refresh the page and try again.");
        } else {
          setError(`Could not submit (status ${res.status}). Please try again.`);
        }
        return;
      }
      setDone(true);
    } catch (err) {
      console.error(err);
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 flex items-center gap-2">
        <CheckCircle2 className="h-5 w-5 text-green-600" />
        <span>Request received. Our team will contact you within 24 hours.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="gap-2"
        onClick={handleClick}
        disabled={submitting}
      >
        <CalendarCheck className="h-4 w-4" />
        {submitting ? "Submitting..." : "Schedule My Rescue Session"}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
