import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { reschedulePremierInstallments } from "@/lib/premier-installments";

// Admin "Reschedule installments" button (property detail modal).
// The Premier Tier installment schedule is normally created once, by
// the Stripe webhook, when the $200 upfront is paid. If that run failed
// (e.g. the missing plan_installments grant fixed by migration v66) the
// property is left with no schedule and nothing ever retries it — this
// endpoint re-runs the same calculation on demand. All eligibility
// checks and the "never delete billed rows" rule live in
// reschedulePremierInstallments (src/lib/premier-installments.ts).

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

  console.log("[premier-installments] Admin reschedule requested", { propertyId, by: user.id });
  const { httpStatus, ...result } = await reschedulePremierInstallments(propertyId);
  return NextResponse.json(result, { status: httpStatus });
}
