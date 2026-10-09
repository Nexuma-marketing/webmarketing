import { NextResponse } from "next/server";
import { processDueInstallments } from "@/lib/premier-installments";

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

  // Selection + Stripe invoicing live in processDueInstallments
  // (src/lib/premier-installments.ts), shared with the admin "Process
  // due installments" button.
  const { error: dueError, results } = await processDueInstallments();
  if (dueError) {
    return NextResponse.json({ error: dueError }, { status: 500 });
  }

  console.log("[balance-invoice-diag] process-installments cron finished", {
    processed: results.length,
    succeeded: results.filter((r) => r.success).length,
  });

  return NextResponse.json({ processed: results.length, results });
}
