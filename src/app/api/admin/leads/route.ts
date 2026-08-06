import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Steve 6/8 (6-2.md #32): /admin/leads was showing "No results
// found" for sales / marketing / support roles even though leads
// exist. The page was using a cookie-context client to SELECT *
// from leads; RLS allowed admin but silently returned 0 rows for
// internal roles. Sales literally cannot do their job (manage
// leads) if they can't read leads. Same service-role bypass
// pattern used everywhere else this week.
//
// Returns BOTH leads and admin roster (for the Assigned-To
// dropdown in the lead edit dialog) in one call to avoid two
// round-trips.
//
// PATCH endpoint mirrors the same internal-role gate and applies
// status / notes / assigned_to updates the lead edit dialog needs.

export const dynamic = "force-dynamic";

const INTERNAL_ROLES = ["admin", "marketing", "sales", "support"];
const LEAD_WRITE_ROLES = ["admin", "sales"];

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
  if (!callerProfile?.role || !INTERNAL_ROLES.includes(callerProfile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Steve 6/8 (6-2.md #33): Alex reported screenshot 5 — the
  // "Assign to" dropdown in the Manage Lead dialog only showed her
  // own admin row. Annotation: "no trae a los miembros del team.
  // Commercial Marketing?" Marketing + Sales team members were
  // invisible because this query filtered profiles by role=admin
  // only. Widened to all internal roles (admin / marketing / sales
  // / support) so any internal team member can be assigned to a
  // lead. The field is still labelled "admins" on the wire for
  // backwards-compat with the existing client; the page renders
  // them as generic assignable internal users.
  const [leadsRes, assigneeRes] = await Promise.all([
    supabaseAdmin.from("leads").select("*").order("created_at", { ascending: false }),
    supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, role")
      .in("role", INTERNAL_ROLES)
      .order("role")
      .order("full_name"),
  ]);

  if (leadsRes.error) {
    return NextResponse.json(
      { error: `leads fetch failed: ${leadsRes.error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    leads: leadsRes.data ?? [],
    admins: assigneeRes.data ?? [],
  });
}

export async function PATCH(request: Request) {
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
  // Steve 6/8: marketing + support are READ-ONLY on leads per the
  // permission matrix shown on /admin/team. Only admin + sales can
  // edit status / notes / assignment.
  if (!callerProfile?.role || !LEAD_WRITE_ROLES.includes(callerProfile.role)) {
    return NextResponse.json({ error: "Forbidden — read-only for your role" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { id, status, notes, assigned_to } = body as {
    id?: string;
    status?: string;
    notes?: string | null;
    assigned_to?: string | null;
  };
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof status !== "undefined") updates.status = status;
  if (typeof notes !== "undefined") updates.notes = notes;
  if (typeof assigned_to !== "undefined") updates.assigned_to = assigned_to;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("leads").update(updates).eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
