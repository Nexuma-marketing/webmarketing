import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripe, APP_URL } from "@/lib/stripe";

// Steve 5/4 / Milestone 4: validate an admin-defined promo code from the
// promotions table and return either an error message or a discount
// amount in cents to subtract from the line item.
//
// Rules (in order):
//   - exists / is_active = true
//   - valid_from <= today
//   - valid_until null OR >= today
//   - max_uses null OR used_count < max_uses
//   - target_roles empty OR includes profile.role
//
// target_zones is intentionally NOT enforced here — zones gate which
// promotions appear on the user's banner (active-promotions-banner.tsx),
// but at checkout time the user has explicitly typed a code so we trust
// their intent and let it through.
async function validatePromoCode(
  code: string,
  baseAmountCad: number,
  userRole: string | null,
): Promise<
  | { ok: true; promotionId: string; discountCents: number; appliedLabel: string }
  | { ok: false; error: string }
> {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return { ok: false, error: "Empty code" };

  // Steve 5/22 Milestone 4: promotions has admin-only RLS, so reading
  // via the caller's cookie-context client returned null for every
  // non-admin user → "Promo code not found" even when the code existed.
  // Use service-role here (server-only) so the lookup actually finds
  // the row. We still re-check all eligibility rules below.
  const { data: promo } = await supabaseAdmin
    .from("promotions")
    .select(
      "id, code, discount_type, discount_value, valid_from, valid_until, is_active, max_uses, used_count, target_roles",
    )
    .eq("code", trimmed)
    .maybeSingle();

  if (!promo) return { ok: false, error: "Promo code not found" };
  if (!promo.is_active) return { ok: false, error: "Promo code inactive" };

  const today = new Date().toISOString().split("T")[0];
  if (promo.valid_from && promo.valid_from > today) {
    return { ok: false, error: "Promo code not yet active" };
  }
  if (promo.valid_until && promo.valid_until < today) {
    return { ok: false, error: "Promo code expired" };
  }
  if (
    promo.max_uses !== null &&
    promo.used_count >= promo.max_uses
  ) {
    return { ok: false, error: "Promo code usage limit reached" };
  }
  const roles = (promo.target_roles as string[] | null) || [];
  if (roles.length > 0 && (!userRole || !roles.includes(userRole))) {
    return {
      ok: false,
      error: "Promo code is not eligible for your account",
    };
  }

  let discountCents = 0;
  let appliedLabel = "";
  const baseCents = Math.round(baseAmountCad * 100);
  if (promo.discount_type === "percentage") {
    discountCents = Math.round((baseCents * promo.discount_value) / 100);
    appliedLabel = `${promo.discount_value}% off (${trimmed})`;
  } else {
    discountCents = Math.round(promo.discount_value * 100);
    appliedLabel = `$${promo.discount_value} CAD off (${trimmed})`;
  }
  if (discountCents > baseCents) discountCents = baseCents;

  return {
    ok: true,
    promotionId: promo.id,
    discountCents,
    appliedLabel,
  };
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

    const { type, serviceId, pymesPlanId, promoCode } = await request.json();

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
          .select("id, name, description, price, currency")
          .eq("id", serviceId)
          .single();

        if (!service) {
          return NextResponse.json(
            { error: "Service not found" },
            { status: 404 }
          );
        }

        const baseCents = Math.round(service.price * 100);
        let unitAmount = baseCents;
        let promoMeta: { promotionId: string; appliedLabel: string } | null = null;
        let descriptionSuffix = "";
        if (promoCode) {
          const v = await validatePromoCode(
            String(promoCode),
            service.price,
            userRole,
          );
          if (!v.ok) {
            return NextResponse.json({ error: v.error }, { status: 400 });
          }
          unitAmount = Math.max(0, baseCents - v.discountCents);
          promoMeta = { promotionId: v.promotionId, appliedLabel: v.appliedLabel };
          descriptionSuffix = `\nPromo applied: ${v.appliedLabel}`;
        }

        const session = await stripe.checkout.sessions.create({
          customer: customerId,
          payment_method_types: ["card"],
          mode: "payment",
          automatic_tax: { enabled: true },
          billing_address_collection: "required",
          customer_update: { address: "auto", name: "auto" },
          // Steve 5/27 Milestone 4 (#7/#8 May 26 docx):
          // - consent_collection: show Terms + Privacy links on the
          //   Stripe Checkout page footer so the customer sees the
          //   legal docs before paying (client said "No vi este al
          //   momento de pagar").
          // - allow_promotion_codes: show Stripe's native promo input
          //   on the checkout page so the customer can enter a code
          //   there even if they missed the one on our page.
          consent_collection: {
            terms_of_service: "required",
          },
          custom_text: {
            terms_of_service_acceptance: {
              message: "I agree to the [Terms of Service](https://webmarketing-lyart.vercel.app/legal/terms_of_service) and [Privacy Policy](https://webmarketing-lyart.vercel.app/legal/privacy_policy). All sales are final per our [Refund Policy](https://webmarketing-lyart.vercel.app/legal/refund_policy).",
            },
          },
          allow_promotion_codes: !promoCode,
          line_items: [
            {
              price_data: {
                currency: (service.currency || "cad").toLowerCase(),
                product_data: {
                  name: service.name,
                  description:
                    (service.description || "") + descriptionSuffix || undefined,
                },
                unit_amount: unitAmount,
                tax_behavior: "exclusive",
              },
              quantity: 1,
            },
          ],
          success_url: `${APP_URL}/dashboard/payments/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${APP_URL}/dashboard/services?cancelled=true`,
          metadata: {
            user_id: user.id,
            service_id: serviceId,
            payment_type: "one_time",
            ...(promoMeta
              ? {
                  promotion_id: promoMeta.promotionId,
                  promo_label: promoMeta.appliedLabel,
                }
              : {}),
          },
        });

        // Increment used_count immediately. Stripe webhook could roll it
        // back on payment failure; for our demo + testing flow we accept
        // the slight over-counting risk.
        // Steve 5/22 Milestone 4: was writing via the cookie-context
        // client and RLS denied it for every non-admin user, so the
        // counter never moved. Service-role write to bypass RLS.
        if (promoMeta) {
          const { data: p } = await supabaseAdmin
            .from("promotions")
            .select("used_count")
            .eq("id", promoMeta.promotionId)
            .single();
          if (p) {
            await supabaseAdmin
              .from("promotions")
              .update({ used_count: (p.used_count ?? 0) + 1 })
              .eq("id", promoMeta.promotionId);
          }
        }

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

        const upfrontAmount = plan.upfront_amount || plan.price * 0.5;
        const baseCents = Math.round(upfrontAmount * 100);
        let unitAmount = baseCents;
        let promoMeta: { promotionId: string; appliedLabel: string } | null = null;
        let descriptionSuffix = "";
        if (promoCode) {
          const v = await validatePromoCode(
            String(promoCode),
            upfrontAmount,
            userRole,
          );
          if (!v.ok) {
            return NextResponse.json({ error: v.error }, { status: 400 });
          }
          unitAmount = Math.max(0, baseCents - v.discountCents);
          promoMeta = { promotionId: v.promotionId, appliedLabel: v.appliedLabel };
          descriptionSuffix = `\nPromo applied: ${v.appliedLabel}`;
        }

        const session = await stripe.checkout.sessions.create({
          customer: customerId,
          payment_method_types: ["card"],
          mode: "payment",
          automatic_tax: { enabled: true },
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
          allow_promotion_codes: !promoCode,
          line_items: [
            {
              price_data: {
                currency: "cad",
                product_data: {
                  name: `${plan.name} — Initial Payment`,
                  description: `Upfront payment for ${plan.name} plan${descriptionSuffix}`,
                },
                unit_amount: unitAmount,
                tax_behavior: "exclusive",
              },
              quantity: 1,
            },
          ],
          success_url: `${APP_URL}/dashboard/payments/success?session_id={CHECKOUT_SESSION_ID}&plan=${plan.plan_type}`,
          cancel_url: `${APP_URL}/dashboard/services?cancelled=true`,
          metadata: {
            user_id: user.id,
            pymes_plan_id: pymesPlanId,
            payment_type: "upfront",
            plan_type: plan.plan_type,
            installment_amount: String(plan.installment_amount || 0),
            installment_months: String(plan.installment_months || 0),
            ...(promoMeta
              ? {
                  promotion_id: promoMeta.promotionId,
                  promo_label: promoMeta.appliedLabel,
                }
              : {}),
          },
        });

        if (promoMeta) {
          const { data: p } = await supabaseAdmin
            .from("promotions")
            .select("used_count")
            .eq("id", promoMeta.promotionId)
            .single();
          if (p) {
            await supabaseAdmin
              .from("promotions")
              .update({ used_count: (p.used_count ?? 0) + 1 })
              .eq("id", promoMeta.promotionId);
          }
        }

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
