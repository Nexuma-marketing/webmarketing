import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildPymeInstallmentReport } from "@/lib/pyme-installment-report";

// BUGFIX_SALES_REPORT_PYME.md: "PYME installment plans" section of the
// Sales Report. Admin only (same check as /api/admin/stripe/reconcile).
// Read-only: Supabase SELECTs + Stripe subscriptions list.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
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

  try {
    const report = await buildPymeInstallmentReport();
    return NextResponse.json(report);
  } catch (err) {
    console.error("[sales-report-pyme] Failed to build PYME installment report", err);
    return NextResponse.json({ error: "Failed to build PYME report" }, { status: 500 });
  }
}
