import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Steve 6/8 (6-2.md #36): Alex screenshot 6 of 2026-06-07 docx
// Item 6 — she created the promo "POR CREER", later edited its
// validity to 2026-06-04 → 2026-06-30, and the admin form showed
// the new dates. But SQL diagnostic on 2026-06-08 revealed the DB
// still had valid_from=2026-05-23 / valid_until=2026-05-31 (the
// original creation dates). The promo was expired and the
// /dashboard/services + public landing banner correctly hid it,
// matching her complaint "no le sale al cliente".
//
// Same admin-write-blocked-by-RLS pattern as every other admin
// surface this week. Cookie-context UPDATEs on promotions returned
// no error but applied nothing.
//
// Service-role route lets admins create / edit / delete promos
// reliably. Read endpoint is admin-only (promotions are internal
// admin data; the dashboard banner uses a separate service-role
// path).

export const dynamic = "force-dynamic";

const ADMIN_ROLE = "admin";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in", status: 401 };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== ADMIN_ROLE) {
    return { error: "Forbidden — admin only", status: 403 };
  }
  return { ok: true as const };
}

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { data, error } = await supabaseAdmin
    .from("promotions")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ promotions: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = await request.json().catch(() => ({}));
  const { error, data } = await supabaseAdmin
    .from("promotions")
    .insert(body)
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ promotion: data });
}

export async function PUT(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = await request.json().catch(() => ({}));
  const { id, ...updates } = body as { id?: string } & Record<string, unknown>;
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const { error } = await supabaseAdmin.from("promotions").update(updates).eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const { error } = await supabaseAdmin.from("promotions").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
