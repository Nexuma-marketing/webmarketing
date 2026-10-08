import { supabaseAdmin } from "@/lib/supabase/admin";
import { resolvePropertyPlanBalance } from "@/lib/property-plan-balance";

// Sales Report → "Payment summary by property". One row per property
// (Property Owner + Investor — both are tied to a specific property;
// PYME plans are per client and stay out of this table).
//
// The pending balance comes from resolvePropertyPlanBalance — the same
// function the client's Payment History → Plan Balances cards use — fed
// with the same inputs (latest completed plan payment for the property,
// the property's rank among its owner's properties, monthly_rent,
// balance_invoice_status), so this report shows the figure the client
// sees. Server-only: reads through the service-role client.

export type PropertyBalanceStatus =
  | "fully_paid"
  | "pending_balance"
  | "awaiting_lease"
  | "no_plan";

export interface PropertyPaymentSummaryRow {
  propertyId: string;
  address: string;
  ownerName: string;
  ownerEmail: string | null;
  /** Friendly plan label ("Founder Package", "Low Price", "Elite — Signature"…), null if no plan was paid. */
  plan: string | null;
  /** Completed plan upfront payments (CAD). */
  upfrontPaid: number;
  /** Still owed (CAD). */
  pendingBalance: number;
  /** Completed balance-invoice / Premier installment payments (CAD). */
  balancePaid: number;
  /** Completed "Priority Listing Placement" add-on payments ($100 each) attributed to this property (CAD). */
  priorityListingPaid: number;
  /** Completed other property payments, e.g. Elite monthly maintenance (CAD). Excludes priority listing. */
  otherPaid: number;
  /** upfrontPaid + balancePaid + priorityListingPaid + otherPaid (CAD). */
  totalPaid: number;
  status: PropertyBalanceStatus;
  /** Extra context for the status, e.g. "Invoice open" or "1 of 3 installments paid". */
  statusDetail: string | null;
}

interface PropertyRecord {
  id: string;
  owner_id: string | null;
  address: string | null;
  city: string | null;
  monthly_rent: number | null;
  balance_invoice_status: string | null;
  tenant_lease_signed_at: string | null;
}

interface PaymentRecord {
  user_id: string | null;
  service_id: string | null;
  pymes_plan_id: string | null;
  property_id: string | null;
  amount: number | null;
  payment_type: string | null;
  created_at: string;
}

interface InstallmentRecord {
  property_id: string;
  amount_cents: number;
  status: string;
}

const PAGE_SIZE = 1000;

// PostgREST caps a single response at 1000 rows; page through so the
// report stays complete as the tables grow.
async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
  label: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error(`[property-payment-summary] Failed to load ${label}`, error);
      break;
    }
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

function friendlyPlanName(serviceName: string): string {
  const name = serviceName.toLowerCase();
  if (name.includes("founder")) return "Founder Package";
  if (name.includes("low price")) return "Low Price";
  if (name.includes("preferred") && name.includes("premier")) return "Premier Tier";
  if (name.includes("preferred") && name.includes("support")) return "Support Tier";
  return serviceName.replace(/^plan:\s*/i, "");
}

// The add-on is its own `services` row (migration v65, category
// "addon") and always gets its own `payments` row carrying the
// property's id — both when bundled into the Low Price upfront checkout
// (webhook's metadata.addon_service_id split) and when bought
// standalone. Matched by name pattern like the plans above.
function isPriorityListingService(service: { name: string; category: string | null } | undefined): boolean {
  return !!service && service.category !== "plan" && /priority listing/i.test(service.name);
}

const BALANCE_PAYMENT_TYPES = new Set(["plan_balance", "plan_installment"]);
const OPEN_INVOICE_STATUSES = new Set(["open", "overdue", "uncollectible"]);

export async function buildPropertyPaymentSummary(): Promise<PropertyPaymentSummaryRow[]> {
  const [properties, payments, installments, servicesRes] = await Promise.all([
    fetchAll<PropertyRecord>(
      (from, to) =>
        supabaseAdmin
          .from("properties")
          .select("id, owner_id, address, city, monthly_rent, balance_invoice_status, tenant_lease_signed_at")
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      "properties",
    ),
    // Newest first, so the first plan payment found per property is the
    // most recent one — same pick as the client's Payment History.
    fetchAll<PaymentRecord>(
      (from, to) =>
        supabaseAdmin
          .from("payments")
          .select("user_id, service_id, pymes_plan_id, property_id, amount, payment_type, created_at")
          .eq("status", "completed")
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to),
      "payments",
    ),
    fetchAll<InstallmentRecord>(
      (from, to) =>
        supabaseAdmin
          .from("plan_installments")
          .select("property_id, amount_cents, status")
          .order("id", { ascending: true })
          .range(from, to),
      "plan_installments",
    ),
    supabaseAdmin.from("services").select("id, name, category"),
  ]);

  const servicesById = new Map<string, { name: string; category: string | null }>();
  for (const svc of servicesRes.data ?? []) {
    servicesById.set(svc.id as string, {
      name: svc.name as string,
      category: (svc.category as string | null) ?? null,
    });
  }

  const ownerIds = Array.from(
    new Set(properties.map((p) => p.owner_id).filter((id): id is string => Boolean(id))),
  );
  const ownersById = new Map<string, { full_name: string | null; email: string | null }>();
  for (let i = 0; i < ownerIds.length; i += 200) {
    const { data: owners, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", ownerIds.slice(i, i + 200));
    if (error) console.error("[property-payment-summary] Failed to load owners", error);
    for (const owner of owners ?? []) {
      ownersById.set(owner.id as string, {
        full_name: (owner.full_name as string | null) ?? null,
        email: (owner.email as string | null) ?? null,
      });
    }
  }

  // `properties` is ordered by created_at ascending, so each owner's
  // list preserves the property rank used for Support/Premier's 30%/28%.
  const propertiesByOwner = new Map<string, PropertyRecord[]>();
  for (const prop of properties) {
    if (!prop.owner_id) continue;
    const list = propertiesByOwner.get(prop.owner_id) ?? [];
    list.push(prop);
    propertiesByOwner.set(prop.owner_id, list);
  }

  const paymentsByProperty = new Map<string, PaymentRecord[]>();
  // Pre-restructure plan payments have property_id = null. Same
  // fallback as the client's Payment History and payment-lookup.ts:
  // attributed to the property only when its owner has exactly one.
  const legacyPaymentsByUser = new Map<string, PaymentRecord[]>();
  for (const payment of payments) {
    if (payment.property_id) {
      const list = paymentsByProperty.get(payment.property_id) ?? [];
      list.push(payment);
      paymentsByProperty.set(payment.property_id, list);
    } else if (payment.user_id && !payment.pymes_plan_id) {
      const list = legacyPaymentsByUser.get(payment.user_id) ?? [];
      list.push(payment);
      legacyPaymentsByUser.set(payment.user_id, list);
    }
  }

  // Each owner's most recent completed plan payment on any property —
  // what generateBalanceInvoice prices an unpaid balance with (see
  // resolvePropertyPlanBalance's plan-change rule). `payments` is
  // newest-first, so the first plan payment seen per user is the latest.
  const latestPlanNameByUser = new Map<string, string>();
  for (const payment of payments) {
    if (!payment.user_id || !payment.service_id || latestPlanNameByUser.has(payment.user_id)) continue;
    const service = servicesById.get(payment.service_id);
    if (service?.category === "plan") latestPlanNameByUser.set(payment.user_id, service.name);
  }

  const installmentsByProperty = new Map<string, InstallmentRecord[]>();
  for (const inst of installments) {
    const list = installmentsByProperty.get(inst.property_id) ?? [];
    list.push(inst);
    installmentsByProperty.set(inst.property_id, list);
  }

  return properties.map((prop): PropertyPaymentSummaryRow => {
    const ownerProperties = prop.owner_id ? propertiesByOwner.get(prop.owner_id) ?? [] : [];
    const propertyIndex = ownerProperties.findIndex((p) => p.id === prop.id);
    const owner = prop.owner_id ? ownersById.get(prop.owner_id) : undefined;

    const propPayments = [
      ...(paymentsByProperty.get(prop.id) ?? []),
      ...(ownerProperties.length === 1 && prop.owner_id ? legacyPaymentsByUser.get(prop.owner_id) ?? [] : []),
    ].sort((a, b) => b.created_at.localeCompare(a.created_at));

    let upfrontCents = 0;
    let balancePaidCents = 0;
    let priorityListingCents = 0;
    let otherPaidCents = 0;
    let planServiceName: string | null = null;
    for (const payment of propPayments) {
      const cents = Math.round((Number(payment.amount) || 0) * 100);
      const service = payment.service_id ? servicesById.get(payment.service_id) : undefined;
      if (BALANCE_PAYMENT_TYPES.has(payment.payment_type ?? "")) {
        balancePaidCents += cents;
      } else if (service?.category === "plan") {
        upfrontCents += cents;
        if (!planServiceName) planServiceName = service.name;
      } else if (isPriorityListingService(service)) {
        priorityListingCents += cents;
      } else {
        otherPaidCents += cents;
      }
    }

    let pendingCents = 0;
    let effectivePlanName = planServiceName;
    let status: PropertyBalanceStatus = "no_plan";
    let statusDetail: string | null = null;

    if (planServiceName) {
      const rent = Number(prop.monthly_rent) || 0;
      const balance = resolvePropertyPlanBalance({
        planName: planServiceName,
        propertyIndex,
        monthlyRentCad: rent,
        ownerLatestPlanName: prop.owner_id ? latestPlanNameByUser.get(prop.owner_id) ?? null : null,
        balancePaid: prop.balance_invoice_status === "paid",
      });
      if (balance) effectivePlanName = balance.effectivePlanName;
      const propInstallments = (installmentsByProperty.get(prop.id) ?? []).filter(
        (inst) => inst.status !== "voided",
      );

      if (!balance) {
        // Elite / flat-fee: no percentage balance on the client either.
        status = "fully_paid";
        statusDetail = "Flat fee — no percentage balance";
      } else if (balance.isPremier && propInstallments.length > 0) {
        const unpaid = propInstallments.filter((inst) => inst.status !== "paid");
        pendingCents = unpaid.reduce((sum, inst) => sum + (Number(inst.amount_cents) || 0), 0);
        const paidCount = propInstallments.length - unpaid.length;
        status = pendingCents > 0 ? "pending_balance" : "fully_paid";
        statusDetail = `${paidCount} of ${propInstallments.length} installments paid`;
        if (unpaid.some((inst) => inst.status === "failed")) statusDetail += " — payment failed";
      } else if (balance.pendingBalanceCents <= 0) {
        status = "fully_paid";
        statusDetail = rent > 0 ? "Upfront covers the full fee" : "No monthly rent on file";
      } else if (!balance.isPremier && prop.balance_invoice_status === "paid") {
        status = "fully_paid";
      } else {
        pendingCents = balance.pendingBalanceCents;
        const invoiceStatus = balance.isPremier ? null : prop.balance_invoice_status;
        if (invoiceStatus && OPEN_INVOICE_STATUSES.has(invoiceStatus)) {
          status = "pending_balance";
          statusDetail = `Invoice ${invoiceStatus}`;
        } else if (!balance.isPremier && !prop.tenant_lease_signed_at) {
          status = "awaiting_lease";
        } else {
          status = "pending_balance";
          statusDetail = balance.isPremier ? "Installments not scheduled" : "Invoice not issued yet";
        }
      }
    }

    return {
      propertyId: prop.id,
      address: [prop.address, prop.city].filter(Boolean).join(", ") || "—",
      ownerName: owner?.full_name || owner?.email || "Unknown owner",
      ownerEmail: owner?.email ?? null,
      // The plan the balance is billed under; when that differs from
      // the plan the upfront was paid as, both are shown.
      plan: !planServiceName
        ? null
        : effectivePlanName && effectivePlanName !== planServiceName
          ? `${friendlyPlanName(effectivePlanName)} (upfront paid as ${friendlyPlanName(planServiceName)})`
          : friendlyPlanName(planServiceName),
      upfrontPaid: upfrontCents / 100,
      pendingBalance: pendingCents / 100,
      balancePaid: balancePaidCents / 100,
      priorityListingPaid: priorityListingCents / 100,
      otherPaid: otherPaidCents / 100,
      totalPaid: (upfrontCents + balancePaidCents + priorityListingCents + otherPaidCents) / 100,
      status,
      statusDetail,
    };
  });
}
