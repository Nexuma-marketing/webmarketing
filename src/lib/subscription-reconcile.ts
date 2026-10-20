import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ELITE_SUB_TIERS } from "@/lib/constants";
import { sendCommercialAlertEmail } from "@/lib/email";
import {
  SUBSCRIPTION_SETUP_FAILED,
  createRecurringSubscription,
  customerIdOf,
  describeCase,
  eliteTierForServiceName,
  getSavedPaymentMethodFromSession,
  oneMonthAfter,
  type RecurringPlan,
} from "@/lib/subscription-setup";

// BUGFIX_ELITE_PYME_SUBSCRIPTIONS.md: daily safety net for Elite
// monthly platform-fee and PYME installment subscriptions. Run from
// /api/cron/process-installments (own try/catch) and manually from
// POST /api/admin/stripe/reconcile-subscriptions.
//
// For every completed Elite/PYME purchase (plus unresolved
// subscription_setup_failed markers) it looks for the Stripe
// subscription started from that checkout (metadata.checkout_session_id).
// Rules:
//   - ANY subscription for that checkout, in ANY status (canceled on
//     purpose included), means the case is done — never recreated.
//     Pre-fix subscriptions have no checkout_session_id, so those are
//     matched by property (Elite) or user + plan (PYME) instead.
//   - Missing + saved card + first-charge date (payment + 1 month) still
//     in the future → created with that trial_end.
//   - Missing + date already passed, or no saved card → commercial is
//     alerted, nothing is changed.
//   - A marker row is flipped to status "canceled" once resolved. A
//     marker set to "canceled" by hand (dismissed) skips the checkout.

const TAG = "[subscription-reconcile]";
// Leave fresh checkouts to the webhook, which may still be running.
const MIN_AGE_MS = 60 * 60 * 1000;

type Candidate = {
  sessionId: string;
  paidAtUnix: number;
  userId: string;
  propertyId: string | null;
  serviceId: string | null;
  pymesPlanId: string | null;
};

type Outcome =
  | "exists"
  | "created"
  | "would_create"
  | "date_passed"
  | "no_card"
  | "not_recurring"
  | "error";

export type ReconcileResult = { sessionId: string; outcome: Outcome; detail?: string; subscriptionId?: string };

export async function reconcileMissingSubscriptions(options: { dryRun?: boolean } = {}): Promise<{
  dryRun: boolean;
  checked: number;
  results: ReconcileResult[];
}> {
  const dryRun = !!options.dryRun;
  const cutoffIso = new Date(Date.now() - MIN_AGE_MS).toISOString();
  console.log(`${TAG} started`, { dryRun, cutoffIso });

  const eliteNames = Object.values(ELITE_SUB_TIERS).map((tier) => tier.dbServiceName);
  const { data: eliteServices, error: servicesError } = await supabaseAdmin
    .from("services")
    .select("id, name")
    .in("name", eliteNames);
  if (servicesError) throw new Error(`services lookup failed: ${servicesError.message}`);
  const serviceNameById = new Map((eliteServices || []).map((svc) => [svc.id as string, svc.name as string]));

  const [eliteRes, pymesRes, markerRes] = await Promise.all([
    serviceNameById.size
      ? supabaseAdmin
          .from("payments")
          .select("user_id, property_id, service_id, pymes_plan_id, stripe_session_id, created_at")
          .eq("status", "completed")
          .eq("payment_type", "one_time")
          .in("service_id", Array.from(serviceNameById.keys()))
          .not("property_id", "is", null)
          .lt("created_at", cutoffIso)
      : Promise.resolve({ data: [], error: null }),
    supabaseAdmin
      .from("payments")
      .select("user_id, property_id, service_id, pymes_plan_id, stripe_session_id, created_at")
      .eq("status", "completed")
      .eq("payment_type", "upfront")
      .not("pymes_plan_id", "is", null)
      .lt("created_at", cutoffIso),
    supabaseAdmin
      .from("payments")
      .select("user_id, property_id, service_id, pymes_plan_id, stripe_session_id, status, created_at")
      .eq("payment_type", SUBSCRIPTION_SETUP_FAILED),
  ]);
  for (const res of [eliteRes, pymesRes, markerRes]) {
    if (res.error) throw new Error(`payments lookup failed: ${res.error.message}`);
  }

  type Row = {
    user_id: string | null;
    property_id: string | null;
    service_id: string | null;
    pymes_plan_id: string | null;
    stripe_session_id: string | null;
    created_at: string;
    status?: string;
  };
  const markers = (markerRes.data || []) as Row[];
  const dismissed = new Set(markers.filter((m) => m.status === "canceled").map((m) => m.stripe_session_id));
  const unresolvedMarkers = new Set(markers.filter((m) => m.status === "failed").map((m) => m.stripe_session_id));

  const candidates = new Map<string, Candidate>();
  const addRow = (row: Row) => {
    const sessionId = row.stripe_session_id;
    // Only real Checkout Sessions (not plan_switch_noop_… or invoice ids).
    if (!sessionId || !sessionId.startsWith("cs_") || !row.user_id) return;
    if (dismissed.has(sessionId) || candidates.has(sessionId)) return;
    candidates.set(sessionId, {
      sessionId,
      paidAtUnix: Math.floor(new Date(row.created_at).getTime() / 1000),
      userId: row.user_id,
      propertyId: row.property_id,
      serviceId: row.service_id,
      pymesPlanId: row.pymes_plan_id,
    });
  };
  ((eliteRes.data || []) as Row[]).forEach(addRow);
  ((pymesRes.data || []) as Row[]).forEach(addRow);
  // A marker whose original payment row is missing (failed insert).
  markers
    .filter((m) => m.status === "failed" && new Date(m.created_at).getTime() < Date.now() - MIN_AGE_MS)
    .forEach(addRow);

  const subsByCustomer = new Map<string, Stripe.Subscription[]>();
  const listSubscriptions = async (customerId: string): Promise<Stripe.Subscription[]> => {
    const cached = subsByCustomer.get(customerId);
    if (cached) return cached;
    const subs: Stripe.Subscription[] = [];
    for await (const sub of stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 })) {
      subs.push(sub);
    }
    subsByCustomer.set(customerId, subs);
    return subs;
  };
  const findExisting = (subs: Stripe.Subscription[], c: Candidate): Stripe.Subscription | null =>
    subs.find((sub) => {
      const md = sub.metadata || {};
      if (md.checkout_session_id) return md.checkout_session_id === c.sessionId;
      // Pre-fix subscription (no checkout_session_id): match conservatively.
      if (md.kind === "elite_maintenance") return !!c.propertyId && md.property_id === c.propertyId;
      return !!c.pymesPlanId && md.pymes_plan_id === c.pymesPlanId && md.user_id === c.userId;
    }) ?? null;

  const resolveMarker = async (sessionId: string, subscriptionId: string | null) => {
    if (dryRun || !unresolvedMarkers.has(sessionId)) return;
    const { error } = await supabaseAdmin
      .from("payments")
      .update({ status: "canceled", canceled_at: new Date().toISOString(), stripe_subscription_id: subscriptionId })
      .eq("stripe_session_id", sessionId)
      .eq("payment_type", SUBSCRIPTION_SETUP_FAILED)
      .eq("status", "failed");
    if (error) console.error(`${TAG} marker resolve failed`, { sessionId, error });
    else console.log(`${TAG} marker resolved`, { sessionId, subscriptionId });
  };

  const results: ReconcileResult[] = [];
  const emailItems: Array<Record<string, string>> = [];
  const profileCustomer = new Map<string, string | null>();

  for (const c of Array.from(candidates.values())) {
    try {
      // Cheap path first: the owner's Stripe customer from their profile.
      if (!profileCustomer.has(c.userId)) {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("stripe_customer_id")
          .eq("id", c.userId)
          .maybeSingle();
        profileCustomer.set(c.userId, (profile?.stripe_customer_id as string | null) ?? null);
      }
      const profileCustomerId = profileCustomer.get(c.userId) ?? null;
      if (profileCustomerId) {
        const existing = findExisting(await listSubscriptions(profileCustomerId), c);
        if (existing) {
          await resolveMarker(c.sessionId, existing.id);
          results.push({ sessionId: c.sessionId, outcome: "exists", subscriptionId: existing.id, detail: existing.status });
          continue;
        }
      }

      const session = await stripe.checkout.sessions.retrieve(c.sessionId);
      const md = session.metadata || {};
      let plan: RecurringPlan | null = null;
      if (
        md.payment_type === "upfront" &&
        md.pymes_plan_id &&
        Number(md.installment_months) > 0 &&
        Number(md.installment_amount) > 0
      ) {
        plan = {
          kind: "pymes",
          userId: c.userId,
          pymesPlanId: md.pymes_plan_id,
          planType: md.plan_type || "PYME",
          installmentAmount: Number(md.installment_amount),
          installmentMonths: Number(md.installment_months),
        };
      } else if ((md.payment_type || "one_time") === "one_time" && (md.property_id || c.propertyId)) {
        // Pre-fix sessions may lack elite_tier (it came from
        // properties.elite_tier) — fall back to the purchased service.
        const serviceId = md.service_id || c.serviceId;
        const eliteTier =
          md.elite_tier && ELITE_SUB_TIERS[md.elite_tier]
            ? md.elite_tier
            : eliteTierForServiceName(serviceId ? serviceNameById.get(serviceId) : null);
        if (eliteTier) {
          plan = { kind: "elite", userId: c.userId, propertyId: (md.property_id || c.propertyId) as string, eliteTier };
        }
      }
      if (!plan) {
        results.push({ sessionId: c.sessionId, outcome: "not_recurring" });
        continue;
      }

      const customerId = customerIdOf(session);
      if (!customerId) {
        results.push({ sessionId: c.sessionId, outcome: "no_card", detail: "checkout has no Stripe customer" });
        emailItems.push(await describeCase(plan, c.sessionId, null, "Checkout has no Stripe customer — create the subscription manually."));
        continue;
      }
      if (customerId !== profileCustomerId) {
        const existing = findExisting(await listSubscriptions(customerId), c);
        if (existing) {
          await resolveMarker(c.sessionId, existing.id);
          results.push({ sessionId: c.sessionId, outcome: "exists", subscriptionId: existing.id, detail: existing.status });
          continue;
        }
      }

      const trialEnd = oneMonthAfter(c.paidAtUnix);
      const firstChargeIso = new Date(trialEnd * 1000).toISOString();
      if (trialEnd <= Math.floor(Date.now() / 1000)) {
        console.warn(`${TAG} missing subscription, first-charge date already passed — not created`, {
          sessionId: c.sessionId,
          firstChargeIso,
        });
        results.push({ sessionId: c.sessionId, outcome: "date_passed", detail: firstChargeIso });
        emailItems.push(
          await describeCase(
            plan,
            c.sessionId,
            customerId,
            `Missing subscription. Its first charge was due ${firstChargeIso.slice(0, 10)}, which has passed — not created automatically. Decide the start date and create it manually (put checkout_session_id=${c.sessionId} in its metadata), or dismiss this case.`,
          ),
        );
        continue;
      }

      const paymentMethodId = await findSavedCard(session, customerId);
      if (!paymentMethodId) {
        console.warn(`${TAG} missing subscription, no saved card — commercial alerted`, { sessionId: c.sessionId, customerId });
        results.push({ sessionId: c.sessionId, outcome: "no_card" });
        emailItems.push(
          await describeCase(
            plan,
            c.sessionId,
            customerId,
            `Missing subscription and no saved card on the Stripe customer. The customer must add a card; first charge should be ${firstChargeIso.slice(0, 10)}.`,
          ),
        );
        continue;
      }

      if (dryRun) {
        results.push({ sessionId: c.sessionId, outcome: "would_create", detail: firstChargeIso });
        continue;
      }
      const subscription = await createRecurringSubscription(plan, {
        customerId,
        paymentMethodId,
        trialEnd,
        checkoutSessionId: c.sessionId,
        keyScope: "reconcile",
      });
      subsByCustomer.get(customerId)?.push(subscription);
      console.log(`${TAG} subscription created`, { sessionId: c.sessionId, subscriptionId: subscription.id, firstChargeIso });
      await resolveMarker(c.sessionId, subscription.id);
      results.push({ sessionId: c.sessionId, outcome: "created", subscriptionId: subscription.id, detail: firstChargeIso });
      emailItems.push({
        ...(await describeCase(plan, c.sessionId, customerId, "Created by the daily reconcile with the saved card.")),
        Subscription: subscription.id,
        "First charge": firstChargeIso.slice(0, 10),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${TAG} candidate failed`, { sessionId: c.sessionId, error: message });
      results.push({ sessionId: c.sessionId, outcome: "error", detail: message });
      emailItems.push({ "Checkout session": c.sessionId, "User ID": c.userId, Reason: `Reconcile error: ${message}` });
    }
  }

  if (!dryRun && emailItems.length > 0) {
    await sendCommercialAlertEmail({
      subject: "Subscription reconcile: Elite/PYME monthly subscriptions need attention",
      intro:
        "The daily check found Elite platform-fee / PYME installment purchases whose monthly subscription was missing. Each case below says what was done.",
      items: emailItems,
    });
  }

  const counts = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.outcome] = (acc[r.outcome] || 0) + 1;
    return acc;
  }, {});
  console.log(`${TAG} finished`, { dryRun, checked: candidates.size, counts });
  return { dryRun, checked: candidates.size, results };
}

/** Card saved at this checkout, else the customer's invoice default, else their most recent card. */
async function findSavedCard(session: Stripe.Checkout.Session, customerId: string): Promise<string | null> {
  const fromSession = await getSavedPaymentMethodFromSession(session, customerId);
  if (fromSession) return fromSession;
  const customer = await stripe.customers.retrieve(customerId);
  if (!customer.deleted) {
    const def = customer.invoice_settings?.default_payment_method;
    if (def) return typeof def === "string" ? def : def.id;
  }
  const cards = await stripe.customers.listPaymentMethods(customerId, { type: "card", limit: 1 });
  return cards.data[0]?.id ?? null;
}
