import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  countChargedInstallments,
  isCancellationScheduled,
  subscriptionInstallmentAmount,
  subscriptionNextChargeUnix,
  subscriptionTotalInstallments,
  withStripeTimeout,
} from "@/lib/upcoming-charges";

// BUGFIX_SALES_REPORT_PYME.md: data for the "PYME installment plans"
// section of the admin Sales Report. Server-only, read-only (Supabase
// SELECTs and Stripe list calls; nothing is written).
//
// - Purchases: payments rows with payment_type 'upfront', status
//   'completed' and a pymes_plan_id (canceled rows are excluded).
// - Each upfront is matched to its Stripe subscription through
//   subscription.metadata.checkout_session_id === payments.stripe_session_id.
// - Recommended plan: same rule as getPymesPlanForUser
//   (src/lib/pymes-plan-display.ts) — the most recent of
//   pymes_diagnosis.recommended_plan and pymes_captacion.recommended_plan.
// Never throws for Stripe failures: rows are returned from the database
// with stripeAvailable = false.

export type PymePlanKey = "rescue" | "growth" | "scale";
export const PYME_PLAN_KEYS: PymePlanKey[] = ["rescue", "growth", "scale"];

export type PymePurchaseStatus =
  | "active"
  | "cancellation_scheduled"
  | "payment_failed"
  | "canceled"
  | "completed"
  | "subscription_not_found"
  | "unknown"; // Stripe unavailable, or a Stripe status not listed above

export interface PymePurchaseRow {
  paymentId: string;
  userId: string;
  name: string;
  email: string | null;
  upfrontAmount: number;
  upfrontDate: string; // ISO
  subscriptionId: string | null;
  stripeStatus: string | null; // raw Stripe status, for "unknown"
  chargedInstallments: number | null;
  totalInstallments: number | null;
  remainingInstallments: number | null;
  installmentAmount: number | null;
  nextChargeDate: string | null; // ISO
  cancelDate: string | null; // ISO, when cancellation is scheduled
  status: PymePurchaseStatus;
  /** remaining x installment amount, only when status is active. */
  upcomingAmount: number;
}

export interface PymeRecommendedRow {
  userId: string;
  name: string;
  email: string | null;
  diagnosisDate: string; // ISO
  source: "pymes_diagnosis" | "pymes_captacion";
}

export interface PymePlanReport {
  planType: PymePlanKey;
  planName: string;
  purchasedCompanies: number;
  recommendedNotPurchasedCompanies: number;
  purchased: PymePurchaseRow[];
  recommendedNotPurchased: PymeRecommendedRow[];
}

export interface PymeInstallmentReport {
  stripeAvailable: boolean;
  upcomingTotal: number | null; // null when Stripe is unavailable
  plans: PymePlanReport[];
}

const LOG = "[sales-report-pyme]";
const STRIPE_TIMEOUT_MS = 15000;
const DEFAULT_PLAN_NAMES: Record<PymePlanKey, string> = {
  rescue: "Rescue",
  growth: "Growth",
  scale: "Scale",
};

const unixToIso = (unix: number | null | undefined) =>
  unix ? new Date(unix * 1000).toISOString() : null;

/** All subscriptions in the account (status all), keyed by checkout session id. */
async function listSubscriptionsBySession(): Promise<Map<string, Stripe.Subscription>> {
  const bySession = new Map<string, Stripe.Subscription>();
  for await (const sub of stripe.subscriptions.list(
    { status: "all", limit: 100 },
    { timeout: STRIPE_TIMEOUT_MS, maxNetworkRetries: 0 },
  )) {
    const cs = sub.metadata?.checkout_session_id;
    if (cs) bySession.set(cs, sub);
  }
  return bySession;
}

function purchaseStatus(
  sub: Stripe.Subscription,
  charged: number,
  total: number,
): PymePurchaseStatus {
  if (total > 0 && charged >= total) return "completed";
  if (sub.status === "canceled" || sub.status === "incomplete_expired") return "canceled";
  if (sub.status === "past_due" || sub.status === "unpaid") return "payment_failed";
  if (sub.status === "trialing" || sub.status === "active") {
    return isCancellationScheduled(sub) ? "cancellation_scheduled" : "active";
  }
  return "unknown";
}

interface FormRow {
  user_id: string;
  recommended_plan: string | null;
  created_at: string;
  company: string | null;
  source: "pymes_diagnosis" | "pymes_captacion";
}

export async function buildPymeInstallmentReport(): Promise<PymeInstallmentReport> {
  const [plansRes, paymentsRes, diagnosisRes, captacionRes] = await Promise.all([
    supabaseAdmin.from("pymes_plans").select("id, plan_type, name, is_active"),
    supabaseAdmin
      .from("payments")
      .select(
        "id, user_id, pymes_plan_id, amount, payment_type, status, stripe_session_id, stripe_subscription_id, created_at",
      )
      .not("pymes_plan_id", "is", null),
    supabaseAdmin
      .from("pymes_diagnosis")
      .select("user_id, company_name, recommended_plan, created_at")
      .not("recommended_plan", "is", null),
    supabaseAdmin
      .from("pymes_captacion")
      .select("user_id, business_name, recommended_plan, created_at")
      .not("recommended_plan", "is", null),
  ]);
  for (const [label, res] of [
    ["pymes_plans", plansRes],
    ["payments", paymentsRes],
    ["pymes_diagnosis", diagnosisRes],
    ["pymes_captacion", captacionRes],
  ] as const) {
    if (res.error) console.error(`${LOG} ${label} query failed`, res.error);
  }

  const planTypeById = new Map<string, PymePlanKey>();
  const planNames: Record<PymePlanKey, string> = { ...DEFAULT_PLAN_NAMES };
  for (const plan of plansRes.data ?? []) {
    const type = plan.plan_type as PymePlanKey;
    if (!PYME_PLAN_KEYS.includes(type)) continue;
    planTypeById.set(plan.id as string, type);
    if (plan.is_active && plan.name) planNames[type] = plan.name as string;
  }

  const payments = paymentsRes.data ?? [];
  const upfronts = payments.filter(
    (p) => p.payment_type === "upfront" && p.status === "completed",
  );

  // Latest recommendation per user: most recent of diagnosis / captacion.
  const latestForm = new Map<string, FormRow>();
  const forms: FormRow[] = [
    ...(diagnosisRes.data ?? []).map((d) => ({
      user_id: d.user_id as string,
      recommended_plan: d.recommended_plan as string | null,
      created_at: d.created_at as string,
      company: (d.company_name as string | null) ?? null,
      source: "pymes_diagnosis" as const,
    })),
    ...(captacionRes.data ?? []).map((c) => ({
      user_id: c.user_id as string,
      recommended_plan: c.recommended_plan as string | null,
      created_at: c.created_at as string,
      company: (c.business_name as string | null) ?? null,
      source: "pymes_captacion" as const,
    })),
  ];
  for (const form of forms) {
    if (!form.user_id || !form.recommended_plan) continue;
    const current = latestForm.get(form.user_id);
    const t = new Date(form.created_at).getTime();
    // Ties go to pymes_diagnosis, as in getPymesPlanForUser.
    if (
      !current ||
      t > new Date(current.created_at).getTime() ||
      (t === new Date(current.created_at).getTime() && form.source === "pymes_diagnosis")
    ) {
      latestForm.set(form.user_id, form);
    }
  }

  // Names and emails for every user shown.
  const userIds = Array.from(
    new Set([...upfronts.map((p) => p.user_id as string), ...latestForm.keys()]),
  ).filter(Boolean);
  const profilesById = new Map<string, { full_name: string | null; email: string | null; company_name: string | null }>();
  if (userIds.length > 0) {
    const { data: profiles, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, company_name")
      .in("id", userIds);
    if (error) console.error(`${LOG} profiles query failed`, error);
    for (const p of profiles ?? []) {
      profilesById.set(p.id as string, {
        full_name: (p.full_name as string | null) ?? null,
        email: (p.email as string | null) ?? null,
        company_name: (p.company_name as string | null) ?? null,
      });
    }
  }
  const nameOf = (userId: string) => {
    const profile = profilesById.get(userId);
    return (
      profile?.company_name ||
      latestForm.get(userId)?.company ||
      profile?.full_name ||
      profile?.email ||
      "Unknown company"
    );
  };

  // Stripe (read-only). On failure keep going with database data only.
  let bySession: Map<string, Stripe.Subscription> | null = null;
  if (upfronts.length > 0) {
    try {
      bySession = await withStripeTimeout(listSubscriptionsBySession(), STRIPE_TIMEOUT_MS);
    } catch (err) {
      console.error(`${LOG} Stripe subscriptions lookup failed, showing database data only`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  const stripeAvailable = upfronts.length === 0 || bySession !== null;

  const plans: PymePlanReport[] = PYME_PLAN_KEYS.map((planType) => {
    const purchased: PymePurchaseRow[] = upfronts
      .filter((p) => planTypeById.get(p.pymes_plan_id as string) === planType)
      .map((p) => {
        const base: PymePurchaseRow = {
          paymentId: p.id as string,
          userId: p.user_id as string,
          name: nameOf(p.user_id as string),
          email: profilesById.get(p.user_id as string)?.email ?? null,
          upfrontAmount: Number(p.amount) || 0,
          upfrontDate: p.created_at as string,
          subscriptionId: null,
          stripeStatus: null,
          chargedInstallments: null,
          totalInstallments: null,
          remainingInstallments: null,
          installmentAmount: null,
          nextChargeDate: null,
          cancelDate: null,
          status: "unknown",
          upcomingAmount: 0,
        };
        if (!bySession) return base;
        const sub = p.stripe_session_id ? bySession.get(p.stripe_session_id as string) : undefined;
        if (!sub) return { ...base, status: "subscription_not_found" };

        const total = subscriptionTotalInstallments(sub);
        const charged = countChargedInstallments(payments, sub.id);
        const remaining = total > 0 ? Math.max(0, total - charged) : null;
        const installmentAmount = subscriptionInstallmentAmount(sub);
        const status = purchaseStatus(sub, charged, total);
        const nextChargeUnix = status === "active" ? subscriptionNextChargeUnix(sub) : null;
        const cancelUnix =
          status === "cancellation_scheduled"
            ? sub.cancel_at ??
              (sub.status === "trialing" ? sub.trial_end : sub.items?.data?.[0]?.current_period_end) ??
              null
            : null;
        return {
          ...base,
          subscriptionId: sub.id,
          stripeStatus: sub.status,
          chargedInstallments: charged,
          totalInstallments: total || null,
          remainingInstallments: remaining,
          installmentAmount,
          nextChargeDate: unixToIso(nextChargeUnix),
          cancelDate: unixToIso(cancelUnix),
          status,
          upcomingAmount:
            status === "active" && remaining && installmentAmount ? remaining * installmentAmount : 0,
        };
      })
      .sort((a, b) => b.upfrontDate.localeCompare(a.upfrontDate));

    const buyers = new Set(purchased.map((row) => row.userId));
    const recommendedNotPurchased: PymeRecommendedRow[] = Array.from(latestForm.values())
      .filter((form) => form.recommended_plan === planType && !buyers.has(form.user_id))
      .map((form) => ({
        userId: form.user_id,
        name: nameOf(form.user_id),
        email: profilesById.get(form.user_id)?.email ?? null,
        diagnosisDate: form.created_at,
        source: form.source,
      }))
      .sort((a, b) => b.diagnosisDate.localeCompare(a.diagnosisDate));

    return {
      planType,
      planName: planNames[planType],
      purchasedCompanies: buyers.size,
      recommendedNotPurchasedCompanies: recommendedNotPurchased.length,
      purchased,
      recommendedNotPurchased,
    };
  });

  const upcomingTotal = stripeAvailable
    ? plans.reduce(
        (sum, plan) => sum + plan.purchased.reduce((s, row) => s + row.upcomingAmount, 0),
        0,
      )
    : null;

  return { stripeAvailable, upcomingTotal, plans };
}
