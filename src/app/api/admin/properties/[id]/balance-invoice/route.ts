import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { generateBalanceInvoice, getPropertyPlanName, isPremierTierPlan } from "@/lib/balance-invoice";
import { sendBalanceInvoiceAvailableEmail } from "@/lib/email";

// Steve 6/11 (6-2.md #53): standalone manual-trigger endpoint for the
// residential plan balance invoice. The toggle-off flow on
// /api/admin/properties calls generateBalanceInvoice() directly
// in-process; this endpoint is here so admins can re-trigger if a
// previous run failed.
//
// Body `{ "regenerate": true }` = the "Regenerate balance invoice"
// button in the admin property detail modal (added after the $0-invoice
// bug — see BUGFIX_ZERO_DOLLAR_INVOICE_REPORT.md). Only allowed once
// the tenant lease is signed and never for Premier Tier (installments).
// Voids an open previous invoice, refuses if the previous one was
// really paid, then issues a new one and emails the owner like the
// "Tenant signed lease" action does.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const INTERNAL_WRITE_ROLES = ["admin", "marketing", "sales"];

export async function POST(
  request: Request,
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

  const body = (await request.json().catch(() => ({}))) as { regenerate?: boolean };
  const regenerate = body.regenerate === true;

  if (!regenerate) {
    const result = await generateBalanceInvoice(propertyId);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  }

  const { data: property } = await supabaseAdmin
    .from("properties")
    .select("id, owner_id, address, city, tenant_lease_signed_at")
    .eq("id", propertyId)
    .single();
  if (!property) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }
  if (!property.tenant_lease_signed_at) {
    return NextResponse.json(
      { error: "Tenant lease is not marked as signed yet — use \"Mark tenant signed lease\" instead." },
      { status: 400 },
    );
  }
  const planName = await getPropertyPlanName(propertyId);
  if (isPremierTierPlan(planName)) {
    return NextResponse.json(
      { error: "Premier Tier is billed in scheduled installments, not a lump-sum balance invoice." },
      { status: 400 },
    );
  }

  console.log("[balance-invoice-diag] Admin regenerate requested", { propertyId, by: user.id });
  const result = await generateBalanceInvoice(propertyId, { regenerate: true });

  if (result.success && !result.already_issued && !result.no_balance && result.hosted_invoice_url) {
    const { data: owner } = await supabaseAdmin
      .from("profiles")
      .select("email, full_name")
      .eq("id", property.owner_id as string)
      .single();
    if (owner?.email) {
      await sendBalanceInvoiceAvailableEmail({
        to: owner.email as string,
        customerName: (owner.full_name as string) || "there",
        propertyLabel: `${property.address}, ${property.city}`,
        amountCents: Math.round((result.amount || 0) * 100),
        currency: result.currency,
        dueDate: result.due_date,
      });
    }
  }

  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
