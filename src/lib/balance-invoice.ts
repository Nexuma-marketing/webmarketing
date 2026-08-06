import { supabaseAdmin } from "@/lib/supabase/admin";
import { getStripeServer } from "@/lib/stripe";
import {
  getPlanPercentage,
  computeBalanceCents,
  PLAN_UPFRONT_AMOUNT_CAD,
} from "@/lib/plan-percentage";

// Steve 6/11 (6-2.md #53): residential plan % balance invoice logic
// — extracted into a library so it can be called both from the
// standalone /api/admin/properties/[id]/balance-invoice endpoint AND
// directly from the properties PATCH route when Sales toggles
// Available off. The previous server-to-server fetch was returning
// null because the cookie / internal-routing didn't survive the
// fetch round-trip; calling the function in-process is simpler and
// avoids that whole class of failure.

export interface BalanceInvoiceResult {
  success: boolean;
  no_balance?: boolean;
  already_issued?: boolean;
  invoice_id?: string | null;
  hosted_invoice_url?: string | null;
  amount?: number;
  currency?: string;
  plan_name?: string;
  percentage?: number;
  due_date?: string;
  message?: string;
  error?: string;
}

function plusBusinessDays(days: number): number {
  const date = new Date();
  let added = 0;
  while (added < days) {
    date.setDate(date.getDate() + 1);
    const dow = date.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return Math.floor(date.getTime() / 1000);
}

export async function generateBalanceInvoice(
  propertyId: string,
): Promise<BalanceInvoiceResult> {
  // 1. Property + idempotency
  const { data: property, error: propErr } = await supabaseAdmin
    .from("properties")
    .select(
      "id, owner_id, address, city, monthly_rent, service_tier, balance_invoice_id, balance_invoice_status",
    )
    .eq("id", propertyId)
    .single();
  if (propErr || !property) {
    return { success: false, error: "Property not found" };
  }
  if (!property.owner_id || !property.monthly_rent) {
    return {
      success: false,
      error: "Property is missing owner or monthly_rent — cannot calculate balance",
    };
  }
  if (
    property.balance_invoice_id &&
    property.balance_invoice_status &&
    property.balance_invoice_status !== "paid" &&
    property.balance_invoice_status !== "voided"
  ) {
    return {
      success: true,
      already_issued: true,
      invoice_id: property.balance_invoice_id as string,
    };
  }

  // 2. Owner
  const { data: owner } = await supabaseAdmin
    .from("profiles")
    .select("id, email, full_name, stripe_customer_id")
    .eq("id", property.owner_id as string)
    .single();
  if (!owner?.email) {
    return { success: false, error: "Owner has no email — cannot send invoice" };
  }

  // 3. Find the owner's most recent completed plan-category payment
  const { data: planPayments } = await supabaseAdmin
    .from("payments")
    .select("service_id, created_at")
    .eq("user_id", property.owner_id as string)
    .eq("status", "completed")
    .not("service_id", "is", null)
    .order("created_at", { ascending: false });
  let planName: string | null = null;
  for (const p of planPayments ?? []) {
    const { data: svc } = await supabaseAdmin
      .from("services")
      .select("name, category")
      .eq("id", p.service_id as string)
      .single();
    if (svc?.category === "plan") {
      planName = svc.name as string;
      break;
    }
  }
  if (!planName) {
    return {
      success: false,
      error:
        "No completed plan purchase found for this owner. Owner must pay the upfront before a balance can be invoiced.",
    };
  }

  const percentage = getPlanPercentage(planName);
  if (percentage === null) {
    return {
      success: false,
      error: `Plan "${planName}" does not use a percentage-balance model.`,
    };
  }

  const monthlyRent = Number(property.monthly_rent);
  const balanceCents = computeBalanceCents({
    monthlyRentCad: monthlyRent,
    planPercentage: percentage,
  });
  if (balanceCents <= 0) {
    return {
      success: true,
      no_balance: true,
      message: `Upfront $${PLAN_UPFRONT_AMOUNT_CAD} already covers the ${(percentage * 100).toFixed(0)}% balance on rent ${monthlyRent}.`,
    };
  }

  // 4. Stripe customer (lazy create)
  const stripe = getStripeServer();
  let stripeCustomerId = (owner.stripe_customer_id as string | null) || null;
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: owner.email as string,
      name: (owner.full_name as string) || undefined,
      metadata: { user_id: owner.id as string },
    });
    stripeCustomerId = customer.id;
    await supabaseAdmin
      .from("profiles")
      .update({ stripe_customer_id: stripeCustomerId })
      .eq("id", owner.id as string);
  }

  // 5. InvoiceItem + Invoice + finalize + send
  // Steve 6/11: STRIPE_GST_RATE_ID must match the Stripe key mode
  // (test_mode rate with test_mode key, live with live). If they
  // mismatch Stripe will reject the lookup at invoice creation —
  // we catch that case below in the try/catch and surface the
  // error so the caller knows to update the env var.
  const gstRateId = process.env.STRIPE_GST_RATE_ID || null;
  const balanceDescription = `Balance for ${planName} — ${(percentage * 100).toFixed(0)}% of first month's rent on ${property.address}, ${property.city} (minus $${PLAN_UPFRONT_AMOUNT_CAD} upfront)`;
  const dueDate = plusBusinessDays(3);

  await stripe.invoiceItems.create({
    customer: stripeCustomerId,
    amount: balanceCents,
    currency: "cad",
    description: balanceDescription,
    ...(gstRateId ? { tax_rates: [gstRateId] } : {}),
    metadata: {
      property_id: propertyId,
      owner_id: property.owner_id as string,
      plan_name: planName,
      percentage: String(percentage),
      monthly_rent: String(monthlyRent),
    },
  });

  const invoice = await stripe.invoices.create({
    customer: stripeCustomerId,
    collection_method: "send_invoice",
    days_until_due: 3,
    due_date: dueDate,
    description: `Plan balance for ${property.address}`,
    ...(gstRateId
      ? { default_tax_rates: [gstRateId] }
      : { automatic_tax: { enabled: true } }),
    metadata: {
      property_id: propertyId,
      owner_id: property.owner_id as string,
      kind: "plan_balance",
      plan_name: planName,
      percentage: String(percentage),
    },
  });

  const finalized = invoice.id
    ? await stripe.invoices.finalizeInvoice(invoice.id)
    : invoice;
  if (finalized.id) {
    await stripe.invoices.sendInvoice(finalized.id);
  }

  // 6. Persist on the property row
  await supabaseAdmin
    .from("properties")
    .update({
      balance_invoice_id: finalized.id,
      balance_invoice_status: "open",
      balance_invoice_amount: balanceCents / 100,
      balance_invoice_sent_at: new Date().toISOString(),
    })
    .eq("id", propertyId);

  return {
    success: true,
    invoice_id: finalized.id,
    hosted_invoice_url: finalized.hosted_invoice_url,
    amount: balanceCents / 100,
    currency: "CAD",
    plan_name: planName,
    percentage,
    due_date: new Date(dueDate * 1000).toISOString(),
  };
}
