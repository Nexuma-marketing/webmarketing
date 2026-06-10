import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getStripeServer } from "@/lib/stripe";

// Steve 6/10 (6-2.md #49): Alex docx 2026-06-07 pending list,
// last bullet — sales report says CA$490 but Stripe ledger says
// CA$1,520.34. Our payments table is missing rows that exist in
// Stripe because (a) the v33-style profile cleanup CASCADE-deleted
// alexsmarke@gmail.com's payments earlier today, and (b) some
// older webhooks may have missed.
//
// This endpoint walks Stripe's checkout.sessions in a given date
// window, matches each completed paid session against our
// payments table by stripe_session_id, and inserts any that are
// missing. Stripe is treated as the source of truth.
//
// Available to admin only — this writes to a financial ledger
// and could double-insert if misused.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (callerProfile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
  }

  // Default window: last 90 days. Caller can override with `days`.
  const body = await request.json().catch(() => ({}));
  const days = Math.min(Math.max(Number(body.days) || 90, 1), 365);
  const cutoffSeconds = Math.floor(Date.now() / 1000) - days * 86400;

  const stripe = getStripeServer();

  // Walk every Stripe checkout session in the window. The Stripe
  // API caps at 100/page so we paginate explicitly.
  const sessions: Array<{
    id: string;
    payment_intent: string | null;
    payment_status: string;
    amount_total: number | null;
    currency: string | null;
    customer_email: string | null;
    metadata: Record<string, string> | null;
    created: number;
  }> = [];
  let startingAfter: string | undefined;
  let fetched = 0;
  while (fetched < 1000) {
    const page = await stripe.checkout.sessions.list({
      limit: 100,
      created: { gte: cutoffSeconds },
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    for (const s of page.data) {
      sessions.push({
        id: s.id,
        payment_intent: typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? null,
        payment_status: s.payment_status ?? "unpaid",
        amount_total: s.amount_total,
        currency: s.currency,
        customer_email: s.customer_details?.email ?? s.customer_email ?? null,
        metadata: s.metadata ?? null,
        created: s.created,
      });
    }
    fetched += page.data.length;
    if (!page.has_more) break;
    startingAfter = page.data[page.data.length - 1]?.id;
    if (!startingAfter) break;
  }

  const paidSessions = sessions.filter((s) => s.payment_status === "paid");
  if (paidSessions.length === 0) {
    return NextResponse.json({
      summary: { stripe_paid_sessions: 0, already_in_db: 0, inserted: 0, missing_user: 0 },
      message: "No paid Stripe sessions found in window.",
    });
  }

  // Check which session ids we already have.
  const sessionIds = paidSessions.map((s) => s.id);
  const { data: existingRows } = await supabaseAdmin
    .from("payments")
    .select("stripe_session_id")
    .in("stripe_session_id", sessionIds);
  const haveSet = new Set((existingRows ?? []).map((r) => r.stripe_session_id as string));

  // Try to resolve each missing session to a profile via customer
  // email so the new row carries a valid user_id where possible.
  const missing = paidSessions.filter((s) => !haveSet.has(s.id));
  const emails = Array.from(
    new Set(missing.map((s) => (s.customer_email || "").toLowerCase()).filter(Boolean)),
  );
  let emailToUserId: Record<string, string> = {};
  if (emails.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, email")
      .in("email", emails);
    emailToUserId = Object.fromEntries(
      (profiles ?? []).map((p) => [
        (p.email as string).toLowerCase(),
        p.id as string,
      ]),
    );
  }

  let inserted = 0;
  let missingUser = 0;
  for (const s of missing) {
    // Steve 6/10: v36 changed payments.user_id to ON DELETE SET
    // NULL, but the column was originally NOT NULL until the same
    // migration relaxed it. New rows with no resolvable user are
    // inserted with user_id = NULL and rendered as "Unknown" on
    // the admin views.
    const email = (s.customer_email || "").toLowerCase();
    const userId = email ? emailToUserId[email] ?? null : null;
    if (!userId) missingUser++;

    // Best-effort: tag the row's payment_type based on the
    // session's metadata, falling back to "one_time".
    const payment_type = (s.metadata?.payment_type as string) || "one_time";
    const service_id = (s.metadata?.service_id as string) || null;
    const pymes_plan_id = (s.metadata?.pymes_plan_id as string) || null;

    const { error } = await supabaseAdmin.from("payments").insert({
      user_id: userId,
      service_id,
      pymes_plan_id,
      stripe_session_id: s.id,
      stripe_payment_intent_id: s.payment_intent,
      amount: ((s.amount_total ?? 0) as number) / 100,
      currency: (s.currency || "cad").toUpperCase(),
      payment_type,
      status: "completed",
      created_at: new Date(s.created * 1000).toISOString(),
    });
    if (!error) inserted++;
  }

  return NextResponse.json({
    summary: {
      stripe_paid_sessions: paidSessions.length,
      already_in_db: paidSessions.length - missing.length,
      inserted,
      missing_user: missingUser,
      window_days: days,
    },
  });
}
