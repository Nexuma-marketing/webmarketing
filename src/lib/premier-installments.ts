import { supabaseAdmin } from "@/lib/supabase/admin";
import { computeBalanceCents } from "@/lib/plan-percentage";

// PROMPT2 item 5: Premier Tier's calendar-based installment schedule.
// Called once, from the Stripe webhook's checkout.session.completed
// handler, right after a Premier Tier $200 upfront payment is recorded
// for a property. Never gated by "Tenant signed lease" — Premier's
// clock starts at the upfront payment date, unlike Low
// Price/Founders/Support Tier's single-lump-balance flow (item 1).
//
// Property rank ("Property #1" vs "#2/#3") is the same index-into-the-
// owner's-properties-ordered-by-created_at convention already used by
// src/lib/owner-plan-display.ts's percentageForPlan/formatOwnerPlanPrice,
// so the number shown to the owner on Services/Dashboard matches the
// number actually billed here.

function addMonthsIso(date: Date, months: number): string {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

export async function schedulePremierInstallments(params: {
  propertyId: string;
  ownerId: string;
  serviceId: string;
  monthlyRentCad: number;
  upfrontPaidAt: Date;
}): Promise<void> {
  const { propertyId, ownerId, serviceId, monthlyRentCad, upfrontPaidAt } = params;

  // Idempotency — a re-delivered webhook event must not double-schedule.
  const { data: existing } = await supabaseAdmin
    .from("plan_installments")
    .select("id")
    .eq("property_id", propertyId)
    .eq("service_id", serviceId)
    .limit(1);
  if (existing && existing.length > 0) {
    console.log("[premier-installments] Already scheduled for this property+service, skipping", {
      propertyId,
      serviceId,
    });
    return;
  }

  const { data: ownerProperties } = await supabaseAdmin
    .from("properties")
    .select("id")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: true });
  const rank = (ownerProperties || []).findIndex((p) => p.id === propertyId);
  console.log("[premier-installments] Property rank resolved", { propertyId, ownerId, rank });
  if (rank === -1 || rank > 2) {
    // Matches owner-plan-display.ts's percentageForPlan: Premier Tier's
    // percentage schedule only covers an owner's first 3 properties.
    console.error("[premier-installments] Property rank out of Premier Tier's 3-property range — not scheduling", {
      propertyId,
      rank,
    });
    return;
  }

  const percentage = rank === 0 ? 0.3 : 0.28;
  const balanceCents = computeBalanceCents({ monthlyRentCad, planPercentage: percentage });
  if (balanceCents <= 0) {
    console.log("[premier-installments] No balance owed after upfront — nothing to schedule", {
      propertyId,
      rank,
      monthlyRentCad,
      balanceCents,
    });
    return;
  }

  type NewRow = {
    property_id: string;
    service_id: string;
    sequence: number;
    due_date: string;
    percentage: number;
    amount_cents: number;
    status: "scheduled";
  };
  let rows: NewRow[];

  if (rank === 0) {
    // Property #1: single installment, 100% of the balance, +2 months.
    rows = [
      {
        property_id: propertyId,
        service_id: serviceId,
        sequence: 1,
        due_date: addMonthsIso(upfrontPaidAt, 2),
        percentage: 100,
        amount_cents: balanceCents,
        status: "scheduled",
      },
    ];
  } else {
    // Property #2/#3: 50% / 30% / 20% at +1 / +2 / +3 months. The third
    // installment takes the rounding remainder so the three always sum
    // exactly to balanceCents.
    const p1 = Math.round(balanceCents * 0.5);
    const p2 = Math.round(balanceCents * 0.3);
    const p3 = balanceCents - p1 - p2;
    rows = [
      {
        property_id: propertyId,
        service_id: serviceId,
        sequence: 1,
        due_date: addMonthsIso(upfrontPaidAt, 1),
        percentage: 50,
        amount_cents: p1,
        status: "scheduled",
      },
      {
        property_id: propertyId,
        service_id: serviceId,
        sequence: 2,
        due_date: addMonthsIso(upfrontPaidAt, 2),
        percentage: 30,
        amount_cents: p2,
        status: "scheduled",
      },
      {
        property_id: propertyId,
        service_id: serviceId,
        sequence: 3,
        due_date: addMonthsIso(upfrontPaidAt, 3),
        percentage: 20,
        amount_cents: p3,
        status: "scheduled",
      },
    ];
  }

  const { error } = await supabaseAdmin.from("plan_installments").insert(rows);
  console.log("[premier-installments] Schedule inserted", {
    propertyId,
    rank,
    rowCount: rows.length,
    totalCents: rows.reduce((s, r) => s + r.amount_cents, 0),
    error,
  });
  if (error) {
    console.error("[premier-installments] CRITICAL: failed to insert installment schedule", {
      propertyId,
      error,
    });
  }
}
