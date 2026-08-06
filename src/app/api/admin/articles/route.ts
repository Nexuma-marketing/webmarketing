import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Steve 6/8 (6-2.md #32): /admin/articles was using a cookie-context
// client for SELECT/INSERT/UPDATE/DELETE. Marketing role would click
// "Create" and the dialog would close without error, but the article
// never showed in the list afterwards — RLS on articles silently
// returned 0 rows for marketing on the follow-up SELECT (and likely
// blocked INSERT too). Alex's complaint: "creé uno pero no aparece
// en ningún lado de la web."
//
// Service-role gate:
//   - GET: any internal role (admin, marketing, sales, support)
//   - POST/PUT/DELETE: admin + marketing only (per the permission
//     matrix shown on /admin/team)
//
// Public /blog/* pages stay on their existing query path
// (server-side render filtering is_published=true) — those don't
// need RLS bypass because anon SELECT is intentionally allowed.

export const dynamic = "force-dynamic";

const READ_ROLES = ["admin", "marketing", "sales", "support"];
const WRITE_ROLES = ["admin", "marketing"];

async function requireRole(allowed: string[]) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in", status: 401 };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile?.role || !allowed.includes(profile.role)) {
    return { error: "Forbidden", status: 403 };
  }
  return { ok: true as const };
}

export async function GET() {
  const auth = await requireRole(READ_ROLES);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { data, error } = await supabaseAdmin
    .from("articles")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ articles: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireRole(WRITE_ROLES);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = await request.json().catch(() => ({}));
  const { error, data } = await supabaseAdmin.from("articles").insert(body).select().single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ article: data });
}

export async function PUT(request: Request) {
  const auth = await requireRole(WRITE_ROLES);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = await request.json().catch(() => ({}));
  const { id, ...updates } = body as { id?: string } & Record<string, unknown>;
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const { error } = await supabaseAdmin.from("articles").update(updates).eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const auth = await requireRole(WRITE_ROLES);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const { error } = await supabaseAdmin.from("articles").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
