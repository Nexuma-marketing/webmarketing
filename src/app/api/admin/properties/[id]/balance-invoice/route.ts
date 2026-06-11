import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getStripeServer } from "@/lib/stripe";
import {
  getPlanPercentage,
  computeBalanceCents,
  PLAN_UPFRONT_AMOUNT_CAD,
} from "@/lib/plan-percentage";

// Steve 6/11 (6-2.md #53): residential plan % balance invoice.
//
// Trigger: the property's PATCH endpoint calls this when Sales toggles
// Available -> Unavailable. That toggle represents "tenant signed,
// off the market" per Alex's 2026-06-11 spec. We don't expose this
// route to the UI directly — it's an internal side effect of the
// toggle.
//
// Behavior:
//   1. Look up the property + owner (+ Stripe customer id)
//   2. Find the most recent COMPLETED plan payment by this owner
//      against a services row in the "plan" category
//   3. Map the plan name -> percentage (Low Price 35%, Founders 30%, etc.)
//   4. Calculate balance = rent * percentage - $200 upfront
//   5. Create a Stripe Invoice (not Checkout) addressed to the owner.
//      Stripe sends the email itself with the hosted invoice link.
//      due_date = 3 business days from now. Manual GST tax rate
//      attached so 5% adds automatically.
//   6. Mark the property with the new invoice id + status so the
//      webhook (invoice.payment_succeeded) can flip it to
//      "rented_balance_paid" once paid.
//
// Idempotency: if the property already has an open balance invoice
// (balance_invoice_id set, no paid_at), we return that without
// creating a duplicate. Sales can re-toggle without duplicate billing.

export const dynamic = "force-dynamic";

const INTERNAL_WRITE_ROLES = ["admin", "marketing", "sales"];

function plusBusinessDays(days: number): number {
  // Stripe due_date is a unix timestamp in seconds. Skip Sat/Sun.
  const date = new Date();
  let added = 0;
  while (added < days) {
    date.setDate(date.getDate() + 1);
    const dow = date.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return Math.floor(date.getTime() / 1000);
}

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

  // 1. Look up the property + owner
  const { data: property, error: propErr } = await supabaseAdmin
    .from("properties")
    .select(
      "id, owner_id, address, city, monthly_rent, service_tier, balance_invoice_id, balance_invoice_status",
    )
    .eq("id", propertyId)
    .single();
  if (propErr || !property) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }
  if (!property.owner_id || !property.monthly_rent) {
    return NextResponse.json(
      { error: "Property is missing owner or monthly_rent — cannot calculate balance" },
      { status: 400 },
    );
  }

  // Idempotency: if there's already an open invoice, return it.
  if (
    property.balance_invoice_id &&
    property.balance_invoice_status &&
    property.balance_invoice_status !== "paid" &&
    property.balance_invoice_status !== "voided"
  ) {
    return NextResponse.json({
      success: true,
      already_issued: true,
      invoice_id: property.balance_invoice_id,
      invoice_status: property.balance_invoice_status,
    });
  }

  const { data: owner } = await supabaseAdmin
    .from("profiles")
    .select("id, email, full_name, stripe_customer_id")
    .eq("id", property.owner_id as string)
    .single();
  if (!owner?.email) {
    return NextResponse.json(
      { error: "Owner has no email — cannot send invoice" },
      { status: 400 },
    );
  }

  // 2. Find the most recent completed plan purchase by this owner.
  //    Matches a services row tagged as a plan (category='plan').
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
    return NextResponse.json(
      {
        error:
          "No completed plan purchase found for this owner. The owner must pay the upfront before a balance can be invoiced.",
      },
      { status: 400 },
    );
  }

  const percentage = getPlanPercentage(planName);
  if (percentage === null) {
    return NextResponse.json(
      {
        error: `Plan "${planName}" does not use a percentage-balance model. No invoice generated.`,
      },
      { status: 400 },
    );
  }

  const monthlyRent = Number(property.monthly_rent);
  const balanceCents = computeBalanceCents({
    monthlyRentCad: monthlyRent,
    planPercentage: percentage,
  });

  if (balanceCents <= 0) {
    // Upfront already covers more than the percentage — nothing to charge.
    return NextResponse.json({
      success: true,
      no_balance: true,
      message: `Upfront $${PLAN_UPFRONT_AMOUNT_CAD} already covers the ${(percentage * 100).toFixed(0)}% balance on rent ${monthlyRent}.`,
    });
  }

  // 3. Make sure the owner has a Stripe customer record.
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

  // 4. Create the invoice. Steps:
  //    - InvoiceItem first (Stripe's required pattern)
  //    - Then the Invoice referencing collection_method=send_invoice
  //      so Stripe emails it to the customer
  //    - finalize + send so the customer receives it immediately
  const gstRateId = process.env.STRIPE_GST_RATE_ID || null;

  const balanceDescription = `Balance for ${planName} — ${(percentage * 100).toFixed(0)}% of first month's rent on ${property.address}, ${property.city} (minus $${PLAN_UPFRONT_AMOUNT_CAD} upfront)`;

  // Steve 6/11: the create + finalize + send flow. send_invoice mode
  // means Stripe sends the email itself + handles dunning via due_date.
  const dueDate = plusBusinessDays(3);

  // (a) attach an invoice item to the customer that will get pulled
  //     onto the next draft invoice.
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

  // (b) create the invoice in send_invoice mode.
  const invoice = await stripe.invoices.create({
    customer: stripeCustomerId,
    collection_method: "send_invoice",
    days_until_due: 3,
    due_date: dueDate,
    description: `Plan balance for ${property.address}`,
    ...(gstRateId ? { default_tax_rates: [gstRateId] } : { automatic_tax: { enabled: true } }),
    metadata: {
      property_id: propertyId,
      owner_id: property.owner_id as string,
      kind: "plan_balance",
      plan_name: planName,
      percentage: String(percentage),
    },
  });

  // (c) finalize so the line items lock in
  const finalized = invoice.id
    ? await stripe.invoices.finalizeInvoice(invoice.id)
    : invoice;

  // (d) send — Stripe emails the customer the hosted invoice link
  if (finalized.id) {
    await stripe.invoices.sendInvoice(finalized.id);
  }

  // 5. Persist on the property row so the webhook can flip status
  //    later. Note: balance_invoice_id + balance_invoice_status
  //    columns are added in migration v37 (see balance_invoice migration).
  await supabaseAdmin
    .from("properties")
    .update({
      balance_invoice_id: finalized.id,
      balance_invoice_status: "open",
      balance_invoice_amount: balanceCents / 100,
      balance_invoice_sent_at: new Date().toISOString(),
    })
    .eq("id", propertyId);

  return NextResponse.json({
    success: true,
    invoice_id: finalized.id,
    hosted_invoice_url: finalized.hosted_invoice_url,
    amount: balanceCents / 100,
    currency: "CAD",
    plan_name: planName,
    percentage,
    due_date: new Date(dueDate * 1000).toISOString(),
  });
}
