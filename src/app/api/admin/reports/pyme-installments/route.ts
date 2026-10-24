import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildPymeInstallmentReport } from "@/lib/pyme-installment-report";

// BUGFIX_SALES_REPORT_PYME.md: "PYME installment plans" section of the
// Sales Report. Admin and sales only
// (BUGFIX_SALES_REPORT_PYME_SALES_ROLE.md); any other role gets 403.
// Read-only: Supabase SELECTs + Stripe subscriptions list.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PYME_REPORT_ROLES = ["admin", "sales"];

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
  if (!callerProfile?.role || !PYME_REPORT_ROLES.includes(callerProfile.role as string)) {
    return NextResponse.json({ error: "Forbidden — admin or sales only" }, { status: 403 });
  }

  try {
    const report = await buildPymeInstallmentReport();
    return NextResponse.json(report);
  } catch (err) {
    console.error("[sales-report-pyme] Failed to build PYME installment report", err);
    return NextResponse.json({ error: "Failed to build PYME report" }, { status: 500 });
  }
}
