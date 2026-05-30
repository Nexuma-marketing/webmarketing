import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { getEmailMetrics } from "@/lib/email";

// Public diagnostic — confirms which build + which DB state Steve is
// actually hitting. Visit /api/health on the live domain. Read-only.
// Steve 5/5: Tony saw v15 land in the DB but Steve still saw the
// 4/29 behaviour. This endpoint lets him verify in one click that
// the deployment serving him is the same one we're shipping.
export const dynamic = "force-dynamic";

const BUILD_COMMIT =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
  process.env.NEXT_PUBLIC_BUILD_COMMIT ||
  "unknown";
const BUILD_BRANCH = process.env.VERCEL_GIT_COMMIT_REF || "unknown";
const BUILD_TIME = process.env.VERCEL_GIT_COMMIT_AUTHOR_DATE || "unknown";

export async function GET() {
  const supabase = await createClient();

  // Use the service-role key (server-only) for the leads / property_images
  // queries so they bypass RLS and reflect the actual table contents.
  // The anon-context client would otherwise return [] for tables that gate
  // SELECT behind admin policies (leads), even though the data exists.
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const admin = serviceKey && url
    ? createSbClient(url, serviceKey, { auth: { persistSession: false } })
    : supabase;

  const [founders, plans, forms, legal, branding, leads, images] = await Promise.all([
    supabase.from("app_config").select("key, value").eq("category", "founders_plan"),
    supabase.from("services").select("name").eq("category", "plan").order("name"),
    supabase.from("forms_dynamic").select("slug").order("slug"),
    supabase.from("legal_documents").select("type, content"),
    supabase.from("site_content").select("key, value").eq("section", "branding"),
    admin.from("leads").select("role"),
    admin.from("property_images").select("room_category"),
  ]);

  const leadRoles = (leads.data || []).reduce<Record<string, number>>((acc, l) => {
    const k = l.role ?? "NULL";
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  const distinctRooms = Array.from(
    new Set((images.data || []).map((i) => i.room_category).filter(Boolean)),
  ).sort();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(
    /https?:\/\/([^.]+)\..+/,
    "$1",
  );

  return NextResponse.json({
    build: {
      commit: BUILD_COMMIT,
      branch: BUILD_BRANCH,
      committedAt: BUILD_TIME,
      expected: "020c93d (or later)",
    },
    db: {
      supabaseProject: supabaseUrl ?? "?",
      foundersCounter: Object.fromEntries(
        (founders.data || []).map((r) => [r.key, r.value]),
      ),
      planLevelServices: (plans.data || []).map((p) => p.name),
      forms: (forms.data || []).map((f) => f.slug),
      legalDocs: (legal.data || []).map((d) => ({
        type: d.type,
        contentLength: (d.content || "").length,
        isPlaceholder: /goes here/i.test(d.content || ""),
      })),
      branding: Object.fromEntries(
        (branding.data || []).map((r) => [r.key, r.value]),
      ),
      leadsByRole: leadRoles,
      propertyImagesRooms: distinctRooms,
    },
    email: {
      // Steve 5/7: surface contact-form email metrics so we can detect
      // delivery failures without waiting for the next customer round.
      ...getEmailMetrics(),
      resendApiKeyConfigured: !!process.env.RESEND_API_KEY,
      notificationRecipient:
        process.env.CONTACT_NOTIFICATION_EMAIL || "alexsanabria33@hotmail.com",
      fromAddress:
        process.env.RESEND_FROM_EMAIL || "Nexuma Marketing <notifications@nexuma.ca>",
      commercialRecipient:
        process.env.COMMERCIAL_AREA_EMAIL || "(not set — falls back to contact recipient)",
    },
    stripe: {
      // Steve 5/20 Milestone 4: confirm the 3 Stripe env vars are
      // configured WITHOUT ever leaking the value. We only check
      // presence + the key prefix so we can tell test vs live at a
      // glance. If any of the three is missing the checkout / refund /
      // webhook flows will fail in obvious ways.
      secretKeyConfigured: !!process.env.STRIPE_SECRET_KEY,
      secretKeyMode: process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_")
        ? "live"
        : process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")
          ? "test"
          : "unconfigured",
      publishableKeyConfigured: !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
      publishableKeyMode: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_live_")
        ? "live"
        : process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_test_")
          ? "test"
          : "unconfigured",
      webhookSecretConfigured: !!process.env.STRIPE_WEBHOOK_SECRET,
      // The mode check: in production both keys should be the same mode
      // (both test or both live). A mismatch would make the publishable
      // key reject API calls signed by the secret key.
      keysMatch:
        (!!process.env.STRIPE_SECRET_KEY &&
          !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY &&
          process.env.STRIPE_SECRET_KEY.startsWith("sk_test_") ===
            process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.startsWith("pk_test_")) ||
        false,
    },
    interpretation: {
      // Any non-"unknown" commit means Vercel is serving the build that was
      // pushed; we don't need to compare against a specific hash.
      buildOk: BUILD_COMMIT !== "unknown",
      foundersDataLoaded: (founders.data?.length || 0) >= 2,
      plansLoaded: (plans.data?.length || 0) >= 9,
      empresasFormsPresent:
        (forms.data || []).some((f) => f.slug === "lead_sales_calculator") &&
        (forms.data || []).some((f) => f.slug === "business_acquisition"),
      brandingHasLogoCover:
        (branding.data || []).some((r) => r.key === "site_logo_url") &&
        (branding.data || []).some((r) => r.key === "site_cover_image_url"),
      brandingNameApplied:
        (branding.data || []).find((r) => r.key === "site_brand_name")?.value !==
        "Nexuma Marketing",
      noNullLeadRoles:
        (leads.data?.length || 0) > 0 && !("NULL" in leadRoles),
      roomCasingNormalized: distinctRooms.every(
        (r) => r === r.toLowerCase() && !r.includes(" "),
      ),
      emailReady: !!process.env.RESEND_API_KEY,
      stripeReady:
        !!process.env.STRIPE_SECRET_KEY &&
        !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY &&
        !!process.env.STRIPE_WEBHOOK_SECRET,
    },
  });
}
