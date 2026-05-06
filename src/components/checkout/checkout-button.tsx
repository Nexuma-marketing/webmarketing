"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, CreditCard, ArrowRight, Tag, X } from "lucide-react";

interface CheckoutButtonProps {
  type: "service" | "pymes_upfront";
  serviceId?: string;
  pymesPlanId?: string;
  label?: string;
  variant?: "default" | "outline" | "secondary";
  size?: "default" | "sm" | "lg";
  className?: string;
}

export function CheckoutButton({
  type,
  serviceId,
  pymesPlanId,
  label = "Purchase",
  variant = "default",
  size = "default",
  className,
}: CheckoutButtonProps) {
  const [loading, setLoading] = useState(false);
  // Steve 5/4 Milestone 4: optional promo code input. Hidden by default
  // so the existing single-button checkout flow is preserved; user opts
  // in by clicking "Have a promo code?".
  const [showPromo, setShowPromo] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoError, setPromoError] = useState<string | null>(null);

  async function handleCheckout() {
    setLoading(true);
    setPromoError(null);

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          serviceId,
          pymesPlanId,
          promoCode: promoCode.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        // If the API rejected the promo code, surface the error inline so
        // the user can fix it without losing the rest of the purchase
        // intent. Other errors still log to console.
        if (data.error && promoCode) {
          setPromoError(data.error);
        } else {
          console.error("Checkout error:", data.error);
        }
        setLoading(false);
      }
    } catch (err) {
      console.error("Checkout failed:", err);
      setLoading(false);
    }
  }

  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <Button
        onClick={handleCheckout}
        disabled={loading}
        variant={variant}
        size={size}
        className="w-full"
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <CreditCard className="mr-2 h-4 w-4" />
            {label}
            <ArrowRight className="ml-1 h-4 w-4" />
          </>
        )}
      </Button>

      {showPromo ? (
        <div className="rounded-md border border-dashed border-amber-300 bg-amber-50/50 p-2 space-y-1.5">
          <div className="flex items-center gap-2">
            <Tag className="h-3.5 w-3.5 text-amber-700 shrink-0" />
            <Input
              value={promoCode}
              onChange={(e) => {
                setPromoCode(e.target.value.toUpperCase());
                setPromoError(null);
              }}
              placeholder="Promo code"
              className="h-8 text-xs uppercase"
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => {
                setShowPromo(false);
                setPromoCode("");
                setPromoError(null);
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
              aria-label="Close promo code field"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {promoError && (
            <p className="text-xs text-red-600 pl-5">{promoError}</p>
          )}
          {promoCode && !promoError && (
            <p className="text-xs text-amber-700 pl-5">
              Code will be validated when you click {label}.
            </p>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowPromo(true)}
          className="text-xs text-muted-foreground hover:text-primary underline-offset-2 hover:underline flex items-center gap-1"
        >
          <Tag className="h-3 w-3" />
          Have a promo code?
        </button>
      )}
    </div>
  );
}
