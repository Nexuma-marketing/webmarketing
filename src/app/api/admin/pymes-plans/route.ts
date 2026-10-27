import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { pymesPlanTotal } from "@/lib/pymes-plan-pricing";

// FIX_PYME_PRICES_SINGLE_SOURCE_REPORT.md: Admin → Pricing → PYME Plans.
// `pymes_plans` is the only source of PYME prices (checkout charges these
// columns). GET: any internal role (read-only view). PUT: admin only.
// A change affects new purchases only: existing subscriptions keep their
// own Stripe price and installment count, and an already-open checkout
// session keeps the amounts in its metadata.

export const dynamic = "force-dynamic";

const INTERNAL_ROLES = ["admin", "marketing", "sales", "support"];
const MAX_INSTALLMENTS = 12;

const PLAN_COLUMNS =
  "id, plan_type, name, price, upfront_amount, installment_amount, installment_months, is_active";

async function getCaller() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  return { id: user.id, role: (profile?.role as string | undefined) || null };
}

export async function GET() {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!caller.role || !INTERNAL_ROLES.includes(caller.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { data, error } = await supabaseAdmin
    .from("pymes_plans")
    .select(PLAN_COLUMNS)
    .eq("is_active", true)
    .order("price", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ plans: data ?? [], canEdit: caller.role === "admin" });
}

// Money: positive, at most 2 decimals.
function parseAmount(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) return null;
  return Math.round(n * 100) / 100;
}

export async function PUT(request: Request) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (caller.role !== "admin") {
    return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
  }

  let body: {
    id?: unknown;
    upfront_amount?: unknown;
    installment_amount?: unknown;
    installment_months?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Plan id required" }, { status: 400 });

  const upfront = parseAmount(body.upfront_amount);
  if (upfront === null) {
    return NextResponse.json(
      { error: "Upfront payment must be greater than 0 (max 2 decimals)." },
      { status: 400 },
    );
  }
  const installmentAmount = parseAmount(body.installment_amount);
  if (installmentAmount === null) {
    return NextResponse.json(
      { error: "Installment amount must be greater than 0 (max 2 decimals)." },
      { status: 400 },
    );
  }
  const months = Number(body.installment_months);
  if (!Number.isInteger(months) || months < 1 || months > MAX_INSTALLMENTS) {
    return NextResponse.json(
      { error: `Number of installments must be a whole number between 1 and ${MAX_INSTALLMENTS}.` },
      { status: 400 },
    );
  }
  const total = pymesPlanTotal(upfront, installmentAmount, months);
  // Always true with the checks above; kept as an explicit guard.
  if (total <= upfront) {
    return NextResponse.json(
      { error: "Total cannot be less than or equal to the upfront payment." },
      { status: 400 },
    );
  }

  const { data: current, error: readErr } = await supabaseAdmin
    .from("pymes_plans")
    .select(PLAN_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!current) return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  if (!current.is_active) {
    return NextResponse.json({ error: "Only active plans can be edited." }, { status: 400 });
  }

  const oldValues = {
    price: Number(current.price),
    upfront_amount: current.upfront_amount === null ? null : Number(current.upfront_amount),
    installment_amount: current.installment_amount === null ? null : Number(current.installment_amount),
    installment_months: current.installment_months === null ? null : Number(current.installment_months),
  };
  const newValues = {
    price: total,
    upfront_amount: upfront,
    installment_amount: installmentAmount,
    installment_months: months,
  };
  if (
    oldValues.price === newValues.price &&
    oldValues.upfront_amount === newValues.upfront_amount &&
    oldValues.installment_amount === newValues.installment_amount &&
    oldValues.installment_months === newValues.installment_months
  ) {
    return NextResponse.json({ error: "No changes to save." }, { status: 400 });
  }

  // Only update if nobody changed the row since we read it.
  let update = supabaseAdmin.from("pymes_plans").update(newValues).eq("id", id);
  update = current.upfront_amount === null ? update.is("upfront_amount", null) : update.eq("upfront_amount", current.upfront_amount);
  update = current.installment_amount === null ? update.is("installment_amount", null) : update.eq("installment_amount", current.installment_amount);
  update = current.installment_months === null ? update.is("installment_months", null) : update.eq("installment_months", current.installment_months);
  const { data: updated, error: updErr } = await update.select(PLAN_COLUMNS);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  if (!updated || updated.length === 0) {
    return NextResponse.json(
      { error: "This plan was changed by someone else. Reload the page and try again." },
      { status: 409 },
    );
  }

  // Audit row. If it can't be written, put the old prices back so there
  // is never a price change without its record.
  const { error: auditErr } = await supabaseAdmin.from("pymes_plan_price_changes").insert({
    plan_id: id,
    changed_by: caller.id,
    old_values: oldValues,
    new_values: newValues,
  });
  if (auditErr) {
    console.error("[admin-pymes-plans] audit insert failed, reverting price change", { id, auditErr });
    const { error: revertErr } = await supabaseAdmin.from("pymes_plans").update(oldValues).eq("id", id);
    if (revertErr) {
      console.error("[admin-pymes-plans] REVERT FAILED — price changed without audit row", {
        id,
        oldValues,
        newValues,
        revertErr,
      });
    }
    return NextResponse.json(
      { error: `Could not record the change, nothing was saved: ${auditErr.message}` },
      { status: 500 },
    );
  }

  // Keep the legacy "Plan: PYMES — X" services row (read-only in Admin →
  // Pricing, shown on some service cards) in step with the plan total.
  const label = String(current.plan_type).charAt(0).toUpperCase() + String(current.plan_type).slice(1);
  const { error: svcErr } = await supabaseAdmin
    .from("services")
    .update({ price: total })
    .eq("name", `Plan: PYMES — ${label}`);
  if (svcErr) {
    console.error("[admin-pymes-plans] services price sync failed", { planType: current.plan_type, svcErr });
  }

  console.log("[admin-pymes-plans] price changed", {
    planId: id,
    planType: current.plan_type,
    changedBy: caller.id,
    oldValues,
    newValues,
  });

  // Pages that show PYME prices read the table on every request; this
  // also drops any cached render.
  revalidatePath("/", "layout");

  return NextResponse.json({
    plan: updated[0],
    servicesSynced: !svcErr,
  });
}
