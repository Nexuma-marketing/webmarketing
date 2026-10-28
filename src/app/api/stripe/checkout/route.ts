import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripe, APP_URL } from "@/lib/stripe";
import { ELITE_SUB_TIERS, displayServiceName } from "@/lib/constants";
import { computeNetAmountDueCents } from "@/lib/plan-switch";
import { FOUNDERS_SERVICE_NAME, LOW_PRICE_SERVICE_NAME } from "@/lib/payment-lookup";
import { eliteTierForServiceName } from "@/lib/subscription-setup";
import { PROMO_FLOW_VERSION, validatePromoForCheckout, type CheckoutPromo } from "@/lib/promotions-server";
import {
  getActivePlanPromoDiscount,
  isBalancePlan,
  resolvePlanBalanceTerms,
  type PlanBalanceTerms,
} from "@/lib/plan-promo-discount";

// Steve 6/10 (6-2.md #51): GST workaround per Alex's WhatsApp guide.
// `automatic_tax: { enabled: true }` requires the Stripe Tax module
// to be activated in the dashboard AND a Canada tax registration —
// the second part needs a CRA business number Alex doesn't have yet.
//
// Workaround: create a manual "GST 5%" tax rate in the Stripe
// dashboard (Products → Tax rates → Add tax rate) and put its id
// (txr_...) in the STRIPE_GST_RATE_ID env var. We then apply that
// rate to every line item via `tax_rates: [...]` and remove
// `automatic_tax`. No registration required.
//
// If the env var is missing, we fall back to `automatic_tax` so the
// production setup continues to work whenever Alex eventually adds
// the CRA registration.
const STRIPE_GST_RATE_ID = process.env.STRIPE_GST_RATE_ID || null;

function taxFields() {
  return STRIPE_GST_RATE_ID
    ? { tax_rates: [STRIPE_GST_RATE_ID] }
    : {};
}

function sessionTaxConfig(): { automatic_tax?: { enabled: true } } {
  return STRIPE_GST_RATE_ID ? {} : { automatic_tax: { enabled: true } };
}

// FIX_PROMOTIONS_REPORT.md: read by the webhook, which counts the use
// and stores the redemption once the payment completes. promo_v marks
// sessions created with this flow (older sessions were already counted
// when they were created).
function promoMetadata(promo: CheckoutPromo | null): Record<string, string> {
  if (!promo) return {};
  return {
    promotion_id: promo.promotionId,
    promo_label: promo.label,
    promo_discount_cents: String(promo.totalDiscountCents),
    promo_v: PROMO_FLOW_VERSION,
  };
}

// Roles whose plans are bought per property (owner plans + Elite).
const PROPERTY_PLAN_ROLES = new Set(["propietario", "propietario_preferido", "inversionista"]);

/**
 * Names of the plan-category services this property already has a
 * completed payment for (refunded/failed rows don't count; add-ons
 * aren't plans). Same legacy fallback as
 * getCompletedPaymentForPropertyService: pre-restructure plan payments
 * have property_id = null and count for the property only when its
 * owner has exactly one property. Returns null if a lookup failed, so
 * the caller can refuse instead of charging blind.
 */
async function getPaidPlanNamesForProperty(propertyId: string, ownerId: string): Promise<string[] | null> {
  const planNamesFor = async (serviceIds: string[]): Promise<string[] | null> => {
    if (serviceIds.length === 0) return [];
    const { data: services, error } = await supabaseAdmin
      .from("services")
      .select("id, name, category")
      .in("id", serviceIds);
    if (error) return null;
    return (services || []).filter((svc) => svc.category === "plan").map((svc) => svc.name as string);
  };

  const { data: rows, error } = await supabaseAdmin
    .from("payments")
    .select("service_id")
    .eq("property_id", propertyId)
    .eq("status", "completed")
    .not("service_id", "is", null);
  if (error) return null;
  const paid = await planNamesFor(Array.from(new Set((rows || []).map((r) => r.service_id as string))));
  if (paid === null || paid.length > 0) return paid;

  const { count, error: countError } = await supabaseAdmin
    .from("properties")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId);
  if (countError) return null;
  if (count !== 1) return [];

  const { data: legacyRows, error: legacyError } = await supabaseAdmin
    .from("payments")
    .select("service_id")
    .eq("user_id", ownerId)
    .is("property_id", null)
    .eq("status", "completed")
    .not("service_id", "is", null);
  if (legacyError) return null;
  return planNamesFor(Array.from(new Set((legacyRows || []).map((r) => r.service_id as string))));
}

// FIX_PYME_MONEY_GUARDS_REPORT.md: the PYME plans used to be sold
// both through pymes_upfront and as plain one-time services named
// "Plan: PYMES — Rescue/Growth/Scale". Only pymes_upfront is allowed now.
const PYME_SERVICE_PREFIX = "Plan: PYMES";

/** "Plan Rescue" → "Rescue"; "Plan: PYMES — Rescue" → "Rescue". */
function pymePlanDisplayName(name: string | null | undefined): string {
  const raw = (name || "").trim();
  if (!raw) return "PYME";
  if (raw.startsWith(PYME_SERVICE_PREFIX)) {
    const afterDash = raw.split("—").pop()?.trim();
    return afterDash || "PYME";
  }
  return raw.replace(/^plan\s+/i, "").trim() || raw;
}

/**
 * One PYME plan per client (FIX_PYME_MONEY_GUARDS_REPORT.md). Returns
 * the display name of a PYME plan this user already bought, "" if none,
 * or null if a lookup failed (the caller refuses instead of charging
 * blind). A purchase counts while its payment row is `completed`:
 * refunded / failed rows don't count. The Stripe subscription state is
 * not checked — under this rule a canceled or finished installment plan
 * still blocks, so it would not change the answer.
 * Counts both the pymes_upfront payments and the legacy one-time
 * "Plan: PYMES — …" service purchases.
 */
async function getPurchasedPymePlanName(userId: string): Promise<string | null> {
  const { data: upfronts, error: upfrontError } = await supabaseAdmin
    .from("payments")
    .select("pymes_plan_id, created_at")
    .eq("user_id", userId)
    .eq("payment_type", "upfront")
    .eq("status", "completed")
    .not("pymes_plan_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (upfrontError) return null;
  if (upfronts && upfronts.length > 0) {
    const { data: plan, error: planError } = await supabaseAdmin
      .from("pymes_plans")
      .select("name")
      .eq("id", upfronts[0].pymes_plan_id as string)
      .maybeSingle();
    if (planError) return null;
    return pymePlanDisplayName(plan?.name as string | undefined);
  }

  const { data: pymeServices, error: servicesError } = await supabaseAdmin
    .from("services")
    .select("id, name")
    .like("name", `${PYME_SERVICE_PREFIX}%`);
  if (servicesError) return null;
  if (!pymeServices || pymeServices.length === 0) return "";
  const { data: servicePayments, error: servicePaymentsError } = await supabaseAdmin
    .from("payments")
    .select("service_id, created_at")
    .eq("user_id", userId)
    .eq("status", "completed")
    .in("service_id", pymeServices.map((svc) => svc.id as string))
    .order("created_at", { ascending: false })
    .limit(1);
  if (servicePaymentsError) return null;
  if (!servicePayments || servicePayments.length === 0) return "";
  const service = pymeServices.find((svc) => svc.id === servicePayments[0].service_id);
  return pymePlanDisplayName(service?.name as string | undefined);
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { type, serviceId, pymesPlanId, propertyId, addOnServiceId, netAgainstExisting, promoCode } = await request.json();

    // Get or create Stripe customer
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id, email, full_name, role")
      .eq("id", user.id)
      .single();
    const userRole = (profile?.role as string | null) ?? null;

    let customerId = profile?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile?.email || user.email,
        name: profile?.full_name || undefined,
        metadata: { user_id: user.id },
      });
      customerId = customer.id;

      await supabase
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
    }

    switch (type) {
      // ── One-time service purchase ──
      case "service": {
        if (!serviceId) {
          return NextResponse.json(
            { error: "serviceId required" },
            { status: 400 }
          );
        }

        const { data: service } = await supabase
          .from("services")
          .select("id, name, description, price, currency, category")
          .eq("id", serviceId)
          .single();

        if (!service) {
          return NextResponse.json(
            { error: "Service not found" },
            { status: 404 }
          );
        }

        // FIX_PYME_MONEY_GUARDS_REPORT.md: PYME plans are sold only
        // through pymes_upfront (upfront + monthly installments).
        if (String(service.name || "").startsWith(PYME_SERVICE_PREFIX)) {
          return NextResponse.json(
            { error: "This plan must be purchased from the PYME plans page." },
            { status: 400 },
          );
        }

        // Steve: Elite portfolio fees (Essentials/Signature/Luxury) are
        // charged per property, never shared across an investor's
        // portfolio. When the caller scopes the purchase to one
        // property, verify it belongs to the requesting user (ownership
        // check, same pattern as every other properties query in this
        // app) and stamp the session so the specific property is
        // identifiable from the Stripe dashboard/webhook metadata.
        let propertyLabel = "";
        // Set only when this "service" purchase is an Elite one-time
        // portfolio fee for an ownership-checked property — the webhook
        // uses this to start the matching monthly platform-fee
        // subscription. Derived server-side from the purchased SERVICE
        // (BUGFIX_ELITE_PYME_SUBSCRIPTIONS.md), not from
        // properties.elite_tier, which profileOwner rewrites and can be
        // NULL for a property that just paid an Elite fee. Left
        // undefined for every other checkout (owner plans, add-ons,
        // etc.), which are unaffected.
        let eliteTierForSubscription: string | undefined;
        let propertyMonthlyRent = 0;
        if (propertyId) {
          const { data: property } = await supabase
            .from("properties")
            .select("id, address, city, monthly_rent")
            .eq("id", propertyId)
            .eq("owner_id", user.id)
            .single();

          if (!property) {
            return NextResponse.json(
              { error: "Property not found" },
              { status: 404 }
            );
          }
          propertyLabel = `${property.address}, ${property.city}`;
          propertyMonthlyRent = Number(property.monthly_rent) || 0;

          eliteTierForSubscription = eliteTierForServiceName(service.name) ?? undefined;
        }

        // Double-charge protection (BUGFIX_DOUBLE_CHARGE_STAGE1.md): a
        // property's plan is assigned by the system and paid once. The
        // pages already hide "Pay" once paid, but that never stopped a
        // second tab, a stale page or a direct POST. Only exception: the
        // documented Low Price → Founders upgrade (netAgainstExisting).
        if (service.category === "plan" && userRole && PROPERTY_PLAN_ROLES.has(userRole)) {
          if (!propertyId) {
            return NextResponse.json(
              { error: "A property is required to purchase a plan" },
              { status: 400 },
            );
          }
          const paidPlanNames = await getPaidPlanNamesForProperty(propertyId, user.id);
          if (paidPlanNames === null) {
            return NextResponse.json(
              { error: "We couldn't verify this property's payments. Please try again in a moment." },
              { status: 503 },
            );
          }
          if (paidPlanNames.length > 0) {
            const isFoundersUpgrade =
              !!netAgainstExisting &&
              service.name === FOUNDERS_SERVICE_NAME &&
              paidPlanNames.every((name) => name === LOW_PRICE_SERVICE_NAME);
            if (!isFoundersUpgrade) {
              console.warn("[stripe-checkout] Blocked plan checkout for an already-paid property", {
                userId: user.id,
                propertyId,
                requestedService: service.name,
                paidPlanNames,
              });
              return NextResponse.json(
                { error: "This property already has a paid plan" },
                { status: 409 },
              );
            }
          }
        }

        const eliteTierInfo = eliteTierForSubscription
          ? ELITE_SUB_TIERS[eliteTierForSubscription]
          : null;

        // Steve — BELOW_PORTFOLIO_MINIMUM_FULL_CHARGE_FIX.md: the
        // "Below Portfolio Minimum" one-time fee is 30% of THIS
        // property's own rent, not a flat amount from `services.price`
        // (that column only holds a fixed fee for Essentials/Signature/
        // Luxury, and isn't meaningful for this tier — see the
        // migration for why the row still exists). Computed here,
        // server-side, from the ownership-checked property's own
        // `monthly_rent` — never trusted from client input — and
        // charged in FULL via Stripe, same as Essentials/Signature/
        // Luxury's full-fee checkout, no manual balance step.
        let chargeAmount = eliteTierInfo?.oneTimeFeePercent
          ? Math.round(propertyMonthlyRent * eliteTierInfo.oneTimeFeePercent * 100) / 100
          : service.price;
        // Steve: full disclosure before checkout — when this purchase
        // will also enroll the property in a recurring monthly
        // maintenance-fee subscription, say so plainly in the Stripe
        // Checkout line-item description the customer sees before
        // paying, not just in our own UI copy.
        let descriptionSuffix = eliteTierInfo
          ? `\nBy completing this one-time payment of $${chargeAmount} CAD, you also authorize a separate recurring monthly charge of $${eliteTierInfo.monthlyFee} CAD (monthly platform fee for this property), billed automatically to this card each month starting one month after this payment, until canceled.`
          : "";

        // Set by the plan switch below when this property already has an
        // upfront paid (FIX_PROMOTIONS_BALANCE_REPORT.md).
        let alreadyPaidForSwitchCents = 0;
        // PROMPT2 item 8: "smart balance" plan switch (Founders and any
        // future plan-to-plan switch on the same property). Nets
        // whatever was already paid upfront for this property (any
        // prior plan) against the new plan's total fee — see
        // src/lib/plan-switch.ts. Only meaningful with a propertyId.
        if (netAgainstExisting && propertyId) {
          const net = await computeNetAmountDueCents(supabase, {
            propertyId,
            newServiceId: serviceId,
          });
          if (!net) {
            return NextResponse.json(
              { error: "Could not resolve property/service for plan switch" },
              { status: 404 },
            );
          }
          // FIX_PROMOTIONS_BALANCE_REPORT.md: a promo discount already
          // stored for this property's plan (code used on the earlier
          // upfront) still comes off the plan's value, so the switch
          // charges the difference minus that discount. Without this the
          // customer would pay it here and lose it.
          let netDueCents = net.netDueCents;
          let storedPromoDiscountCents = 0;
          if (net.alreadyPaidCents > 0) {
            const stored = await getActivePlanPromoDiscount(propertyId);
            if (!stored.ok) {
              return NextResponse.json(
                { error: "We couldn't verify this property's payments. Please try again in a moment." },
                { status: 503 },
              );
            }
            storedPromoDiscountCents = stored.discount?.discountCents ?? 0;
            netDueCents = Math.max(0, netDueCents - storedPromoDiscountCents);
          }
          alreadyPaidForSwitchCents = net.alreadyPaidCents;
          if (netDueCents === 0) {
            // Already fully covered by a prior payment on this property —
            // no new Stripe charge. Record a $0 audit row (never a
            // silent no-op) and send the user straight to Payment
            // History; downstream balance flow (item 1) proceeds from
            // there exactly as if the upfront had just been paid.
            const { error: noopError } = await supabaseAdmin.from("payments").insert({
              user_id: user.id,
              service_id: serviceId,
              property_id: propertyId,
              stripe_session_id: `plan_switch_noop_${propertyId}_${Date.now()}`,
              amount: 0,
              currency: (service.currency || "CAD").toUpperCase(),
              payment_type: "plan_switch_noop",
              status: "completed",
            });
            if (noopError) {
              console.error("[stripe-checkout] Failed to record plan_switch_noop row:", noopError);
            }
            return NextResponse.json({
              redirectUrl: `${APP_URL}/dashboard/payments?planSwitched=1`,
            });
          }
          chargeAmount = netDueCents / 100;
          if (net.alreadyPaidCents > 0) {
            descriptionSuffix += `\nNetted against $${net.alreadyPaidCents / 100} CAD already paid on this property — you only pay the difference.`;
          }
          if (storedPromoDiscountCents > 0) {
            descriptionSuffix += `\nYour promo discount of $${(storedPromoDiscountCents / 100).toFixed(2)} CAD on this property's plan is also deducted.`;
          }
        }

        const baseCents = Math.round(chargeAmount * 100);
        let unitAmount = baseCents;
        let promo: CheckoutPromo | null = null;
        let planPromoTerms: PlanBalanceTerms | null = null;
        if (promoCode) {
          // FIX_PROMOTIONS_REPORT.md: the code discounts this one charge
          // only. Elite: the one-time portfolio fee, never the monthly
          // platform fee. The priority-listing add-on is never discounted.
          if (service.category === "addon") {
            return NextResponse.json(
              { error: "Promo codes don't apply to add-ons." },
              { status: 400 },
            );
          }
        }
        if (promoCode && service.category === "plan" && isBalancePlan(service.name)) {
          // FIX_PROMOTIONS_BALANCE_REPORT.md: Low Price, Founders, Support
          // and Premier. The code discounts the plan's value to charge
          // (rent × plan %), not today's upfront: the upfront stays as it
          // is and the balance billed later is reduced. The webhook stores
          // the discount with the property.
          if (!propertyId) {
            return NextResponse.json(
              { error: "Choose a property to apply a promo code to this plan." },
              { status: 400 },
            );
          }
          const stored = await getActivePlanPromoDiscount(propertyId);
          if (!stored.ok) {
            return NextResponse.json(
              { error: "We couldn't check this promo code. Please try again in a moment." },
              { status: 503 },
            );
          }
          if (stored.discount) {
            return NextResponse.json(
              { error: "This property's plan already has a promo code applied." },
              { status: 400 },
            );
          }
          const terms = await resolvePlanBalanceTerms({
            serviceName: service.name as string,
            propertyId,
            ownerId: user.id,
            monthlyRentCad: propertyMonthlyRent,
          });
          if (!terms.ok) {
            return NextResponse.json({ error: terms.error }, { status: terms.status });
          }
          // Plan switch with an upfront already paid: today's charge is
          // the whole remaining balance (that is how the switch bills it).
          const isSwitchBalance = alreadyPaidForSwitchCents > 0;
          const v = await validatePromoForCheckout({
            code: String(promoCode),
            userId: user.id,
            userRole,
            purchaseKind: "property",
            chargesCents: [baseCents],
            planBalance: {
              planTotalCents: terms.terms.planTotalCents,
              upfrontCents: isSwitchBalance ? alreadyPaidForSwitchCents : baseCents,
              installmentShares: isSwitchBalance ? [1] : terms.terms.installmentShares,
            },
          });
          if (!v.ok) {
            return NextResponse.json({ error: v.error }, { status: v.status });
          }
          promo = v.promo;
          planPromoTerms = terms.terms;
          const offCad = (promo.totalDiscountCents / 100).toFixed(2);
          if (isSwitchBalance) {
            unitAmount = promo.planBalance!.balanceCents;
            descriptionSuffix += `\nPromo applied: ${promo.label} — $${offCad} CAD off this plan's total fee, deducted from today's payment.`;
          } else {
            descriptionSuffix += `\nPromo applied: ${promo.label} — $${offCad} CAD off this plan's total fee. Today's payment is not discounted; the discount is deducted from your remaining balance.`;
          }
        } else if (promoCode) {
          const v = await validatePromoForCheckout({
            code: String(promoCode),
            userId: user.id,
            userRole,
            purchaseKind: propertyId || service.category === "plan" ? "property" : "other",
            chargesCents: [baseCents],
          });
          if (!v.ok) {
            return NextResponse.json({ error: v.error }, { status: v.status });
          }
          promo = v.promo;
          unitAmount = promo.discountedCents[0];
          // Append rather than overwrite so the Elite recurring-fee
          // disclosure above (when present) still reaches the customer
          // even when a promo code is also applied.
          descriptionSuffix += `\nPromo applied: ${promo.label}`;
        }

        // PROMPT2 item 7: optional +$100 priority listing placement
        // add-on (Low Price plan) as a second, clearly itemized Stripe
        // line item on the SAME checkout session — not a separate
        // purchase. Promo codes only apply to the main plan line item
        // above, not the add-on.
        let addOnLineItem: {
          price_data: {
            currency: string;
            product_data: { name: string; description?: string };
            unit_amount: number;
            tax_behavior: "exclusive";
          };
          quantity: 1;
          tax_rates?: string[];
        } | null = null;
        let addOnAmountCents = 0;
        if (addOnServiceId) {
          const { data: addOnService } = await supabase
            .from("services")
            .select("id, name, description, price, currency, is_active")
            .eq("id", addOnServiceId)
            .eq("is_active", true)
            .single();
          if (addOnService) {
            addOnAmountCents = Math.round(Number(addOnService.price) * 100);
            addOnLineItem = {
              price_data: {
                currency: (addOnService.currency || "cad").toLowerCase(),
                product_data: {
                  name: displayServiceName(addOnService.name as string),
                  description: (addOnService.description as string) || undefined,
                },
                unit_amount: addOnAmountCents,
                tax_behavior: "exclusive",
              },
              quantity: 1,
              ...taxFields(),
            };
          }
        }

        const session = await stripe.checkout.sessions.create({
          customer: customerId,
          payment_method_types: ["card"],
          mode: "payment",
          // BUGFIX_ELITE_PYME_SUBSCRIPTIONS.md: Elite only — save the
          // card on the customer so the webhook can start the monthly
          // platform-fee subscription with it. Every other purchase
          // (Founders, Low Price, Premier, add-ons) is unchanged.
          ...(eliteTierForSubscription
            ? { payment_intent_data: { setup_future_usage: "off_session" as const } }
            : {}),
          ...sessionTaxConfig(),
          billing_address_collection: "required",
          customer_update: { address: "auto", name: "auto" },
          // Steve 5/27 Milestone 4 (#7/#8 May 26 docx):
          // - consent_collection: show Terms + Privacy links on the
          //   Stripe Checkout page footer so the customer sees the
          //   legal docs before paying (client said "No vi este al
          //   momento de pagar").
          // FIX_PROMOTIONS_REPORT.md: no allow_promotion_codes — Stripe's
          // own promo box is off; only the app's code (promotions table)
          // is accepted.
          consent_collection: {
            terms_of_service: "required",
          },
          custom_text: {
            terms_of_service_acceptance: {
              message: "I agree to the [Terms of Service](https://webmarketing-lyart.vercel.app/legal/terms_of_service) and [Privacy Policy](https://webmarketing-lyart.vercel.app/legal/privacy_policy). All sales are final per our [Refund Policy](https://webmarketing-lyart.vercel.app/legal/refund_policy).",
            },
          },
          line_items: [
            {
              price_data: {
                currency: (service.currency || "cad").toLowerCase(),
                product_data: {
                  // Steve — LUJO_CARD_TITLE_DISPLAY_FIX.md: this is the
                  // literal product name shown on Stripe's hosted
                  // checkout page and the customer's receipt — genuinely
                  // customer-facing, unlike `service.name` used for the
                  // security check above (untouched). Only the display
                  // string is translated.
                  name: propertyLabel
                    ? `${displayServiceName(service.name)} — ${propertyLabel}`
                    : displayServiceName(service.name),
                  description:
                    (service.description || "") + descriptionSuffix || undefined,
                },
                unit_amount: unitAmount,
                tax_behavior: "exclusive",
              },
              quantity: 1,
              ...taxFields(),
            },
            ...(addOnLineItem ? [addOnLineItem] : []),
          ],
          success_url: `${APP_URL}/dashboard/payments/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${APP_URL}/dashboard/services?cancelled=true`,
          metadata: {
            user_id: user.id,
            service_id: serviceId,
            payment_type: "one_time",
            ...(propertyId ? { property_id: propertyId } : {}),
            // Read by the webhook's checkout.session.completed handler
            // to start the property's monthly maintenance-fee
            // subscription once this one-time fee succeeds. Only ever
            // set from the purchased Elite service on an
            // ownership-checked property (above) — never trusted from
            // raw client input.
            ...(eliteTierForSubscription ? { elite_tier: eliteTierForSubscription } : {}),
            // PROMPT2 item 7: read by the webhook to split this one
            // Checkout Session into two `payments` rows (main plan +
            // add-on) so the add-on's own "already purchased" check
            // (item 4) works and it doesn't get offered again.
            ...(addOnLineItem
              ? { addon_service_id: addOnServiceId, addon_amount_cents: String(addOnAmountCents) }
              : {}),
            ...promoMetadata(promo),
            // FIX_PROMOTIONS_BALANCE_REPORT.md: read by the webhook to
            // store the plan discount with the property.
            ...(promo?.planBalance && planPromoTerms
              ? {
                  promo_scope: "plan_balance",
                  promo_code: promo.code,
                  promo_discount_type: promo.discountType,
                  promo_discount_value: String(promo.discountValue),
                  promo_plan_percentage: String(planPromoTerms.planPercentage),
                  promo_monthly_rent: String(propertyMonthlyRent),
                  promo_plan_total_cents: String(promo.planBalance.planTotalCents),
                  promo_upfront_cents: String(promo.planBalance.upfrontCents),
                }
              : {}),
          },
        });

        // FIX_PROMOTIONS_REPORT.md: the use is counted by the webhook
        // when the payment completes, not here.
        return NextResponse.json({ url: session.url });
      }

      // ── PYMES plan upfront payment ──
      case "pymes_upfront": {
        if (!pymesPlanId) {
          return NextResponse.json(
            { error: "pymesPlanId required" },
            { status: 400 }
          );
        }

        const { data: plan } = await supabase
          .from("pymes_plans")
          .select("*")
          .eq("id", pymesPlanId)
          .single();

        if (!plan) {
          return NextResponse.json(
            { error: "Plan not found" },
            { status: 404 }
          );
        }

        // FIX_PYME_MONEY_GUARDS_REPORT.md: one PYME plan per client.
        // Server-side, so a stale page, a second tab or a direct POST
        // can't start a second purchase.
        const purchasedPlanName = await getPurchasedPymePlanName(user.id);
        if (purchasedPlanName === null) {
          return NextResponse.json(
            { error: "We couldn't verify your payments. Please try again in a moment." },
            { status: 503 },
          );
        }
        if (purchasedPlanName) {
          console.warn("[stripe-checkout] Blocked PYME checkout for a client who already bought a PYME plan", {
            userId: user.id,
            requestedPlanId: pymesPlanId,
            purchasedPlanName,
          });
          return NextResponse.json(
            {
              error: `You already purchased the ${purchasedPlanName} plan. See your payments and upcoming charges in Payment History.`,
            },
            { status: 409 },
          );
        }

        const upfrontAmount = plan.upfront_amount || plan.price * 0.5;
        const baseCents = Math.round(upfrontAmount * 100);
        const pymeInstallmentAmount = Number(plan.installment_amount) || 0;
        const pymeInstallmentMonths = Number(plan.installment_months) || 0;
        const hasInstallments = pymeInstallmentAmount > 0 && pymeInstallmentMonths > 0;
        const baseInstallmentCents = Math.round(pymeInstallmentAmount * 100);
        let unitAmount = baseCents;
        // FIX_PROMOTIONS_REPORT.md: with a promo code, every installment
        // is discounted too. The discounted amount goes in the session
        // metadata, which is what the webhook and the daily reconcile
        // use to create the installment subscription.
        let installmentCents = baseInstallmentCents;
        let promo: CheckoutPromo | null = null;
        let descriptionSuffix = "";
        if (promoCode) {
          const v = await validatePromoForCheckout({
            code: String(promoCode),
            userId: user.id,
            userRole,
            purchaseKind: "pymes",
            chargesCents: [
              baseCents,
              ...(hasInstallments ? Array<number>(pymeInstallmentMonths).fill(baseInstallmentCents) : []),
            ],
          });
          if (!v.ok) {
            return NextResponse.json({ error: v.error }, { status: v.status });
          }
          promo = v.promo;
          unitAmount = promo.discountedCents[0];
          // Equal installments get the same discount (same share of the total).
          if (hasInstallments) installmentCents = promo.discountedCents[1];
          descriptionSuffix = `\nPromo applied: ${promo.label}`;
        }

        // BUGFIX_PYME_CHECKOUT_DISCLOSURE_AND_RECEIPT.md: same disclosure
        // as Elite — the webhook starts N monthly installment charges on
        // this card. Only when the webhook will actually create them.
        const fmtCad = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
        const recurringDisclosure = hasInstallments
          ? `. By completing this payment of $${fmtCad(unitAmount / 100)} CAD, you also authorize ${pymeInstallmentMonths} recurring monthly charges of $${fmtCad(installmentCents / 100)} CAD (plus applicable taxes), billed automatically to this card each month starting one month after this payment. The installment plan ends after the last charge.`
          : "";

        const session = await stripe.checkout.sessions.create({
          customer: customerId,
          payment_method_types: ["card"],
          mode: "payment",
          // BUGFIX_ELITE_PYME_SUBSCRIPTIONS.md: save the card for the
          // monthly installment subscription the webhook starts.
          payment_intent_data: { setup_future_usage: "off_session" },
          ...sessionTaxConfig(),
          billing_address_collection: "required",
          customer_update: { address: "auto", name: "auto" },
          consent_collection: {
            terms_of_service: "required",
          },
          custom_text: {
            terms_of_service_acceptance: {
              message: "I agree to the [Terms of Service](https://webmarketing-lyart.vercel.app/legal/terms_of_service) and [Privacy Policy](https://webmarketing-lyart.vercel.app/legal/privacy_policy). All sales are final per our [Refund Policy](https://webmarketing-lyart.vercel.app/legal/refund_policy).",
            },
          },
          line_items: [
            {
              price_data: {
                currency: "cad",
                product_data: {
                  name: `${plan.name} — Initial Payment`,
                  // Names are stored as "Plan Rescue" — don't append "plan" again.
                  description: `Upfront payment for ${/\bplan\b/i.test(String(plan.name)) ? plan.name : `${plan.name} plan`}${recurringDisclosure}${descriptionSuffix}`,
                },
                unit_amount: unitAmount,
                tax_behavior: "exclusive",
              },
              quantity: 1,
              ...taxFields(),
            },
          ],
          success_url: `${APP_URL}/dashboard/payments/success?session_id={CHECKOUT_SESSION_ID}&plan=${plan.plan_type}`,
          cancel_url: `${APP_URL}/dashboard/services?cancelled=true`,
          metadata: {
            user_id: user.id,
            pymes_plan_id: pymesPlanId,
            payment_type: "upfront",
            plan_type: plan.plan_type,
            // Receipt label in the webhook (BUGFIX_PYME_CHECKOUT_DISCLOSURE_AND_RECEIPT.md).
            plan_name: String(plan.name || ""),
            // Already discounted when a promo code was applied.
            installment_amount: promo && hasInstallments
              ? (installmentCents / 100).toFixed(2)
              : String(plan.installment_amount || 0),
            installment_months: String(plan.installment_months || 0),
            ...promoMetadata(promo),
            ...(promo
              ? {
                  upfront_amount_original: (baseCents / 100).toFixed(2),
                  installment_amount_original: (baseInstallmentCents / 100).toFixed(2),
                }
              : {}),
          },
        });

        return NextResponse.json({ url: session.url });
      }

      default:
        return NextResponse.json(
          { error: "Invalid type. Use: service or pymes_upfront" },
          { status: 400 }
        );
    }
  } catch (err) {
    console.error("Checkout error:", err);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
