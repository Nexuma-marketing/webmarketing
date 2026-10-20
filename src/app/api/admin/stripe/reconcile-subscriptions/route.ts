import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { reconcileMissingSubscriptions } from "@/lib/subscription-reconcile";

// BUGFIX_ELITE_PYME_SUBSCRIPTIONS.md: manual run of the Elite/PYME
// missing-subscription reconcile that the daily
// /api/cron/process-installments cron also runs. Accepts the cron's
// `Authorization: Bearer ${CRON_SECRET}` or a signed-in admin.
// Body (optional): { "dryRun": true } reports what it would do without
// creating subscriptions, updating rows or sending emails.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function isAuthorized(request: Request): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get("authorization") === `Bearer ${cronSecret}`) return true;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  return callerProfile?.role === "admin";
}

export async function POST(request: Request) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
  }

  let dryRun = false;
  try {
    const body = await request.json();
    dryRun = body?.dryRun === true;
  } catch {
    // No/invalid body → real run.
  }

  try {
    const summary = await reconcileMissingSubscriptions({ dryRun });
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[subscription-reconcile] CRITICAL: manual run failed", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
