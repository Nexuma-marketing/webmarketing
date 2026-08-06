"use client";

import { useEffect, useState } from "react";
import {
  PaymentRequestButtonElement,
  useStripe,
  Elements,
} from "@stripe/react-stripe-js";
import type { PaymentRequest } from "@stripe/stripe-js";
import { getStripe } from "@/lib/stripe-client";

interface PaymentRequestButtonInnerProps {
  amount: number;
  label: string;
  onPaymentMethod?: (paymentMethodId: string) => void;
}

function PaymentRequestButtonInner({
  amount,
  label,
  onPaymentMethod,
}: PaymentRequestButtonInnerProps) {
  const stripe = useStripe();
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(
    null
  );

  useEffect(() => {
    if (!stripe) return;

    const pr = stripe.paymentRequest({
      country: "CA",
      currency: "cad",
      total: { label, amount: Math.round(amount * 100) },
      requestPayerName: true,
      requestPayerEmail: true,
    });

    pr.canMakePayment().then((result) => {
      if (result) {
        setPaymentRequest(pr);
      }
    });

    pr.on("paymentmethod", async (ev) => {
      if (onPaymentMethod) {
        onPaymentMethod(ev.paymentMethod.id);
      }
      ev.complete("success");
    });
  }, [stripe, amount, label, onPaymentMethod]);

  if (!paymentRequest) return null;

  return (
    <PaymentRequestButtonElement
      options={{ paymentRequest }}
      className="w-full"
    />
  );
}

interface PaymentRequestButtonProps {
  amount: number;
  label: string;
  onPaymentMethod?: (paymentMethodId: string) => void;
}

export function PaymentRequestButton(props: PaymentRequestButtonProps) {
  return (
    <Elements stripe={getStripe()}>
      <PaymentRequestButtonInner {...props} />
    </Elements>
  );
}
