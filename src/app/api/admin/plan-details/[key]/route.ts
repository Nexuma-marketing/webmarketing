import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Steve 6/9 (6-2.md #44): Alex 2026-06-07 docx Item 5 sub-issue 9
// — sales sees "Tier: Basic" on a property but can't expand it to
// see WHAT the Basic plan actually includes. The plan bullet list +
// tagline lives in app_config (category = `plan_features:<key>`)
// and is edited by admins via /admin/plans. This route serves that
// payload for any internal role so the Property detail modal can
// surface it inline.

export const dynamic = "force-dynamic";

const INTERNAL_ROLES = ["admin", "marketing", "sales", "support"];

// Hardcoded fallback content — mirrors the defaults in
// src/app/(dashboard)/admin/plans/page.tsx so a property tier
// without a saved override still renders meaningful text rather
// than a blank section.
const FALLBACKS: Record<string, { tagline: string; features: string[] }> = {
  owner_basic: {
    tagline: "Marketing that maximizes your profitability — your property, your money",
    features: [
      "Marketing campaign per property until tenant found (~16 days avg.)",
      "Client-uploaded photos with validation",
      "Visual recommendations prior to listing",
      "Unit verification (on-site visit)",
      "Tenant credit screening",
      "RTB-1 (BC) contract drafting & signing",
    ],
  },
  owner_founders: {
    tagline:
      "30% of first month's rent (one-time, lifetime rate) — limited to the first 20 Visionary Owners",
    features: [
      "Exclusive rate for the first 20 owners — limited spots",
      "$200 system fee upfront (deducted from the 30%)",
      "Pay the balance only after tenant signs the lease",
      "No monthly commissions",
      "Ideal for short-term rentals (weekly, monthly, up to 6 months)",
    ],
  },
  owner_low_price: {
    tagline: "35% of first month's rent (one-time)",
    features: [
      "$200 system fee upfront (deducted from the 35%)",
      "Pay the balance only after tenant signs the lease",
      "No monthly commissions",
      "Optional: +$100 for priority listing placement (1 month)",
    ],
  },
  owner_preferred: {
    tagline: "Enhanced services for growing property portfolios (2–3 properties)",
    features: [
      "Marketing campaign per property until tenant found (~15 days avg.)",
      "Client-uploaded photos",
      "Weekly interested-parties report",
      "Priority credit analysis of best applicants",
      "Full credit screening of tenants",
      "Unit handover with inventory checklist",
      "RTB-1 (BC) contract drafting & signing",
    ],
  },
  owner_elite: {
    tagline: "Maximum protection for premium asset portfolios (4+ properties)",
    features: [
      "Dedicated property advisor",
      "Custom marketing campaign per property",
      "Professional photo + video shoot",
      "Premium portal placements",
      "Full tenant background + financial verification",
      "Asset inventory + photo record at handover",
      "Quarterly portfolio performance review",
    ],
  },
};

// Maps the `service_tier` column on `properties` to the plan_key
// admins use. The Owner tier on /admin/plans is grouped under
// owner_basic; specific basic-tier plans (founders / low_price)
// are separate entries.
const TIER_TO_KEY: Record<string, string> = {
  basic: "owner_basic",
  preferred_owners: "owner_preferred",
  elite: "owner_elite",
  owner_founders: "owner_founders",
  owner_low_price: "owner_low_price",
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ key: string }> },
) {
  const { key: rawKey } = await context.params;
  if (!rawKey) {
    return NextResponse.json({ error: "key required" }, { status: 400 });
  }
  const planKey = TIER_TO_KEY[rawKey] ?? rawKey;

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
  if (!callerProfile?.role || !INTERNAL_ROLES.includes(callerProfile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data } = await supabaseAdmin
    .from("app_config")
    .select("key, value")
    .eq("category", `plan_features:${planKey}`);

  const cfg = Object.fromEntries(
    (data ?? []).map((r) => [r.key as string, r.value as string]),
  );
  const fallback = FALLBACKS[planKey] || { tagline: "", features: [] };
  return NextResponse.json({
    key: planKey,
    tagline: cfg.tagline ?? fallback.tagline,
    features: (cfg.features
      ? cfg.features.split("\n").map((f) => f.trim()).filter(Boolean)
      : fallback.features),
  });
}
