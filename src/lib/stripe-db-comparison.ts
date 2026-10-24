import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { withStripeTimeout } from "@/lib/upcoming-charges";
import { eliteTierForServiceName } from "@/lib/subscription-setup";

// FEATURE_STRIPE_DB_COMPARISON_REPORT.md: read-only comparison of what
// Stripe collected against the completed rows of `payments`. Server-only.
// It never writes to the database or Stripe and never sends email.
//
// Matching key: payments.stripe_session_id.
//   - Checkout payments (one-time, Elite fixed fee, Premier upfront, PYME
//     upfront, priority add-on): the webhook stores the Checkout Session
//     id (cs_…). An add-on bundled in the same session gets a second row
//     with the same cs_ id, so DB rows are summed per key.
//   - Invoice payments (PYME installments, Elite monthly platform fee,
//     Premier installments, plan balance): the webhook stores the invoice
//     id (in_…).
// Amounts are compared in cents: Stripe amounts are cents, payments.amount
// is dollars (amount_cents / 100 in the webhook).

export type ComparisonDays = 30 | 60 | 90;

export type ComparisonStatus =
  | "ok"
  | "missing_in_database"
  | "not_in_stripe"
  | "amount_differs"
  | "refunded_still_completed";

export type ComparisonGroup =
  | "elite_platform_fee"
  | "elite_fixed_fee"
  | "premier"
  | "pyme_upfront"
  | "pyme_installments"
  | "other";

export interface ComparisonRow {
  key: string; // cs_… / in_… or "db:<payment id>" when the row has no Stripe reference
  date: string; // ISO
  customerName: string;
  customerEmail: string | null;
  scope: string; // property address, PYME plan name, or "Other"
  paymentType: string | null;
  paymentTypeLabel: string;
  group: ComparisonGroup;
  groupLabel: string;
  stripeAmount: number; // dollars, net of refunds (0 when not in Stripe)
  stripeRefunded: number; // dollars
  databaseAmount: number; // dollars, completed rows only
  difference: number; // dollars, Stripe − Database
  status: ComparisonStatus;
  statusLabel: string;
  note: string | null;
}

export interface ComparisonGroupSummary {
  group: ComparisonGroup;
  label: string;
  stripe: number;
  database: number;
  difference: number;
  rows: number;
  rowsWithDifference: number;
}

export interface StripeDbComparison {
  days: ComparisonDays;
  periodStart: string; // ISO
  periodEnd: string; // ISO
  truncated: boolean;
  warnings: string[];
  totals: { stripe: number; database: number; difference: number };
  groups: ComparisonGroupSummary[];
  rows: ComparisonRow[];
  rowsWithDifference: number;
}

export const COMPARISON_DAYS: ComparisonDays[] = [30, 60, 90];

/** 30, 60 or 90; anything else becomes 90. */
export function parseComparisonDays(value: string | null): ComparisonDays {
  const n = Number(value);
  if (n === 30) return 30;
  if (n === 60) return 60;
  return 90;
}

const LOG = "[stripe-db-compare]";
const MAX_SESSIONS = 1000;
const MAX_INVOICES = 1000;
const MAX_CHARGES = 1000;
const MAX_LOOKUPS = 50;
const MAX_DB_PAGES = 10; // x 1000 rows
const LIST_TIMEOUT_MS = 40000;
const LOOKUP_TIMEOUT_MS = 12000;
const REQUEST_OPTIONS = { timeout: 15000, maxNetworkRetries: 0 };
// Rows that record events, not money (amount 0, never "collected").
const MARKER_TYPES = new Set(["subscription_canceled", "subscription_setup_failed", "plan_switch_noop"]);

const STATUS_LABELS: Record<ComparisonStatus, string> = {
  ok: "OK",
  missing_in_database: "Missing in database",
  not_in_stripe: "Not in Stripe",
  amount_differs: "Amount differs",
  refunded_still_completed: "Refunded in Stripe, still completed in DB",
};

const GROUP_LABELS: Record<ComparisonGroup, string> = {
  elite_platform_fee: "Elite platform / monthly fee",
  elite_fixed_fee: "Elite fixed fee",
  premier: "Premier",
  pyme_upfront: "PYME upfront",
  pyme_installments: "PYME installments",
  other: "Other",
};
const GROUP_ORDER: ComparisonGroup[] = [
  "elite_platform_fee",
  "elite_fixed_fee",
  "premier",
  "pyme_upfront",
  "pyme_installments",
  "other",
];

/** Same wording as the Type column in Payment History / Admin → Payments. */
function paymentTypeLabel(type: string | null, kind: "session" | "invoice" | null): string {
  if (type === "elite_maintenance") return "Platform fee";
  if (type === "subscription_canceled") return "Subscription";
  if (!type) return kind === "invoice" ? "Invoice" : "One-time";
  const text = type.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

interface StripeItem {
  key: string;
  kind: "session" | "invoice";
  createdUnix: number;
  grossCents: number;
  refundedCents: number;
  refundsChecked: boolean;
  paymentIntentId: string | null;
  email: string | null;
  userId: string | null;
  propertyId: string | null;
  serviceId: string | null;
  pymesPlanId: string | null;
  paymentType: string | null;
  eliteTier: string | null;
  outsidePeriod: boolean;
}

interface DbRow {
  id: string;
  userId: string | null;
  propertyId: string | null;
  serviceId: string | null;
  pymesPlanId: string | null;
  amountCents: number;
  paymentType: string | null;
  status: string;
  key: string | null;
  createdAt: string;
}

// Invoice fields read defensively: their exact shape depends on the
// Stripe API version (2026-03-25.dahlia), so they are read through this
// loose view instead of the SDK types.
interface LooseInvoiceFields {
  parent?: {
    subscription_details?: { metadata?: Record<string, string> | null } | null;
  } | null;
  status_transitions?: { paid_at?: number | null } | null;
  payments?: {
    data?: Array<{ payment?: { payment_intent?: string | { id?: string } | null } | null }>;
  } | null;
}

const DB_COLUMNS =
  "id, user_id, property_id, service_id, pymes_plan_id, amount, payment_type, status, stripe_session_id, created_at";

function toDbRow(p: Record<string, unknown>): DbRow {
  return {
    id: String(p.id),
    userId: (p.user_id as string | null) ?? null,
    propertyId: (p.property_id as string | null) ?? null,
    serviceId: (p.service_id as string | null) ?? null,
    pymesPlanId: (p.pymes_plan_id as string | null) ?? null,
    amountCents: Math.round((Number(p.amount) || 0) * 100),
    paymentType: (p.payment_type as string | null) ?? null,
    status: String(p.status ?? ""),
    key: (p.stripe_session_id as string | null) ?? null,
    createdAt: String(p.created_at ?? ""),
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const isStripeKey = (key: string | null): key is string =>
  !!key && (key.startsWith("cs_") || key.startsWith("in_"));

function sessionItem(s: Stripe.Checkout.Session, outsidePeriod: boolean): StripeItem | null {
  if (s.payment_status !== "paid" || !s.amount_total || s.amount_total <= 0) return null;
  const md: Stripe.Metadata = s.metadata ?? {};
  const pi =
    typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? null;
  return {
    key: s.id,
    kind: "session",
    createdUnix: s.created,
    grossCents: s.amount_total,
    refundedCents: 0,
    refundsChecked: false,
    paymentIntentId: pi,
    email: s.customer_details?.email ?? s.customer_email ?? null,
    userId: md.user_id || null,
    propertyId: md.property_id || null,
    serviceId: md.service_id || null,
    pymesPlanId: md.pymes_plan_id || null,
    paymentType: md.payment_type || "one_time",
    eliteTier: md.elite_tier || null,
    outsidePeriod,
  };
}

function invoiceItem(inv: Stripe.Invoice, outsidePeriod: boolean): StripeItem | null {
  const id = inv.id;
  if (!id) return null;
  // $0 invoices (trial start of Elite/PYME subscriptions) are not charges.
  if (inv.status !== "paid" || !inv.amount_paid || inv.amount_paid <= 0) return null;
  const loose = inv as unknown as LooseInvoiceFields;
  const invMd: Stripe.Metadata = inv.metadata ?? {};
  const subMd: Record<string, string> = loose.parent?.subscription_details?.metadata ?? {};
  const kind = invMd.kind || subMd.kind || "";
  const paymentType =
    kind === "plan_balance" || kind === "plan_installment" || kind === "elite_maintenance"
      ? kind
      : subMd.pymes_plan_id
        ? "installment"
        : null;
  let pi: string | null = null;
  for (const payment of loose.payments?.data ?? []) {
    const ref = payment.payment?.payment_intent;
    const refId = typeof ref === "string" ? ref : ref?.id;
    if (refId) {
      pi = refId;
      break;
    }
  }
  return {
    key: id,
    kind: "invoice",
    createdUnix: loose.status_transitions?.paid_at || inv.created,
    grossCents: inv.amount_paid,
    refundedCents: 0,
    refundsChecked: false,
    paymentIntentId: pi,
    email: inv.customer_email ?? null,
    userId: subMd.user_id || null,
    propertyId: invMd.property_id || subMd.property_id || null,
    serviceId: null,
    pymesPlanId: subMd.pymes_plan_id || null,
    paymentType,
    eliteTier: null,
    outsidePeriod,
  };
}

async function listStripeItems(cutoffUnix: number, warnings: string[]) {
  let truncated = false;

  const sessions: StripeItem[] = [];
  const sessionInvoiceIds = new Set<string>();
  let seen = 0;
  for await (const s of stripe.checkout.sessions.list(
    { created: { gte: cutoffUnix }, limit: 100 },
    REQUEST_OPTIONS,
  )) {
    if (seen >= MAX_SESSIONS) {
      truncated = true;
      break;
    }
    seen++;
    const item = sessionItem(s, false);
    if (!item) continue;
    // A session that also produced an invoice is counted once, as the session.
    if (s.invoice) {
      const invoiceId = typeof s.invoice === "string" ? s.invoice : s.invoice.id;
      if (invoiceId) sessionInvoiceIds.add(invoiceId);
    }
    sessions.push(item);
  }

  const listInvoices = async (expandPayments: boolean) => {
    const items: StripeItem[] = [];
    let count = 0;
    let hitCap = false;
    for await (const inv of stripe.invoices.list(
      {
        status: "paid",
        created: { gte: cutoffUnix },
        limit: 100,
        ...(expandPayments ? { expand: ["data.payments"] } : {}),
      },
      REQUEST_OPTIONS,
    )) {
      if (count >= MAX_INVOICES) {
        hitCap = true;
        break;
      }
      count++;
      const item = invoiceItem(inv, false);
      if (item && !sessionInvoiceIds.has(item.key)) items.push(item);
    }
    return { items, hitCap };
  };
  let invoiceResult: { items: StripeItem[]; hitCap: boolean };
  let invoiceRefundsChecked = true;
  try {
    invoiceResult = await listInvoices(true);
  } catch (err) {
    console.warn(`${LOG} invoice list with payments failed, retrying without`, {
      error: err instanceof Error ? err.message : String(err),
    });
    invoiceResult = await listInvoices(false);
    invoiceRefundsChecked = false;
    warnings.push("Refunds on invoices (monthly charges) could not be checked.");
  }
  if (invoiceResult.hitCap) truncated = true;

  // Refunds by PaymentIntent, from the charges of the period.
  const refundedByPi = new Map<string, number>();
  let charges = 0;
  for await (const ch of stripe.charges.list({ created: { gte: cutoffUnix }, limit: 100 }, REQUEST_OPTIONS)) {
    if (charges >= MAX_CHARGES) {
      truncated = true;
      break;
    }
    charges++;
    const pi = typeof ch.payment_intent === "string" ? ch.payment_intent : ch.payment_intent?.id;
    if (pi && ch.amount_refunded > 0) refundedByPi.set(pi, (refundedByPi.get(pi) ?? 0) + ch.amount_refunded);
  }

  const items = [...sessions, ...invoiceResult.items];
  for (const item of items) {
    if (item.kind === "invoice" && !invoiceRefundsChecked) continue;
    item.refundsChecked = true;
    if (item.paymentIntentId) {
      item.refundedCents = Math.min(item.grossCents, refundedByPi.get(item.paymentIntentId) ?? 0);
    }
  }
  return { items, truncated };
}

/** Stripe items for DB rows not found in the period lists (period edges). */
async function lookUpKeys(keys: string[]) {
  const found = new Map<string, StripeItem>();
  const notFound = new Set<string>();
  const unverified = new Set<string>(keys.slice(MAX_LOOKUPS));
  const work = async () => {
    for (const key of keys.slice(0, MAX_LOOKUPS)) {
      try {
        let item: StripeItem | null = null;
        if (key.startsWith("cs_")) {
          const s = await stripe.checkout.sessions.retrieve(key, {}, REQUEST_OPTIONS);
          const sessionResult: StripeItem | null = sessionItem(s, true);
          const piId: string | null = sessionResult ? sessionResult.paymentIntentId : null;
          if (sessionResult && piId) {
            const list = await stripe.charges.list({ payment_intent: piId, limit: 10 }, REQUEST_OPTIONS);
            const refunded = list.data.reduce((sum, ch) => sum + (ch.amount_refunded || 0), 0);
            sessionResult.refundedCents = Math.min(sessionResult.grossCents, refunded);
            sessionResult.refundsChecked = true;
          }
          item = sessionResult;
        } else {
          const inv = await stripe.invoices.retrieve(key, {}, REQUEST_OPTIONS);
          item = invoiceItem(inv, true);
        }
        if (item) found.set(key, item);
        else notFound.add(key); // exists but unpaid / $0: nothing collected
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404) notFound.add(key);
        else unverified.add(key);
      }
    }
  };
  try {
    await withStripeTimeout(work(), LOOKUP_TIMEOUT_MS);
  } catch {
    for (const key of keys.slice(0, MAX_LOOKUPS)) {
      if (!found.has(key) && !notFound.has(key)) unverified.add(key);
    }
  }
  return { found, notFound, unverified };
}

export async function buildStripeDbComparison(days: ComparisonDays): Promise<StripeDbComparison> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const cutoffUnix = Math.floor(cutoff.getTime() / 1000);
  const cutoffIso = cutoff.toISOString();
  const warnings: string[] = [];

  // ── Stripe (read-only lists) ──
  const { items, truncated: stripeTruncated } = await withStripeTimeout(
    listStripeItems(cutoffUnix, warnings),
    LIST_TIMEOUT_MS,
  );
  const stripeByKey = new Map<string, StripeItem>(items.map((item) => [item.key, item]));

  // ── Database: completed rows of the period ──
  let dbTruncated = false;
  const periodRows: DbRow[] = [];
  for (let page = 0; page < MAX_DB_PAGES; page++) {
    const from = page * 1000;
    const { data, error } = await supabaseAdmin
      .from("payments")
      .select(DB_COLUMNS)
      .eq("status", "completed")
      .gte("created_at", cutoffIso)
      .order("created_at", { ascending: false })
      .range(from, from + 999);
    if (error) throw new Error(`payments query failed: ${error.message}`);
    const rows = (data ?? []) as Record<string, unknown>[];
    periodRows.push(...rows.map(toDbRow));
    if (rows.length < 1000) break;
    if (page === MAX_DB_PAGES - 1) dbTruncated = true;
  }

  // ── Database: every row (any status, any date) for the Stripe keys ──
  const rowsByKey = new Map<string, DbRow[]>();
  const addRow = (row: DbRow) => {
    if (!row.key || MARKER_TYPES.has(row.paymentType || "")) return;
    const list = rowsByKey.get(row.key) ?? [];
    if (!list.some((r) => r.id === row.id)) list.push(row);
    rowsByKey.set(row.key, list);
  };
  for (const keys of chunk(Array.from(stripeByKey.keys()), 150)) {
    const { data, error } = await supabaseAdmin.from("payments").select(DB_COLUMNS).in("stripe_session_id", keys);
    if (error) throw new Error(`payments lookup failed: ${error.message}`);
    ((data ?? []) as Record<string, unknown>[]).map(toDbRow).forEach(addRow);
  }

  // Completed rows with money but no Stripe item in the lists.
  const dbOnlyRows = periodRows.filter(
    (row) => row.amountCents > 0 && !MARKER_TYPES.has(row.paymentType || "") && !(row.key && stripeByKey.has(row.key)),
  );
  periodRows.forEach(addRow);
  const keysToLookUp = Array.from(new Set(dbOnlyRows.map((row) => row.key).filter(isStripeKey)));
  const lookups = keysToLookUp.length > 0
    ? await lookUpKeys(keysToLookUp)
    : { found: new Map<string, StripeItem>(), notFound: new Set<string>(), unverified: new Set<string>() };
  for (const [key, item] of lookups.found) stripeByKey.set(key, item);
  if (lookups.unverified.size > 0) {
    warnings.push(
      `${lookups.unverified.size} database payment(s) could not be checked individually in Stripe; they are listed as "Not in Stripe (not verified)".`,
    );
  }

  // ── Names for customers, properties, services and PYME plans ──
  const allDbRows = Array.from(rowsByKey.values()).flat().concat(dbOnlyRows.filter((r) => !isStripeKey(r.key)));
  const allItems = Array.from(stripeByKey.values());
  const ids = (values: Array<string | null>) => Array.from(new Set(values.filter((v): v is string => !!v)));
  const userIds = ids([...allDbRows.map((r) => r.userId), ...allItems.map((i) => i.userId)]);
  const propertyIds = ids([...allDbRows.map((r) => r.propertyId), ...allItems.map((i) => i.propertyId)]);
  const serviceIds = ids([...allDbRows.map((r) => r.serviceId), ...allItems.map((i) => i.serviceId)]);
  const planIds = ids([...allDbRows.map((r) => r.pymesPlanId), ...allItems.map((i) => i.pymesPlanId)]);

  const profiles = new Map<string, { name: string | null; email: string | null }>();
  const properties = new Map<string, string>();
  const services = new Map<string, string>();
  const plans = new Map<string, string>();
  for (const part of chunk(userIds, 150)) {
    const { data } = await supabaseAdmin.from("profiles").select("id, full_name, email").in("id", part);
    for (const p of (data ?? []) as Record<string, unknown>[]) {
      profiles.set(String(p.id), {
        name: (p.full_name as string | null) ?? null,
        email: (p.email as string | null) ?? null,
      });
    }
  }
  for (const part of chunk(propertyIds, 150)) {
    const { data } = await supabaseAdmin.from("properties").select("id, address, city").in("id", part);
    for (const p of (data ?? []) as Record<string, unknown>[]) {
      const address = [p.address, p.city].filter(Boolean).join(", ");
      properties.set(String(p.id), address || "Property");
    }
  }
  for (const part of chunk(serviceIds, 150)) {
    const { data } = await supabaseAdmin.from("services").select("id, name").in("id", part);
    for (const s of (data ?? []) as Record<string, unknown>[]) services.set(String(s.id), String(s.name ?? ""));
  }
  for (const part of chunk(planIds, 150)) {
    const { data } = await supabaseAdmin.from("pymes_plans").select("id, name").in("id", part);
    for (const p of (data ?? []) as Record<string, unknown>[]) plans.set(String(p.id), String(p.name ?? ""));
  }

  const groupOf = (paymentType: string | null, serviceId: string | null, eliteTier: string | null): ComparisonGroup => {
    if (paymentType === "elite_maintenance") return "elite_platform_fee";
    if (paymentType === "plan_installment") return "premier";
    if (paymentType === "installment") return "pyme_installments";
    if (paymentType === "upfront") return "pyme_upfront";
    const serviceName = serviceId ? services.get(serviceId) ?? null : null;
    if (paymentType === "one_time" || paymentType === null) {
      if (eliteTier || eliteTierForServiceName(serviceName)) return "elite_fixed_fee";
      if (serviceName && /preferred/i.test(serviceName) && /premier/i.test(serviceName)) return "premier";
    }
    return "other";
  };

  const rows: ComparisonRow[] = [];
  const buildRow = (key: string, item: StripeItem | null, dbRows: DbRow[], notInStripeNote: string | null) => {
    const completed = dbRows.filter((r) => r.status === "completed");
    // Main row: the completed one with the largest amount (an add-on row
    // shares the session), otherwise any row for this key.
    const main =
      [...completed].sort((a, b) => b.amountCents - a.amountCents)[0] ?? dbRows[0] ?? null;
    const userId = main?.userId ?? item?.userId ?? null;
    const propertyId = main?.propertyId ?? item?.propertyId ?? null;
    const pymesPlanId = main?.pymesPlanId ?? item?.pymesPlanId ?? null;
    const serviceId = main?.serviceId ?? item?.serviceId ?? null;
    const paymentType = main ? main.paymentType : item?.paymentType ?? null;
    const group = groupOf(paymentType, serviceId, item?.eliteTier ?? null);
    const profile = userId ? profiles.get(userId) : undefined;

    const stripeNetCents = item ? item.grossCents - item.refundedCents : 0;
    const dbCents = completed.reduce((sum, r) => sum + r.amountCents, 0);
    const diffCents = stripeNetCents - dbCents;

    let status: ComparisonStatus;
    const notes: string[] = [];
    if (!item) {
      status = "not_in_stripe";
      if (notInStripeNote) notes.push(notInStripeNote);
    } else if (dbRows.length === 0) {
      status = stripeNetCents > 0 ? "missing_in_database" : "ok";
      if (stripeNetCents === 0) notes.push("Fully refunded in Stripe; no database row.");
    } else if (diffCents === 0) {
      status = "ok";
    } else if (item.refundedCents > 0 && dbCents > 0) {
      status = "refunded_still_completed";
    } else {
      status = "amount_differs";
    }
    if (item && completed.length === 0 && dbRows.length > 0) {
      const statuses = Array.from(new Set(dbRows.map((r) => r.status))).join(", ");
      notes.push(`Database row status: ${statuses} (not counted).`);
    }
    if (item?.outsidePeriod) notes.push("Stripe item is dated outside the selected period.");
    if (item && !item.refundsChecked) notes.push("Refunds not checked for this item.");

    const createdIso = item
      ? new Date(item.createdUnix * 1000).toISOString()
      : main?.createdAt || now.toISOString();

    rows.push({
      key,
      date: createdIso,
      customerName: profile?.name || profile?.email || item?.email || "Unknown customer",
      customerEmail: profile?.email ?? item?.email ?? null,
      scope:
        (propertyId && properties.get(propertyId)) ||
        (pymesPlanId && plans.get(pymesPlanId)) ||
        "Other",
      paymentType,
      paymentTypeLabel: paymentTypeLabel(paymentType, item?.kind ?? null),
      group,
      groupLabel: GROUP_LABELS[group],
      stripeAmount: stripeNetCents / 100,
      stripeRefunded: (item?.refundedCents ?? 0) / 100,
      databaseAmount: dbCents / 100,
      difference: diffCents / 100,
      status,
      statusLabel: STATUS_LABELS[status],
      note: notes.length > 0 ? notes.join(" ") : null,
    });
  };

  // 1) Every Stripe item (period lists + individual lookups).
  for (const [key, item] of stripeByKey) buildRow(key, item, rowsByKey.get(key) ?? [], null);

  // 2) Completed database rows of the period with no Stripe item.
  const handled = new Set<string>();
  for (const row of dbOnlyRows) {
    if (row.key && stripeByKey.has(row.key)) continue;
    if (isStripeKey(row.key)) {
      if (handled.has(row.key)) continue;
      handled.add(row.key);
      const note = lookups.unverified.has(row.key)
        ? "Not verified in Stripe (lookup limit, timeout or error)."
        : "Not found in Stripe with the current Stripe key.";
      buildRow(row.key, null, rowsByKey.get(row.key) ?? [row], note);
    } else {
      buildRow(`db:${row.id}`, null, [row], "This database row has no Stripe reference.");
    }
  }

  rows.sort((a, b) => {
    const aDiff = a.difference !== 0 ? 1 : 0;
    const bDiff = b.difference !== 0 ? 1 : 0;
    if (aDiff !== bDiff) return bDiff - aDiff;
    return b.date.localeCompare(a.date);
  });

  const round = (n: number) => Math.round(n * 100) / 100;
  const groups: ComparisonGroupSummary[] = GROUP_ORDER.map((group) => {
    const inGroup = rows.filter((r) => r.group === group);
    const stripeTotal = round(inGroup.reduce((s, r) => s + r.stripeAmount, 0));
    const dbTotal = round(inGroup.reduce((s, r) => s + r.databaseAmount, 0));
    return {
      group,
      label: GROUP_LABELS[group],
      stripe: stripeTotal,
      database: dbTotal,
      difference: round(stripeTotal - dbTotal),
      rows: inGroup.length,
      rowsWithDifference: inGroup.filter((r) => r.difference !== 0).length,
    };
  });
  const stripeTotal = round(rows.reduce((s, r) => s + r.stripeAmount, 0));
  const dbTotal = round(rows.reduce((s, r) => s + r.databaseAmount, 0));

  const truncated = stripeTruncated || dbTruncated;
  console.log(`${LOG} done`, {
    days,
    stripeItems: items.length,
    lookedUp: keysToLookUp.length,
    dbPeriodRows: periodRows.length,
    rows: rows.length,
    rowsWithDifference: rows.filter((r) => r.difference !== 0).length,
    truncated,
  });

  return {
    days,
    periodStart: cutoffIso,
    periodEnd: now.toISOString(),
    truncated,
    warnings,
    totals: { stripe: stripeTotal, database: dbTotal, difference: round(stripeTotal - dbTotal) },
    groups,
    rows,
    rowsWithDifference: rows.filter((r) => r.difference !== 0).length,
  };
}

// ── CSV ──

function csvText(value: string | null): string {
  let text = value ?? "";
  // Neutralize spreadsheet formulas in text cells.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function csvNumber(value: number): string {
  return value.toFixed(2);
}

export function comparisonToCsv(report: StripeDbComparison): string {
  const lines: string[] = [];
  const line = (cells: string[]) => lines.push(cells.join(","));

  line([csvText("Stripe vs Database"), csvText(`Last ${report.days} days`), csvText(report.periodStart), csvText(report.periodEnd)]);
  if (report.truncated) line([csvText("WARNING"), csvText("Stripe or database list reached its limit; results are incomplete.")]);
  for (const warning of report.warnings) line([csvText("WARNING"), csvText(warning)]);
  lines.push("");
  line([csvText("Summary"), csvText("Stripe (net)"), csvText("Database (completed)"), csvText("Difference"), csvText("Rows"), csvText("Rows with difference")]);
  for (const g of report.groups) {
    line([csvText(g.label), csvNumber(g.stripe), csvNumber(g.database), csvNumber(g.difference), String(g.rows), String(g.rowsWithDifference)]);
  }
  line([csvText("Total"), csvNumber(report.totals.stripe), csvNumber(report.totals.database), csvNumber(report.totals.difference), String(report.rows.length), String(report.rowsWithDifference)]);
  lines.push("");
  line(
    [
      "Date",
      "Customer",
      "Email",
      "Scope",
      "Payment type",
      "Group",
      "Stripe amount (net)",
      "Stripe refunded",
      "Database amount",
      "Difference",
      "Status",
      "Stripe reference",
      "Note",
    ].map(csvText),
  );
  for (const r of report.rows) {
    line([
      csvText(r.date.slice(0, 10)),
      csvText(r.customerName),
      csvText(r.customerEmail),
      csvText(r.scope),
      csvText(r.paymentTypeLabel),
      csvText(r.groupLabel),
      csvNumber(r.stripeAmount),
      csvNumber(r.stripeRefunded),
      csvNumber(r.databaseAmount),
      csvNumber(r.difference),
      csvText(r.statusLabel),
      csvText(r.key.startsWith("db:") ? "" : r.key),
      csvText(r.note),
    ]);
  }
  return lines.join("\r\n");
}
