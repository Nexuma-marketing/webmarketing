import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Steve 6/8 (6-2.md #31): /admin/users page was showing only the
// admin's own row (1 result) instead of every registered user. Same
// admin-SELECT-on-profiles RLS quirk that has plagued every other
// admin surface — service-role + internal-role gate to bypass.
//
// Returns the full profiles roster for display + edit in the admin UI.

export const dynamic = "force-dynamic";

const INTERNAL_ROLES = ["admin", "marketing", "sales", "support"];

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

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email, phone, role, property_count, is_premium_tenant, created_at")
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json(
      { error: `profiles fetch failed: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ users: data ?? [] });
}

// Steve 6/8 (6-2.md #31 Option B): PATCH endpoint so the admin Edit
// dialog can update name + phone + role for any user. Admin-only —
// changing roles is a privileged action, marketing/sales/support
// shouldn't be able to assign someone admin via the UI.

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
  if (callerProfile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { id, full_name, phone, role } = body as {
    id?: string;
    full_name?: string | null;
    phone?: string | null;
    role?: string;
  };
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof full_name !== "undefined") updates.full_name = full_name || null;
  if (typeof phone !== "undefined") updates.phone = phone || null;
  if (typeof role !== "undefined") {
    updates.role = role;
    updates.role_locked = true;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("profiles").update(updates).eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
