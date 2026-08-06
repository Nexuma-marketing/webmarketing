import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Steve 6/5 (6-2.md #27): /admin/team was showing the admin row only,
// even after creating marketing / sales / support users — confirmation
// banner said "Created ... as marketing" but the list below stayed at
// 1 row. Same family of bug as the other admin pages — cookie-context
// SELECT on profiles returned an under-populated set. Service-role
// fixes it. Only admin can read the team list (more restrictive than
// other admin endpoints because this exposes the full internal staff
// roster).

export const dynamic = "force-dynamic";

const INTERNAL_TEAM_ROLES = ["admin", "marketing", "sales", "support"];

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
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, email, full_name, role, created_at")
    .in("role", INTERNAL_TEAM_ROLES)
    .order("role")
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json(
      { error: `profiles fetch failed: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ team: data ?? [] });
}
