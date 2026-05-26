import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Steve 5/4: Founders counter and plan overrides must reflect admin
// edits immediately. Force dynamic rendering so Next.js does not cache
// any server-side fetch on this route.
export const dynamic = "force-dynamic";
export const revalidate = 0;
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  Crown,
  Zap,
  ArrowRight,
  Star,
  Building2,
  MapPin,
} from "lucide-react";
import { CheckoutButton } from "@/components/checkout/checkout-button";
import { MatchedPropertyCard } from "@/components/tenant/matched-property-card";
import { ActivePromotionsBanner } from "@/components/dashboard/active-promotions-banner";

// ─── Owner Service Tiers ─────────────────────────────
const OWNER_TIERS: Record<
  string,
  {
    name: string;
    tagline: string;
    features: string[];
    plans: {
      name: string;
      pricing: string;
      details: string[];
      cta: string;
    }[];
    color: string;
    bgColor: string;
    borderColor: string;
  }
> = {
  basic: {
    name: "Basic",
    tagline: "Marketing that maximizes your profitability — your property, your money",
    features: [
      "Marketing campaign per property until tenant found (~16 days avg.)",
      "Client-uploaded photos with validation",
      "Visual recommendations prior to listing",
      "Unit verification (on-site visit)",
      "Tenant credit screening",
      "RTB-1 (BC) contract drafting & signing",
    ],
    plans: [
      {
        name: "Low Price",
        pricing: "35% of first month's rent (one-time)",
        details: [
          "$200 system fee upfront (deducted from the 35%)",
          "Pay the balance only after tenant signs the lease",
          "No monthly commissions",
          "Optional: +$100 for priority listing placement (1 month)",
        ],
        cta: "Choose & secure your money",
      },
      {
        name: "Founders Package — Visionary Owners",
        pricing: "30% of first month's rent (one-time, lifetime rate)",
        details: [
          "Exclusive rate for the first 20 owners — limited spots",
          "$200 system fee upfront (deducted from the 30%)",
          "Pay the balance only after tenant signs the lease",
          "No monthly commissions",
          "Ideal for short-term rentals (weekly, monthly, up to 6 months)",
        ],
        cta: "Trust & earn",
      },
    ],
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
  },
  preferred_owners: {
    name: "Preferred Owners",
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
    plans: [
      {
        name: "Support Tier",
        pricing: "30% 1st property / 28% 2nd & 3rd (one-time each)",
        details: [
          "$200 system fee per property upfront (deducted from %)",
          "Pay the balance only after tenant signs the lease",
          "No monthly commissions",
        ],
        cta: "Get Support",
      },
      {
        name: "Premier Tier",
        pricing: "Same rates with flexible installment payments",
        details: [
          "For owners committing 1.5+ years",
          "1st property: 30% — $200 upfront, balance at month 2 after lease signing",
          "2nd & 3rd: 28% — $200 upfront, 50% at month 1, 30% at month 2, 20% at month 3",
        ],
        cta: "Go Premier",
      },
    ],
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-200",
  },
  elite: {
    name: "Elite Assets & Legacy",
    tagline: "Full-service management for investment portfolios (4+ properties)",
    features: [
      "Targeted marketing campaign per property (~15 days avg.)",
      "Professional 3D photography & virtual tour",
      "Interior design recommendations",
      "360° tenant verification (credit + behavioral references)",
      "Priority search positioning",
      "On-site unit verification & showing",
      "Handover with detailed checklist",
      "RTB-1 (BC) contract drafting & signing",
      "Free rent price optimization",
      "Free event packages (concerts, sports, seasonal)",
      "KPI performance report per property",
      "Local vendor alliances for repairs & maintenance",
      "Premium portal listing + targeted campaigns",
      "Expansion & wealth growth analysis",
      "Premium tenant welcome program",
      "Satisfaction surveys to reduce turnover",
    ],
    plans: [
      {
        name: "Asset Management",
        pricing: "Portfolio-based pricing (Essentials / Signature / Lujo)",
        details: [
          "Single plan with 3 investment portfolios based on rent level",
          "Includes CFP (Cash Flow Preserved) calculation per property",
          "Includes Payback period calculation per property",
        ],
        cta: "Manage My Assets",
      },
    ],
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
  },
};

// Steve 5/22 Milestone 4: client reported "no puedo comprar ningún plan,
// el enlace esta roto, no hace nada". The plan cards used
// `<Link href="/dashboard/services#contact">` — a same-page anchor that
// didn't trigger checkout. This map ties each static plan card name
// to its row in the `services` table (seeded in migrations v11/v12/v19)
// so we can render a real CheckoutButton with the right serviceId.
// Plans not in this map (Elite "Asset Management") still fall back to
// a contact link until the multi-sub-tier Elite flow is built.
const PLAN_NAME_TO_DB_SERVICE: Record<string, string> = {
  "Low Price": "Plan: Low Price",
  "Founders Package — Visionary Owners": "Plan: Founder Package — Visionary Owners",
  "Support Tier": "Plan: Owner Preferred — Support Tier",
  "Premier Tier": "Plan: Owner Preferred — Premier Tier",
};

// ─── Elite Sub-Tiers ────────────────────────────────
const ELITE_SUB_TIERS: Record<
  string,
  {
    name: string;
    description: string;
    oneTimeFee: number;
    monthlyFee: number;
    feeDescription: string;
    extras: string[];
  }
> = {
  essentials: {
    name: "Essentials",
    description: "Avg. rent $2,500 – $3,999 CAD",
    oneTimeFee: 900,
    monthlyFee: 100,
    feeDescription: "$900 CAD one-time per unit + $100 CAD/month optimization fee shared across all linked Essentials properties",
    extras: [
      "Quarterly portfolio review",
      "Basic revenue optimization",
    ],
  },
  signature: {
    name: "Signature",
    description: "Avg. rent $4,000 – $7,000 CAD",
    oneTimeFee: 1410,
    monthlyFee: 100,
    feeDescription: "$1,410 CAD one-time per unit + $100 CAD/month optimization fee shared across all linked Signature properties",
    extras: [
      "Monthly portfolio review",
      "Advanced revenue optimization",
      "Premium market positioning",
    ],
  },
  lujo: {
    name: "Lujo",
    description: "Avg. rent $7,001+ CAD",
    oneTimeFee: 1650,
    monthlyFee: 300,
    feeDescription: "$1,650 CAD one-time per unit + $300 CAD/month optimization and maintenance fee shared across all linked Lujo properties",
    extras: [
      "Weekly portfolio review",
      "White-glove concierge service",
      "Luxury market positioning",
      "International investor network",
    ],
  },
};

// ─── PYMES Plans ─────────────────────────────────────
const PYMES_PLANS: Record<
  string,
  {
    name: string;
    price: string;
    upfront: string;
    installment: string;
    duration: string;
    tagline: string;
    features: string[];
    color: string;
    bgColor: string;
    borderColor: string;
  }
> = {
  rescue: {
    name: "Rescue",
    price: "$1,500 CAD",
    upfront: "$750 CAD upfront (50%)",
    installment: "$375 CAD × 2 monthly payments",
    duration: "Minimum 2.5 months",
    tagline: "Intensive intervention plan to exit critical mode and move to growth",
    features: [
      "Complete business diagnosis & sales leak analysis",
      "Digital presence emergency recovery",
      "Basic optimization (Google Business, Social Media, SEO)",
      "Lead capture structure & funnel setup",
      "Direct 1-on-1 advisory sessions",
      "Monthly KPI performance report",
    ],
    color: "text-red-600",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
  },
  growth: {
    name: "Growth",
    price: "$2,500 CAD",
    upfront: "$1,250 CAD upfront (50%)",
    installment: "$625 CAD × 2 monthly payments",
    duration: "Minimum 4–5 months",
    tagline: "Plan to overcome stagnation, correct weaknesses and start growing",
    features: [
      "Complete business diagnosis & sales leak analysis",
      "Marketing strategy development & execution",
      "Conversion rate optimization",
      "Campaign structure & ad management",
      "Lead tracking system implementation",
      "Market positioning analysis",
      "Bi-weekly KPI performance reports",
    ],
    color: "text-orange-600",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-200",
  },
  scale: {
    name: "Scale",
    price: "$3,800 CAD",
    upfront: "$1,520 CAD upfront (40%)",
    installment: "$570 CAD × 4 monthly payments",
    duration: "Minimum 6 months",
    tagline: "Plan to scale and maximize revenue with advanced strategies",
    features: [
      "Complete business diagnosis & sales leak analysis",
      "Advanced multi-channel optimization",
      "Channel expansion & new market entry",
      "Growth strategy & scaling roadmap",
      "Opportunity & competitor analysis",
      "Weekly KPI performance reports",
    ],
    color: "text-green-600",
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
  },
};

function FoundersBanner({ taken, limit }: { taken: number; limit: number }) {
  const left = Math.max(0, limit - taken);
  return (
    <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-4 text-center">
      <p className="text-lg font-bold text-amber-900">
        {taken} owners have already chosen the Founders Package
      </p>
      <p className="text-2xl font-extrabold text-red-600 mt-1">
        Only {left} spots left — Hurry!
      </p>
      <p className="text-xs text-amber-700 mt-2">
        Limited to the first {limit} Visionary Owners at the special lifetime rate.
      </p>
    </div>
  );
}

export default async function ServicesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  const isOwnerRole =
    profile.role === "propietario" ||
    profile.role === "propietario_preferido" ||
    profile.role === "inversionista";

  const isTenantRole =
    profile.role === "inquilino" || profile.role === "inquilino_premium";

  const isPymesRole = profile.role === "pymes";

  // ─── Owner data ────────────────────────────────
  let ownerTier: string | null = null;
  let propertyCount = 0;
  let totalCFP = 0;
  let ownerProperties: {
    id: string;
    property_type: string;
    address: string;
    city: string;
    monthly_rent: number | null;
    service_tier: string | null;
    elite_tier: string | null;
    cfp_monthly: number | null;
    payback_months: number | null;
  }[] = [];

  if (isOwnerRole) {
    const { data: properties } = await supabase
      .from("properties")
      .select("id, property_type, address, city, monthly_rent, service_tier, elite_tier, cfp_monthly, payback_months")
      .eq("owner_id", user.id);

    propertyCount = properties?.length ?? 0;

    const isInvestor = profile.role === "inversionista";
    // Steve 4/20: Property Owner stays at Basic/Preferred regardless of count
    const isOwnerNotInvestor =
      profile.role === "propietario" || profile.role === "propietario_preferido";

    if (properties && properties.length > 0) {
      // Investor → always Elite (portfolio-based)
      // Property Owner → Basic/Preferred based on count, never auto-promoted to Elite
      if (isInvestor) {
        ownerTier = "elite";
      } else if (isOwnerNotInvestor) {
        ownerTier = propertyCount >= 2 ? "preferred_owners" : "basic";
      } else {
        // Fallback for users with no explicit role
        ownerTier = properties[0].service_tier;
      }
      ownerProperties = properties;
      totalCFP = properties.reduce(
        (sum, p) => sum + (Number(p.cfp_monthly) || 0),
        0
      );
    } else {
      // Fallback: derive from role + property count
      if (isInvestor) ownerTier = "elite";
      else if (isOwnerNotInvestor) ownerTier = profile.property_count >= 2 ? "preferred_owners" : "basic";
      else if (profile.property_count >= 4) ownerTier = "elite";
      else if (profile.property_count >= 2) ownerTier = "preferred_owners";
      else if (profile.property_count >= 1) ownerTier = "basic";
    }
  }

  // ─── PYMES data ────────────────────────────────
  let pymesPlan: string | null = null;
  let pymesPlanRecord: { id: string; plan_type: string } | null = null;

  if (isPymesRole) {
    const { data: diagnosis } = await supabase
      .from("pymes_diagnosis")
      .select("recommended_plan")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    pymesPlan = diagnosis?.recommended_plan || null;

    if (pymesPlan) {
      const { data: planRecord } = await supabase
        .from("pymes_plans")
        .select("id, plan_type")
        .eq("plan_type", pymesPlan)
        .eq("is_active", true)
        .limit(1)
        .single();

      pymesPlanRecord = planRecord;
    }
  }

  // ─── Tenant data: matched properties (Steve #2: show ALL matches with full info) ────────────
  interface MatchedProperty {
    id: string;
    property_type: string;
    address: string;
    city: string;
    province: string | null;
    postal_code: string | null;
    monthly_rent: number | null;
    bedrooms: number | null;
    bathrooms: number | null;
    area_sqft: number | null;
    amenities: string[] | null;
    common_areas: string[] | null;
    availability_date: string | null;
    dishwasher: boolean;
    pet_friendly: boolean;
    smart_home: boolean;
    furnished: boolean;
    utilities_included: boolean;
    near_parks: boolean;
    near_skytrain: boolean;
    skytrain_lines: string[] | null;
    near_bus: boolean;
    near_mall: boolean;
    nearby_supermarkets: string[] | null;
    is_available: boolean;
    matchScore: number;
  }
  let matchedProperties: MatchedProperty[] = [];

  if (isTenantRole) {
    const { matchPropertiesForTenant } = await import("@/lib/profiling");
    matchedProperties = (await matchPropertiesForTenant(user.id)) as MatchedProperty[];
  }

  // Fetch ALL photos per matched property (Steve #2-3: show all photos per room).
  // Steve 4/30 #9: hide images that admin rejected — they should not be shown
  // to tenants nor counted toward the property's listing.
  const matchedPropertyIds = matchedProperties.map((p) => p.id);
  const matchedImages: Record<string, { image_url: string; room_category: string }[]> = {};
  if (matchedPropertyIds.length > 0) {
    const { data: imgs } = await supabase
      .from("property_images")
      .select("property_id, image_url, room_category, sort_order, status")
      .in("property_id", matchedPropertyIds)
      .neq("status", "rejected")
      .order("room_category")
      .order("sort_order", { ascending: true });
    if (imgs) {
      for (const img of imgs) {
        if (!matchedImages[img.property_id]) matchedImages[img.property_id] = [];
        matchedImages[img.property_id].push({
          image_url: img.image_url,
          room_category: img.room_category,
        });
      }
    }
  }

  // ─── General services ──────────────────────────
  const { data: allServices } = await supabase
    .from("services")
    .select("*")
    .eq("is_active", true)
    .order("category");

  // Steve 5/22 Milestone 4: lookup table by DB name so the static plan
  // cards can find their corresponding services row + price + id and
  // render a working CheckoutButton.
  const servicesByDbName = Object.fromEntries(
    (allServices || []).map((s) => [s.name as string, s as { id: string; name: string; price: number; currency: string }]),
  );

  // ─── Admin-assigned service recommendations (Steve 5/4 #2) ─────
  // /admin/reassign writes to service_recommendations, but the client
  // page never read it back, so reassigned services stayed invisible.
  const { data: assignedRecs } = await supabase
    .from("service_recommendations")
    .select("id, service_id, reason, is_purchased, services:service_id(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  const adminAssignedServices = (assignedRecs || []).map((r) => {
    const svc = r.services as unknown as Record<string, unknown> | null;
    return svc ? { ...svc, _recommendation_reason: r.reason, _recommendation_id: r.id } : null;
  }).filter(Boolean) as (Record<string, unknown> & { _recommendation_reason: string | null })[];

  // ─── Founders plan counter (admin-editable from /admin/pricing) ─────
  const { data: foundersConfig } = await supabase
    .from("app_config")
    .select("key, value")
    .eq("category", "founders_plan");
  const cfg = Object.fromEntries(
    (foundersConfig || []).map((r: { key: string; value: string }) => [r.key, r.value]),
  );
  const foundersTaken = Number(cfg.taken ?? "0");
  const foundersLimit = Number(cfg.limit ?? "20");

  // ─── Plan tier overrides (admin-editable from /admin/plans) ─────
  // Steve 4/28 round 2: when admin edits the per-tier checklist in
  // /admin/plans, the values are stored as app_config rows with
  // category="plan_features:<key>". If a row exists, it should
  // override the hardcoded OWNER_TIERS defaults shown to the client.
  // Steve 4/29: also pull plan_timing:<key> so admin can edit the
  // "tiempo objetivo" string (e.g. "~16 days avg.") that is spliced
  // into the first feature bullet.
  const { data: planConfigRows } = await supabase
    .from("app_config")
    .select("category, key, value")
    .or("category.like.plan_features:%,category.like.plan_timing:%");
  const planOverrides: Record<
    string,
    { tagline?: string; features?: string[]; timeToTenant?: string }
  > = {};
  for (const row of planConfigRows || []) {
    const cat = row.category as string;
    if (cat.startsWith("plan_features:")) {
      const key = cat.replace("plan_features:", "");
      if (!planOverrides[key]) planOverrides[key] = {};
      if (row.key === "tagline") planOverrides[key].tagline = row.value as string;
      if (row.key === "features") {
        planOverrides[key].features = (row.value as string)
          .split("\n")
          .map((f) => f.trim())
          .filter(Boolean);
      }
    } else if (cat.startsWith("plan_timing:")) {
      const key = cat.replace("plan_timing:", "");
      if (!planOverrides[key]) planOverrides[key] = {};
      if (row.key === "time_to_tenant") {
        planOverrides[key].timeToTenant = row.value as string;
      }
    }
  }
  const tierToPlanKey: Record<string, string> = {
    basic: "owner_basic",
    preferred_owners: "owner_preferred",
    elite: "owner_elite",
  };

  // Splice the admin-editable timing string into the marketing-campaign
  // feature line so changing it in /admin/plans (Tiempo objetivo) is
  // reflected on the user's services view.
  function applyTimingToFeatures(features: string[], timing: string | undefined): string[] {
    if (!timing) return features;
    return features.map((f) => f.replace(/\(~[^)]+\)/, `(${timing})`));
  }

  // Steve 5/4 #3: plan-level services (Founder, Owner Preferred tiers)
  // are paid as a percentage of first month's rent, not a fixed amount.
  // Their price column is 0 in the DB; the UI was rendering "$0 CAD"
  // which confused everyone. Show the correct percentage label instead.
  function formatServicePrice(svc: { price?: number | null; currency?: string | null; category?: string | null; name?: string | null }): string {
    const price = Number(svc.price ?? 0);
    const currency = svc.currency || "CAD";
    if (svc.category === "plan" && price === 0) {
      const name = (svc.name || "").toLowerCase();
      if (name.includes("founder")) return "30% of first month's rent (one-time, lifetime rate)";
      if (name.includes("preferred") && name.includes("support")) return "30% / 28% of first month's rent (one-time)";
      if (name.includes("preferred") && name.includes("premier")) return "30% / 28% with flexible installments";
      return "% of first month's rent (one-time)";
    }
    return `$${price.toLocaleString()} ${currency}`;
  }

  // Filter services relevant to user role
  // Steve 4/28: services have tier-specific checklists. Pick the right one for
  // the viewing user (owners see basic/preferred/elite, tenants & pymes default
  // to the generic features). Falls back to features[] when the tier list is empty.
  const userTierKey: "features_basic" | "features_preferred" | "features_elite" | null = (() => {
    if (ownerTier === "elite") return "features_elite";
    if (ownerTier === "preferred_owners") return "features_preferred";
    if (ownerTier === "basic") return "features_basic";
    return null;
  })();

  function pickFeatures(service: { features?: string[] | null; features_basic?: string[] | null; features_preferred?: string[] | null; features_elite?: string[] | null }): string[] {
    if (userTierKey) {
      const tierList = service[userTierKey];
      if (tierList && tierList.length > 0) return tierList;
    }
    return service.features || [];
  }

  const relevantServices = allServices?.filter((s) => {
    if (!s.target_roles || s.target_roles.length === 0) return true;
    return s.target_roles.includes(profile.role);
  });

  const otherServices = allServices?.filter((s) => {
    if (!s.target_roles || s.target_roles.length === 0) return false;
    return !s.target_roles.includes(profile.role);
  });

  // ─── Owner tier details ────────────────────────
  const baseTier = ownerTier ? OWNER_TIERS[ownerTier] : null;
  const tierDetails = baseTier
    ? (() => {
        const planKey = tierToPlanKey[ownerTier as string];
        const override = planKey ? planOverrides[planKey] : undefined;
        const featuresBase =
          override?.features && override.features.length > 0
            ? override.features
            : baseTier.features;

        // Steve 5/15: client noticed the Founders Package and Low
        // Price entries were missing from /admin/plans. After adding
        // them as `owner_founders` and `owner_low_price` keys, also
        // override the basic tier's plan cards here so admin edits
        // to those bullets surface on /dashboard/services. The two
        // cards are at hardcoded indices in OWNER_TIERS.basic.plans
        // (0 = Low Price, 1 = Founders Package) — preserve that order.
        const planCardKeys: Record<number, string> = ownerTier === "basic"
          ? { 0: "owner_low_price", 1: "owner_founders" }
          : {};
        const overriddenPlans = baseTier.plans.map((plan, idx) => {
          const cardKey = planCardKeys[idx];
          if (!cardKey) return plan;
          const cardOverride = planOverrides[cardKey];
          if (!cardOverride) return plan;
          return {
            ...plan,
            // tagline -> pricing line at top of the card
            pricing: cardOverride.tagline ?? plan.pricing,
            // features list -> bullet details under the pricing
            details:
              cardOverride.features && cardOverride.features.length > 0
                ? cardOverride.features
                : plan.details,
          };
        });

        return {
          ...baseTier,
          tagline: override?.tagline ?? baseTier.tagline,
          features: applyTimingToFeatures(featuresBase, override?.timeToTenant),
          plans: overriddenPlans,
        };
      })()
    : null;

  // ─── PYMES plan details ────────────────────────
  const basePymesDetails = pymesPlan ? PYMES_PLANS[pymesPlan] : null;
  const pymesPlanDetails = basePymesDetails
    ? (() => {
        const override = planOverrides[`pymes_${pymesPlan}`];
        if (!override) return basePymesDetails;
        return {
          ...basePymesDetails,
          tagline: override.tagline ?? basePymesDetails.tagline,
          features:
            override.features && override.features.length > 0
              ? override.features
              : basePymesDetails.features,
        };
      })()
    : null;

  // Determine the user's primary city for promotion zone targeting.
  // Steve 4/30 #12: zones in /admin/pricing → Promotions used to be ignored
  // because we always passed null. Owners have a city via their property,
  // tenants have one in their preferences, pymes leave it null.
  let userCity: string | null = null;
  if (isOwnerRole && ownerProperties.length > 0) {
    userCity = ownerProperties[0].city || null;
  } else if (isTenantRole) {
    const { data: pref } = await supabase
      .from("tenant_preferences")
      .select("preferred_zones")
      .eq("user_id", user.id)
      .maybeSingle();
    if (pref?.preferred_zones && Array.isArray(pref.preferred_zones) && pref.preferred_zones.length > 0) {
      userCity = pref.preferred_zones[0];
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">Services</h1>
        <p className="text-muted-foreground">
          Services recommended for your profile
        </p>
      </div>

      <ActivePromotionsBanner userRole={profile.role} userCity={userCity} />

      {/* ═══ Owner: Service Tier Card ═══ */}
      {isOwnerRole && tierDetails && (
        <div className="space-y-4">
          <Card className={`${tierDetails.borderColor} ${tierDetails.bgColor}`}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Crown className={`h-5 w-5 ${tierDetails.color}`} />
                <CardTitle className="text-lg">
                  Your Service: {tierDetails.name}
                </CardTitle>
              </div>
              <CardDescription>{tierDetails.tagline}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Badge
                  className={`${tierDetails.bgColor} ${tierDetails.color} border ${tierDetails.borderColor} text-sm px-3 py-1`}
                >
                  {tierDetails.name}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  Based on {propertyCount}{" "}
                  {propertyCount === 1 ? "property" : "properties"}
                </span>
                {totalCFP > 0 && (
                  <span className="text-sm text-muted-foreground">
                    &middot; Total CFP: ${totalCFP.toFixed(2)} CAD/mo
                  </span>
                )}
              </div>

              {/* Recommendations (Steve #13: only photos + optimization) */}
              <div>
                <p className="text-sm font-medium mb-2">Recommendations</p>
                <ul className="space-y-1.5">
                  <li className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${tierDetails.color}`} />
                    Professional photography for your listing
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${tierDetails.color}`} />
                    Listing optimization checklist
                  </li>
                </ul>
              </div>

              {/* Steve 4/21 #17: What's included in this service (full features list) */}
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-base font-semibold mb-3">
                  What&apos;s included in your {tierDetails.name} service
                </p>
                <ul className="space-y-2">
                  {tierDetails.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${tierDetails.color}`} />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="text-xs text-muted-foreground">
                  See the full plan pricing and payment options in the &quot;Available Plans&quot; section below.
                </p>
              </div>

              {/* Elite: Per-property Portfolio + CFP/Payback */}
              {ownerTier === "elite" && ownerProperties.length > 0 && (
                <div className="mt-4 space-y-3">
                  <p className="text-sm font-medium">Property Portfolio Breakdown</p>
                  {ownerProperties.map((prop) => {
                    const rent = Number(prop.monthly_rent) || 0;
                    const cfpMonthly = Number(prop.cfp_monthly) || rent * 0.1;
                    const cfpAnnual = cfpMonthly * 12;
                    const cfp5yr = cfpAnnual * 5;
                    const payback = prop.payback_months ? Number(prop.payback_months) : null;
                    const portfolio = prop.elite_tier
                      ? ELITE_SUB_TIERS[prop.elite_tier]
                      : null;

                    return (
                      <div key={prop.id} className="rounded-lg border bg-card p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <p className="text-sm font-medium">
                              {prop.property_type} — {prop.city}
                            </p>
                            <p className="text-xs text-muted-foreground">{prop.address}</p>
                          </div>
                          {portfolio && (
                            <Badge className="bg-amber-50 text-amber-600 border border-amber-200">
                              {portfolio.name}
                            </Badge>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <div>
                            <p className="text-xs text-muted-foreground">Rent</p>
                            <p className="text-sm font-semibold">
                              ${rent.toLocaleString()} CAD/mo
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">CFP Monthly</p>
                            <p className="text-sm font-semibold text-emerald-600">
                              ${cfpMonthly.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">CFP Annual</p>
                            <p className="text-sm font-semibold text-emerald-600">
                              ${cfpAnnual.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">CFP 5 Years</p>
                            <p className="text-sm font-semibold text-emerald-600">
                              ${cfp5yr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                          </div>
                        </div>
                        {payback != null && (
                          <div className="mt-2 flex items-center gap-2 rounded-md bg-primary/5 px-3 py-1.5">
                            <Zap className="h-4 w-4 text-primary" />
                            <p className="text-sm">
                              <span className="font-medium">Payback:</span>{" "}
                              {payback.toFixed(1)} months
                            </p>
                          </div>
                        )}

                        {/* Steve #8 (4/20) + #11 (4/21): Portfolio pricing — larger readable text */}
                        {portfolio && (
                          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-4 space-y-3">
                            <p className="text-base font-semibold text-amber-800">
                              {portfolio.name} Portfolio Pricing
                            </p>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <p className="text-sm text-muted-foreground">One-time fee</p>
                                <p className="text-lg font-bold">${portfolio.oneTimeFee.toLocaleString()} CAD</p>
                                <p className="text-sm text-muted-foreground">per unit</p>
                              </div>
                              <div>
                                <p className="text-sm text-muted-foreground">Monthly fee</p>
                                <p className="text-lg font-bold">${portfolio.monthlyFee} CAD/mo</p>
                                <p className="text-sm text-muted-foreground">
                                  shared across all {portfolio.name} properties
                                </p>
                              </div>
                            </div>
                            <p className="text-sm text-amber-700 pt-2 border-t border-amber-200">
                              {portfolio.feeDescription}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              To acquire: contact the commercial team to finalize the portfolio assignment and payment method (e-Transfer, credit card, or bank transfer).
                            </p>
                            {/* Steve 4/22 #8: CTA to acquire portfolio */}
                            <Link
                              href="/dashboard/services#contact"
                              className={cn(buttonVariants(), "w-full gap-2 mt-2 bg-amber-600 hover:bg-amber-700")}
                            >
                              Acquire {portfolio.name} Portfolio
                              <ArrowRight className="h-4 w-4" />
                            </Link>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3">
                    <p className="text-sm font-medium text-emerald-700">
                      Total Portfolio CFP: ${totalCFP.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CAD/mo
                      &middot; ${(totalCFP * 12).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CAD/yr
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ═══ Owner: Available Plans ═══ */}
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Star className="h-5 w-5 text-primary" />
            Available Plans
          </h2>

          {/* Founders plan urgency counter — value editable via
              /admin/pricing (Founders Plan section). Steve 5/8: was
              gated on ownerTier === "basic" so single-property test
              owners with no completed tier (and the no-tier branch
              below) never saw the saved counter, making it look like
              the admin save did nothing. Now renders for any basic
              tier — including the no-tier branch via FoundersBanner
              below. Multi-property tiers (preferred/elite) still skip
              it because the Founders package only applies to single
              property owners. */}
          {ownerTier === "basic" && foundersLimit > 0 && (
            <FoundersBanner taken={foundersTaken} limit={foundersLimit} />
          )}

          <div className={`grid gap-4 ${tierDetails.plans.length > 1 ? "md:grid-cols-2" : ""}`}>
            {tierDetails.plans.map((plan, i) => {
              // Steve 5/22 Milestone 4: wire the static plan card to a
              // real services row so the CTA triggers Stripe checkout
              // instead of scrolling to a non-existent #contact anchor.
              const dbName = PLAN_NAME_TO_DB_SERVICE[plan.name];
              const svc = dbName ? servicesByDbName[dbName] : undefined;
              const upfrontPrice = svc ? Number(svc.price) || 0 : 0;
              return (
                <Card key={i} className="flex flex-col">
                  <CardHeader>
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                    <CardDescription className={`text-base font-semibold ${tierDetails.color}`}>
                      {plan.pricing}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-3">
                    <ul className="space-y-1.5">
                      {plan.details.map((detail, j) => (
                        <li key={j} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                          {detail}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <div className="p-6 pt-0">
                    {svc && upfrontPrice > 0 ? (
                      <CheckoutButton
                        type="service"
                        serviceId={svc.id}
                        label={`${plan.cta} — Pay $${upfrontPrice} ${svc.currency || "CAD"} upfront`}
                      />
                    ) : (
                      <Link
                        href="/dashboard/services#contact"
                        className={cn(buttonVariants(), "w-full gap-2")}
                      >
                        {plan.cta}
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ Owner: No tier yet ═══ */}
      {isOwnerRole && !tierDetails && (
        <div className="space-y-4">
          {/* Steve 5/8: pre-tier owners need to see the Founders
              counter too — without this the counter appeared "stuck at
              0" during admin tests because the no-tier owner card had
              no banner at all. */}
          {foundersLimit > 0 && (
            <FoundersBanner taken={foundersTaken} limit={foundersLimit} />
          )}
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center py-8 text-center">
              <Crown className="mb-3 h-8 w-8 text-muted-foreground" />
              <p className="font-medium">No service tier assigned yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Complete your Discovery Brief to get your service tier.
              </p>
              <Link
                href="/forms/propietario"
                className={buttonVariants({ className: "mt-4" })}
              >
                Complete Discovery Brief
              </Link>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══ PYMES: Recommended Plan ═══ */}
      {isPymesRole && pymesPlanDetails && (
        <Card
          className={`${pymesPlanDetails.borderColor} ${pymesPlanDetails.bgColor}`}
        >
          <CardHeader>
            <div className="flex items-center gap-2">
              <Zap className={`h-5 w-5 ${pymesPlanDetails.color}`} />
              <CardTitle className="text-lg">
                Your Recommended Plan: {pymesPlanDetails.name}
              </CardTitle>
            </div>
            <CardDescription>{pymesPlanDetails.tagline}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <span
                className={`text-3xl font-bold ${pymesPlanDetails.color}`}
              >
                {pymesPlanDetails.price}
              </span>
              <p className="text-sm text-muted-foreground">
                {pymesPlanDetails.duration}
              </p>
              <div className="rounded-md border bg-card p-3 space-y-1.5">
                <p className="text-xs font-medium">Payment Options:</p>
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant="outline" className="text-xs shrink-0">Option 1</Badge>
                  <span className="text-muted-foreground">{pymesPlanDetails.upfront}, then {pymesPlanDetails.installment}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant="outline" className="text-xs shrink-0">Option 2</Badge>
                  <span className="text-muted-foreground">Full payment upfront (100%)</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Accepted: e-Transfer, credit card, or bank transfer
                </p>
              </div>
            </div>
            <ul className="space-y-1.5">
              {pymesPlanDetails.features.map((feature, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <CheckCircle2
                    className={`mt-0.5 h-4 w-4 shrink-0 ${pymesPlanDetails.color}`}
                  />
                  {feature}
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-2 sm:flex-row">
              {pymesPlanRecord ? (
                <CheckoutButton
                  type="pymes_upfront"
                  pymesPlanId={pymesPlanRecord.id}
                  label={`Pay ${pymesPlanDetails.upfront}`}
                  className="flex-1"
                />
              ) : (
                <Link
                  href="/dashboard/services#contact"
                  className={cn(buttonVariants(), "flex-1 gap-2")}
                >
                  Start Now
                  <ArrowRight className="h-4 w-4" />
                </Link>
              )}
              <Link
                href="/dashboard/services#contact"
                className={cn(buttonVariants({ variant: "outline" }), "flex-1 gap-2")}
              >
                Schedule a Consultation
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══ PYMES: No plan ═══ */}
      {isPymesRole && !pymesPlanDetails && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-8 text-center">
            <Zap className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No plan assigned yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Take the Sales Leak Diagnosis to get your recommended plan.
            </p>
            <Link
              href="/forms/pymes"
              className={buttonVariants({ className: "mt-4" })}
            >
              Start Diagnosis
            </Link>
          </CardContent>
        </Card>
      )}

      {/* ═══ Tenant: Premium Status ═══ */}
      {isTenantRole && (
        <Card
          className={
            profile.is_premium_tenant
              ? "border-amber-200 bg-amber-50"
              : "border-blue-200 bg-blue-50"
          }
        >
          <CardHeader>
            <div className="flex items-center gap-2">
              <Crown
                className={`h-5 w-5 ${
                  profile.is_premium_tenant
                    ? "text-amber-600"
                    : "text-blue-600"
                }`}
              />
              <CardTitle className="text-lg">
                {profile.is_premium_tenant
                  ? "Premium Tenant Services"
                  : "Standard Tenant Services"}
              </CardTitle>
            </div>
            <CardDescription>
              {profile.is_premium_tenant
                ? "You qualify for priority matching and premium property access"
                : "Update your preferences to unlock Premium Tenant benefits (3+ of 8 criteria required)"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Badge
                className={
                  profile.is_premium_tenant
                    ? "bg-amber-50 text-amber-600 border border-amber-200"
                    : "bg-blue-50 text-blue-600 border border-blue-200"
                }
              >
                {profile.is_premium_tenant
                  ? "Premium Tenant"
                  : "Standard Tenant"}
              </Badge>
              {profile.premium_criteria_met != null && (
                <span className="text-sm text-muted-foreground">
                  {profile.premium_criteria_met} of 8 criteria met
                </span>
              )}
            </div>
            {profile.is_premium_tenant && (
              <ul className="mt-3 space-y-1.5">
                <li className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-amber-500" />
                  Premium property matching
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-amber-500" />
                  Concierge service
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-amber-500" />
                  Priority viewing schedules
                </li>
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══ Tenant: Matched Properties (Steve #2: full info, all photos, Apply for Free) ═══ */}
      {isTenantRole && matchedProperties.length > 0 && (
        <div id="matched-properties" className="scroll-mt-20 space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Properties Matched to Your Preferences
          </h2>
          <p className="text-sm text-muted-foreground">
            Based on your profile, we found {matchedProperties.length}{" "}
            {matchedProperties.length === 1 ? "property" : "properties"} that
            match your preferences.
          </p>
          <div className="space-y-6">
            {matchedProperties.map((prop) => (
              <MatchedPropertyCard
                key={prop.id}
                property={prop}
                images={matchedImages[prop.id] || []}
              />
            ))}
          </div>
        </div>
      )}

      {isTenantRole && matchedProperties.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-8 text-center">
            <Building2 className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No matching properties yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Update your preferences so we can find the best properties for you.
            </p>
            <Link
              href="/forms/inquilino"
              className={buttonVariants({ className: "mt-4" })}
            >
              Update Preferences
            </Link>
          </CardContent>
        </Card>
      )}

      {/* ═══ Admin-assigned recommendations (Steve 5/4 #2) ═══ */}
      {adminAssignedServices.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Star className="h-5 w-5 text-amber-600" />
            Specially Assigned for You
          </h2>
          <p className="text-sm text-muted-foreground">
            Our team picked these services for your profile.
          </p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {adminAssignedServices.map((service) => {
              const isPlanLevel = service.category === "plan";
              const priceLabel = formatServicePrice(service as Parameters<typeof formatServicePrice>[0]);
              const numericPrice = Number(service.price ?? 0);
              return (
                <Card
                  key={service._recommendation_id as string}
                  className="flex flex-col border-amber-300 bg-amber-50/30"
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-lg">
                        {service.name as string}
                      </CardTitle>
                      <Badge className="bg-amber-100 text-amber-800 border border-amber-300 capitalize">
                        {isPlanLevel ? "Plan" : (service.category as string)}
                      </Badge>
                    </div>
                    <CardDescription>{service.description as string}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-2">
                    {service._recommendation_reason && (
                      <p className="text-xs italic text-amber-900 bg-amber-100/60 rounded p-2">
                        {service._recommendation_reason}
                      </p>
                    )}
                    <span className="text-base font-semibold">{priceLabel}</span>
                  </CardContent>
                  {/* Steve 5/5 sub-issue: assigned service had no purchase
                      button. Plan-level services (price=0, % of rent) route
                      to the contact section because they need commercial
                      finalization; fixed-price services use the existing
                      Stripe checkout. */}
                  <div className="p-6 pt-0">
                    {isPlanLevel || numericPrice === 0 ? (
                      <Link
                        href="/dashboard/services#contact"
                        className={cn(
                          buttonVariants({ size: "sm" }),
                          "w-full gap-2 bg-amber-600 hover:bg-amber-700",
                        )}
                      >
                        Acquire this plan
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    ) : (
                      <CheckoutButton
                        type="service"
                        serviceId={service.id as string}
                        label={`Purchase — ${priceLabel}`}
                        className="w-full"
                      />
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ Recommended Services (filtered by role, hidden for owners per Steve #13) ═══ */}
      {!isOwnerRole && relevantServices && relevantServices.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Star className="h-5 w-5 text-primary" />
            Recommended for You
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {relevantServices.map((service) => (
              <Card key={service.id} className="flex flex-col">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg">{service.name}</CardTitle>
                    <Badge variant="outline" className="capitalize">
                      {service.category}
                    </Badge>
                  </div>
                  <CardDescription>{service.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  {(() => {
                    const feats = pickFeatures(service);
                    return feats.length > 0 ? (
                      <ul className="mb-3 space-y-1 text-sm text-muted-foreground">
                        {feats.map((feature: string, i: number) => (
                          <li key={i} className="flex items-center gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                            {feature}
                          </li>
                        ))}
                      </ul>
                    ) : null;
                  })()}
                  <span className="text-lg font-bold">
                    {formatServicePrice(service)}
                  </span>
                </CardContent>
                {service.price > 0 && (
                  <div className="p-6 pt-0">
                    <CheckoutButton
                      type="service"
                      serviceId={service.id}
                      label={`Purchase — $${service.price?.toLocaleString()} ${service.currency || "CAD"}`}
                      className="w-full"
                    />
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ═══ Other Services ═══ */}
      {otherServices && otherServices.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Other Available Services</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {otherServices.map((service) => (
              <Card key={service.id} className="opacity-75">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg">{service.name}</CardTitle>
                    <Badge variant="outline" className="capitalize">
                      {service.category}
                    </Badge>
                  </div>
                  <CardDescription>{service.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const feats = pickFeatures(service);
                    return feats.length > 0 ? (
                      <ul className="mb-3 space-y-1 text-sm text-muted-foreground">
                        {feats.slice(0, 3).map((feature: string, i: number) => (
                          <li key={i} className="flex items-center gap-1.5">
                            <span className="text-primary">&#8226;</span>{" "}
                            {feature}
                          </li>
                        ))}
                        {feats.length > 3 && (
                          <li className="text-xs text-muted-foreground">
                            +{feats.length - 3} more features
                          </li>
                        )}
                      </ul>
                    ) : null;
                  })()}
                  <span className="text-lg font-bold">
                    {formatServicePrice(service)}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* No services at all */}
      {(!allServices || allServices.length === 0) && !tierDetails && !pymesPlanDetails && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No services available at this time.
          </CardContent>
        </Card>
      )}

      {/* ═══ Contact / Schedule Section ═══ */}
      <div id="contact" id-scroll-margin-top="80" className="scroll-mt-20">
        <Card className="border-primary/20">
          <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
            <h2 className="text-xl font-bold">Ready to Get Started?</h2>
            <p className="max-w-lg text-sm text-muted-foreground">
              Our team will contact you to review your profile, answer questions,
              and finalize the best plan for your needs. No obligation.
            </p>
            <Link
              href="/#contact"
              className={cn(buttonVariants({ size: "lg" }), "gap-2")}
            >
              Schedule a Free Consultation
              <ArrowRight className="h-4 w-4" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
