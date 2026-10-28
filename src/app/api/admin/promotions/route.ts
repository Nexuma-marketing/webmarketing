import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizePromoCode, validatePromotionInput } from "@/lib/promotions";

// Steve 6/8 (6-2.md #36): cookie-context UPDATEs on promotions
// returned no error but applied nothing, so this route writes with the
// service role.
//
// FIX_PROMOTIONS_REPORT.md: admin, marketing and sales can list,
// create, edit and activate/deactivate; only admin can delete. Every
// write is validated (src/lib/promotions.ts) and only known columns are
// written — never used_count, and never target_zones (zones are no
// longer used).

export const dynamic = "force-dynamic";

const MANAGER_ROLES = ["admin", "marketing", "sales"];

async function requireRole(allowed: string[]) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in", status: 401 };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const role = (profile?.role as string | undefined) ?? null;
  if (!role || !allowed.includes(role)) {
    return { error: "Forbidden", status: 403 };
  }
  return { ok: true as const, role };
}

/** Another promotion already uses this code (case-insensitive)? */
async function codeTaken(code: string, exceptId?: string): Promise<boolean | null> {
  let query = supabaseAdmin.from("promotions").select("id").ilike("code", code.replace(/[\\%_]/g, (c) => `\\${c}`));
  if (exceptId) query = query.neq("id", exceptId);
  const { data, error } = await query.limit(1);
  if (error) return null;
  return (data?.length ?? 0) > 0;
}

function writeError(error: { code?: string; message: string }) {
  if (error.code === "23505") {
    return NextResponse.json({ error: "A promotion with this code already exists." }, { status: 409 });
  }
  if (error.code === "23514") {
    return NextResponse.json({ error: `Invalid value: ${error.message}` }, { status: 400 });
  }
  return NextResponse.json({ error: error.message }, { status: 500 });
}

export async function GET() {
  const auth = await requireRole(MANAGER_ROLES);
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
  return NextResponse.json({ promotions: data ?? [], canDelete: auth.role === "admin" });
}

export async function POST(request: Request) {
  const auth = await requireRole(MANAGER_ROLES);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const checked = validatePromotionInput(body);
  if (!checked.ok) {
    return NextResponse.json({ error: checked.errors.join(" ") }, { status: 400 });
  }
  const taken = await codeTaken(checked.value.code);
  if (taken === null) {
    return NextResponse.json({ error: "Could not check the code. Try again." }, { status: 503 });
  }
  if (taken) {
    return NextResponse.json({ error: "A promotion with this code already exists." }, { status: 409 });
  }
  const { error, data } = await supabaseAdmin
    .from("promotions")
    .insert({ ...checked.value, used_count: 0 })
    .select()
    .single();
  if (error) return writeError(error);
  return NextResponse.json({ promotion: data });
}

export async function PUT(request: Request) {
  const auth = await requireRole(MANAGER_ROLES);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id : null;
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const { data: current, error: currentError } = await supabaseAdmin
    .from("promotions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (currentError) {
    return NextResponse.json({ error: currentError.message }, { status: 500 });
  }
  if (!current) {
    return NextResponse.json({ error: "Promotion not found" }, { status: 404 });
  }

  // Partial updates (e.g. only is_active from the list toggle) are
  // checked against the full row they produce.
  const { id: _id, ...updates } = body;
  void _id;
  // Turning a code off is always allowed, even for an old row that
  // doesn't meet the current rules (e.g. a 100% code).
  if (Object.keys(updates).length === 1 && updates.is_active === false) {
    const { error } = await supabaseAdmin
      .from("promotions")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return writeError(error);
    return NextResponse.json({ success: true });
  }
  const checked = validatePromotionInput({ ...current, ...updates });
  if (!checked.ok) {
    return NextResponse.json({ error: checked.errors.join(" ") }, { status: 400 });
  }
  if (normalizePromoCode(current.code) !== checked.value.code) {
    const taken = await codeTaken(checked.value.code, id);
    if (taken === null) {
      return NextResponse.json({ error: "Could not check the code. Try again." }, { status: 503 });
    }
    if (taken) {
      return NextResponse.json({ error: "A promotion with this code already exists." }, { status: 409 });
    }
  }
  const { error } = await supabaseAdmin
    .from("promotions")
    .update({ ...checked.value, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return writeError(error);
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) {
    return NextResponse.json(
      { error: auth.status === 403 ? "Forbidden — only admin can delete promotions" : auth.error },
      { status: auth.status },
    );
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
