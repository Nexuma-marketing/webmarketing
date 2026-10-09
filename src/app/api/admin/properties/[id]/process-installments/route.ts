import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { processDueInstallments } from "@/lib/premier-installments";

// Admin "Process due installments" button (property detail modal).
// Vercel's scheduled cron only runs on Production deployments, so on
// Preview the daily /api/cron/process-installments never fires. This
// runs the exact same processDueInstallments() the cron uses, scoped to
// this one property: only rows already `scheduled` with a due_date that
// has arrived — never future installments.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const INTERNAL_WRITE_ROLES = ["admin", "marketing", "sales"];

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: propertyId } = await context.params;
  if (!propertyId) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

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
  if (!callerProfile?.role || !INTERNAL_WRITE_ROLES.includes(callerProfile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  console.log("[premier-installments] Admin process-due-installments requested", { propertyId, by: user.id });
  const { error, results } = await processDueInstallments({ propertyId });
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }
  console.log("[premier-installments] Admin process-due-installments finished", {
    propertyId,
    processed: results.length,
    succeeded: results.filter((r) => r.success).length,
  });

  // Fresh list so the modal shows the new statuses without a reload.
  const { data: installments } = await supabaseAdmin
    .from("plan_installments")
    .select("sequence, due_date, percentage, amount_cents, status")
    .eq("property_id", propertyId)
    .order("sequence", { ascending: true });

  return NextResponse.json({ processed: results.length, results, installments: installments ?? null });
}
