import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ensureStripeCustomer, createAndSendStripeInvoice } from "@/lib/balance-invoice";

// PROMPT2 item 5 — daily Vercel Cron (see vercel.json at repo root).
// Finds Premier Tier plan_installments rows whose due_date has arrived
// and status='scheduled', creates + finalizes + sends a Stripe Invoice
// for that installment's exact amount (reusing
// src/lib/balance-invoice.ts's createAndSendStripeInvoice instead of
// duplicating the Stripe Customer/InvoiceItem/Invoice logic), then
// updates the row's status + hosted_invoice_url. Payment confirmation
// itself happens via the invoice.payment_succeeded/failed webhook
// branches keyed on metadata.kind === "plan_installment".
//
// Vercel signs cron-triggered requests with
// `Authorization: Bearer ${CRON_SECRET}` when CRON_SECRET is set in the
// project's env vars — see the report for the exact setup step (this
// repo had no cron infrastructure before this change).

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // No secret configured — refuse rather than run this unauthenticated
    // in production. Local/dev testing should set CRON_SECRET.
    return false;
  }
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${cronSecret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[balance-invoice-diag] process-installments cron started", {
    now: new Date().toISOString(),
  });

  const { data: dueInstallments, error: dueError } = await supabaseAdmin
    .from("plan_installments")
    .select("id, property_id, service_id, sequence, due_date, amount_cents")
    .eq("status", "scheduled")
    .lte("due_date", new Date().toISOString());

  console.log("[balance-invoice-diag] Due installments query completed", {
    count: dueInstallments?.length ?? 0,
    error: dueError,
  });

  if (dueError) {
    return NextResponse.json({ error: dueError.message }, { status: 500 });
  }

  const results: { installmentId: string; success: boolean; error?: string }[] = [];

  for (const installment of dueInstallments ?? []) {
    const installmentId = installment.id as string;
    try {
      const { data: property } = await supabaseAdmin
        .from("properties")
        .select("id, owner_id, address, city")
        .eq("id", installment.property_id as string)
        .single();
      if (!property?.owner_id) {
        throw new Error("Property or owner_id not found");
      }
      const { data: owner } = await supabaseAdmin
        .from("profiles")
        .select("id, email, full_name, stripe_customer_id")
        .eq("id", property.owner_id as string)
        .single();
      if (!owner?.email) {
        throw new Error("Owner has no email");
      }

      const stripeCustomerId = await ensureStripeCustomer(
        owner.id as string,
        owner.email as string,
        owner.full_name as string | null,
        owner.stripe_customer_id as string | null,
      );

      const amountCents = installment.amount_cents as number;
      const created = await createAndSendStripeInvoice({
        stripeCustomerId,
        amountCents,
        itemDescription: `Premier Tier installment ${installment.sequence} — ${property.address}, ${property.city}`,
        invoiceDescription: `Premier Tier installment ${installment.sequence} for ${property.address}`,
        metadata: {
          kind: "plan_installment",
          installment_id: installmentId,
          property_id: property.id as string,
          owner_id: property.owner_id as string,
          sequence: String(installment.sequence),
        },
      });

      const { error: updateError } = await supabaseAdmin
        .from("plan_installments")
        .update({
          status: "invoiced",
          stripe_invoice_id: created.invoiceId,
          hosted_invoice_url: created.hostedInvoiceUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", installmentId);
      if (updateError) throw new Error(updateError.message);

      console.log("[balance-invoice-diag] Installment invoiced", {
        installmentId,
        invoiceId: created.invoiceId,
        amountCents,
      });
      results.push({ installmentId, success: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[balance-invoice-diag] CRITICAL: failed to invoice installment", {
        installmentId,
        error: message,
      });
      results.push({ installmentId, success: false, error: message });
    }
  }

  console.log("[balance-invoice-diag] process-installments cron finished", {
    processed: results.length,
    succeeded: results.filter((r) => r.success).length,
  });

  return NextResponse.json({ processed: results.length, results });
}
