import { NextResponse } from "next/server";
import { processDueInstallments } from "@/lib/premier-installments";
import { reconcileMissingSubscriptions } from "@/lib/subscription-reconcile";

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
  let dueError: string | null | undefined = null;
  let results: Awaited<ReturnType<typeof processDueInstallments>>["results"] = [];
  try {
    ({ error: dueError, results } = await processDueInstallments());
  } catch (err) {
    dueError = err instanceof Error ? err.message : String(err);
    console.error("[balance-invoice-diag] process-installments threw", { error: dueError });
  }

  if (!dueError) {
    console.log("[balance-invoice-diag] process-installments cron finished", {
      processed: results.length,
      succeeded: results.filter((r) => r.success).length,
    });
  }

  // BUGFIX_ELITE_PYME_SUBSCRIPTIONS.md: separate step on the same daily
  // cron (Vercel Hobby allows no extra cron entry). Its own try/catch:
  // a failure here never affects the installments step, and vice versa.
  let reconcile: { checked: number; outcomes: Record<string, number> } | { error: string };
  try {
    const summary = await reconcileMissingSubscriptions();
    reconcile = {
      checked: summary.checked,
      outcomes: summary.results.reduce<Record<string, number>>((acc, r) => {
        acc[r.outcome] = (acc[r.outcome] || 0) + 1;
        return acc;
      }, {}),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[subscription-reconcile] CRITICAL: reconcile step failed", { error: message });
    reconcile = { error: message };
  }

  if (dueError) {
    return NextResponse.json({ error: dueError, reconcile }, { status: 500 });
  }
  return NextResponse.json({ processed: results.length, results, reconcile });
}
