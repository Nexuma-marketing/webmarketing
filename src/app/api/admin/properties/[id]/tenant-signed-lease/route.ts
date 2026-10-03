import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  generateBalanceInvoice,
  getPropertyPlanName,
  isPremierTierPlan,
  type BalanceInvoiceResult,
} from "@/lib/balance-invoice";
import { sendBalanceInvoiceAvailableEmail } from "@/lib/email";

// PROMPT2 item 1: the new, explicit "Tenant signed lease" action —
// replaces the old implicit trigger on the Admin `is_available` toggle
// (see /api/admin/properties PATCH for why that was removed).
// Available from both the admin properties table and the property
// detail modal ("Commercial dashboard" and "Admin dashboard" are the
// same surface in this app — sales/marketing/admin all already share
// /admin, see PROPERTY_WRITE_ROLES).
//
// Idempotent: re-triggering on an already-signed property is a no-op
// that reports the original signed_at instead of re-invoicing.
//
// Premier Tier does NOT go through generateBalanceInvoice() here — its
// balance is scheduled automatically from the $200 upfront payment date
// (item 5), never gated by lease-signed. Detected per-property (not
// per-owner) since PROMPT2 item 6 makes Support/Premier per-property
// purchases, so different properties for the same owner can be on
// different plans.

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

  const { data: property, error: propError } = await supabaseAdmin
    .from("properties")
    .select("id, owner_id, address, city, tenant_lease_signed_at")
    .eq("id", propertyId)
    .single();
  if (propError || !property) {
    return NextResponse.json({ error: propError?.message || "Property not found" }, { status: 404 });
  }

  if (property.tenant_lease_signed_at) {
    return NextResponse.json({
      success: true,
      already_signed: true,
      signed_at: property.tenant_lease_signed_at,
    });
  }

  const { error: updateError } = await supabaseAdmin
    .from("properties")
    .update({
      tenant_lease_signed_at: new Date().toISOString(),
      tenant_lease_signed_by: user.id,
    })
    .eq("id", propertyId);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Property-scoped plan detection (not owner-wide) — which plan was
  // actually purchased for THIS property, so a multi-property owner on
  // different plans per property gets the right flow.
  const planName = await getPropertyPlanName(propertyId);
  const isPremierTier = isPremierTierPlan(planName);

  let balanceInvoice: BalanceInvoiceResult | null = null;
  if (!isPremierTier) {
    balanceInvoice = await generateBalanceInvoice(propertyId);

    if (balanceInvoice.success && balanceInvoice.hosted_invoice_url) {
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
          amountCents: Math.round((balanceInvoice.amount || 0) * 100),
          currency: balanceInvoice.currency,
          dueDate: balanceInvoice.due_date,
        });
      }
    }
  }

  return NextResponse.json({
    success: true,
    is_premier_tier: isPremierTier,
    plan_name: planName,
    balance_invoice: balanceInvoice,
  });
}
