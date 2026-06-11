import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateBalanceInvoice } from "@/lib/balance-invoice";

// Steve 6/11 (6-2.md #53): standalone manual-trigger endpoint for the
// residential plan balance invoice. The toggle-off flow on
// /api/admin/properties calls generateBalanceInvoice() directly
// in-process; this endpoint is here so admins can re-trigger if a
// previous run failed.

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

  const result = await generateBalanceInvoice(propertyId);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
