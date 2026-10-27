import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadPymesPlanPricing } from "@/lib/pymes-plan-pricing";

// FIX_PYME_PRICES_SINGLE_SOURCE_REPORT.md: read-only prices of the active
// PYME plans, from the pymes_plans table. Public on purpose: /forms/pymes
// shows the recommended plan's price on the review step, before the
// visitor signs in (anon has no SELECT on pymes_plans). Returns only the
// same numbers every PYME page already shows.
export const dynamic = "force-dynamic";

export async function GET() {
  const plans = await loadPymesPlanPricing(supabaseAdmin);
  return NextResponse.json(
    { plans },
    { headers: { "Cache-Control": "no-store" } },
  );
}
