import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buildStripeDbComparison,
  comparisonToCsv,
  parseComparisonDays,
} from "@/lib/stripe-db-comparison";

// FEATURE_STRIPE_DB_COMPARISON_REPORT.md: read-only "Stripe vs Database"
// comparison for the Sales Report. Admin and sales only; any other role
// gets 403. Query: days=30|60|90 (default 90), format=json|csv.
// Never writes to the database or Stripe, never sends email.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const COMPARISON_REPORT_ROLES = ["admin", "sales"];

export async function GET(request: Request) {
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
  if (!callerProfile?.role || !COMPARISON_REPORT_ROLES.includes(callerProfile.role as string)) {
    return NextResponse.json({ error: "Forbidden — admin or sales only" }, { status: 403 });
  }

  const url = new URL(request.url);
  const days = parseComparisonDays(url.searchParams.get("days"));
  const format = url.searchParams.get("format") === "csv" ? "csv" : "json";

  try {
    const report = await buildStripeDbComparison(days);
    if (format === "csv") {
      const filename = `stripe-vs-database-${new Date().toISOString().slice(0, 10)}.csv`;
      return new Response(comparisonToCsv(report), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }
    return NextResponse.json(report);
  } catch (err) {
    console.error("[stripe-db-compare] comparison failed", {
      days,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "The comparison could not be completed (Stripe or database unavailable). Please try again later." },
      { status: 500 },
    );
  }
}
