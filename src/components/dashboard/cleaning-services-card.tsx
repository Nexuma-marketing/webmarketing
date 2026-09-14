"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Sparkles } from "lucide-react";

// Steve — Tenant services fix: Cleaning Services is a lead-gen concept
// (the business plans to partner with cleaning companies who pay a
// referral fee per tenant lead), not a purchasable plan — there's no
// price and no cleaning partner integrated yet. So instead of a
// CheckoutButton like the other tenant services, this just posts to
// /api/dashboard/cleaning-interest to notify the commercial team.
export function CleaningServicesCard() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function handleContact() {
    setStatus("sending");
    try {
      const res = await fetch("/api/dashboard/cleaning-interest", { method: "POST" });
      if (!res.ok) throw new Error("request failed");
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  }

  return (
    <Card className="flex flex-col opacity-75">
      <CardHeader>
        <div className="flex items-start justify-between">
          <CardTitle className="text-lg">Cleaning Services</CardTitle>
          <Badge variant="outline">Contact only</Badge>
        </div>
        <CardDescription>
          Need help keeping your place spotless? Let us know and we&apos;ll
          connect you with a trusted cleaning provider.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-end gap-3">
        {status === "sent" ? (
          <p className="flex items-center gap-1.5 text-sm text-green-600">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Thanks! Our team will follow up soon.
          </p>
        ) : (
          <>
            {status === "error" && (
              <p className="text-sm text-red-600">
                Something went wrong. Please try again.
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              onClick={handleContact}
              disabled={status === "sending"}
            >
              <Sparkles className="h-4 w-4" />
              {status === "sending" ? "Sending…" : "Contact Us"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
