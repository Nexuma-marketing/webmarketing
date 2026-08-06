import type {
  UserRole,
  PropertyServiceTier,
  EliteTier,
} from "@/types/database";
import { createClient } from "@/lib/supabase/server";

// ═══════════════════════════════════════════════════════
// Owner / Investor Classification
// ═══════════════════════════════════════════════════════

export function classifyOwner(propertyCount: number): {
  role: UserRole;
  serviceTier: PropertyServiceTier;
} {
  if (propertyCount >= 4) {
    return { role: "inversionista", serviceTier: "elite" };
  } else if (propertyCount >= 2) {
    return { role: "propietario_preferido", serviceTier: "preferred_owners" };
  }
  return { role: "propietario", serviceTier: "basic" };
}

export function classifyEliteTier(avgMonthlyRent: number): EliteTier {
  if (avgMonthlyRent >= 7001) return "lujo";
  if (avgMonthlyRent >= 4000) return "signature";
  return "essentials"; // $2,500 – $3,999
}

// CFP = Monthly Rent × 10%
export function calculateCFP(monthlyRent: number): number {
  return monthlyRent * 0.1;
}

// Payback = Plan Fee / CFP per month
export function calculatePayback(
  planFee: number,
  cfpMonthly: number
): number {
  if (cfpMonthly <= 0) return Infinity;
  return planFee / cfpMonthly;
}

// ═══════════════════════════════════════════════════════
// Tenant Premium Classification (8 criteria)
// ═══════════════════════════════════════════════════════

export interface TenantCriteriaInput {
  employment_type: string | null;
  employment_verifiable: boolean;
  max_budget: number | null;
  preferred_amenities: string[];
  prefers_urban_zone: boolean;
  bedrooms_needed: number | null;
  smart_home_interest: boolean;
  style_preference: string | null;
  furnished: boolean;
  contract_duration: string | null;
}

type RuleMap = Record<string, { weight: number; is_active: boolean }>;

export function countPremiumCriteria(
  data: TenantCriteriaInput,
  rules?: RuleMap,
): number {
  let count = 0;
  const w = (key: string, fallback: number) => {
    const r = rules?.[key];
    if (!r) return fallback;
    if (!r.is_active) return 0;
    return r.weight;
  };

  // 1. Stable employment
  if (data.employment_type === "full_time" || data.employment_type === "self_employed") {
    count += w("tenant_premium.stable_employment", 1);
  }

  // 2. Budget >= $2,500 CAD/month
  if (data.max_budget != null && data.max_budget >= 2500) {
    count += w("tenant_premium.budget_2500", 1);
  }

  // 3. Seeks premium amenities
  const premiumAmenities = [
    "Gym",
    "Pool",
    "Rooftop",
    "Coworking",
    "Jacuzzi",
    "Private parking",
    "Sauna",
  ];
  if (data.preferred_amenities.some((a) => premiumAmenities.includes(a))) {
    count += w("tenant_premium.premium_amenities", 1);
  }

  // 4. Preferred urban zones
  if (data.prefers_urban_zone) count += w("tenant_premium.urban_zone", 1);

  // 5. Needs 2-4 bedrooms
  if (
    data.bedrooms_needed != null &&
    data.bedrooms_needed >= 2 &&
    data.bedrooms_needed <= 4
  ) {
    count += w("tenant_premium.bedrooms_2_4", 1);
  }

  // 6. Interested in smart home features
  if (data.smart_home_interest) count += w("tenant_premium.smart_home", 1);

  // 7. Modern/contemporary style preference
  if (data.style_preference === "modern" || data.style_preference === "elegant") {
    count += w("tenant_premium.modern_style", 1);
  }

  // 8. Contract duration 12-24 months
  if (
    data.contract_duration === "12_months" ||
    data.contract_duration === "12_24_months" ||
    data.contract_duration === "24_months"
  ) {
    count += w("tenant_premium.long_contract", 1);
  }

  return count;
}

export function isPremiumTenant(criteriaCount: number, threshold = 3): boolean {
  return criteriaCount >= threshold;
}

// ═══════════════════════════════════════════════════════
// Portfolio Fees (used for Payback calculation)
// ═══════════════════════════════════════════════════════

// Steve 4/19+4/22: Monthly optimization fee per portfolio (NOT one-time).
// Payback = monthly_fee / CFP_monthly (per Steve spec):
//   Essentials: $100/mo shared fee  → PB = 100/CFP
//   Signature:  $100/mo shared fee  → PB = 100/CFP
//   Lujo:       $300/mo shared fee  → PB = 300/CFP
// (One-time fees $900/$1410/$1650 per unit are separate, stored in Services page constants)
export const PORTFOLIO_FEES: Record<EliteTier, number> = {
  essentials: 100,
  signature: 100,
  lujo: 300,
};

// ═══════════════════════════════════════════════════════
// Full Profiling Runners (server-side)
// ═══════════════════════════════════════════════════════

/**
 * Run owner profiling: classify role, tier, elite sub-tier, CFP, payback.
 * Updates profiles + all properties for the given user.
 * Each property gets its own elite_tier based on its individual rent.
 */
export async function profileOwner(userId: string) {
  const supabase = await createClient();

  // 1. Count properties
  const { data: properties } = await supabase
    .from("properties")
    .select("id, monthly_rent")
    .eq("owner_id", userId);

  const propertyCount = properties?.length ?? 0;
  if (propertyCount === 0) return null;

  // 1b. Get current user profile to respect their initial user_type selection (Steve 4/19)
  // A user who signed up as "Property Owner" should NOT be auto-promoted to Investor
  // just because they added 4+ properties.
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  const currentRole = existingProfile?.role;
  const isCurrentlyInvestor = currentRole === "inversionista";
  const isCurrentlyOwner = currentRole === "propietario" || currentRole === "propietario_preferido";

  // 2. Classify role + tier — RESPECT USER'S INITIAL SELECTION (Steve 4/20)
  //    - Investor stays as investor + elite (regardless of count)
  //    - Owner stays as owner (basic/preferred_owners based on count, but NEVER promoted to investor)
  //    - New users (no role set): count-based classification
  let role: UserRole;
  let serviceTier: PropertyServiceTier;

  if (isCurrentlyInvestor) {
    role = "inversionista";
    serviceTier = "elite";
  } else if (isCurrentlyOwner) {
    // Owner stays owner — only adjust between basic and preferred_owners
    // Never promote to investor regardless of property count (Steve 4/20)
    if (propertyCount >= 2) {
      role = "propietario_preferido";
      serviceTier = "preferred_owners";
    } else {
      role = "propietario";
      serviceTier = "basic";
    }
  } else {
    // New user with no role yet — use count-based classification
    const classified = classifyOwner(propertyCount);
    role = classified.role;
    serviceTier = classified.serviceTier;
  }

  // 3. Update each property: service_tier, elite_tier (per property), cfp, payback
  if (properties) {
    for (const prop of properties) {
      const rent = Number(prop.monthly_rent) || 0;
      const cfp = calculateCFP(rent);

      // Each property gets its own elite_tier based on its own rent
      let propEliteTier: EliteTier | null = null;
      let paybackMonths: number | null = null;

      if (serviceTier === "elite" && rent > 0) {
        propEliteTier = classifyEliteTier(rent);
        const fee = PORTFOLIO_FEES[propEliteTier];
        paybackMonths = calculatePayback(fee, cfp);
      }

      await supabase
        .from("properties")
        .update({
          service_tier: serviceTier,
          elite_tier: propEliteTier,
          cfp_monthly: cfp,
          payback_months: paybackMonths,
        })
        .eq("id", prop.id);
    }
  }

  // 4. Update profile: role, property_count
  await supabase
    .from("profiles")
    .update({
      role,
      property_count: propertyCount,
    })
    .eq("id", userId);

  return {
    role,
    serviceTier,
    propertyCount,
  };
}

/**
 * Run tenant profiling: count premium criteria, update preferences + profile.
 *
 * Steve 4/28: respects manual admin overrides — if profiles.role_locked is true
 * the role assignment is skipped (admin's choice in /admin/users wins).
 */
export async function profileTenant(userId: string) {
  const supabase = await createClient();

  // 1. Get latest tenant preferences
  const { data: prefs } = await supabase
    .from("tenant_preferences")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!prefs) return null;

  // Pull live weights/threshold from matching_rules so admin edits in /admin/matching apply
  const { data: ruleRows } = await supabase
    .from("matching_rules")
    .select("rule_key, weight, is_active")
    .like("rule_key", "tenant_premium.%");
  const rules: RuleMap = {};
  for (const r of ruleRows || []) {
    rules[r.rule_key] = { weight: Number(r.weight), is_active: r.is_active };
  }
  const threshold = rules["tenant_premium.threshold"]?.weight ?? 3;

  // 2. Count premium criteria
  const criteriaCount = countPremiumCriteria({
    employment_type: prefs.employment_type,
    employment_verifiable: prefs.employment_verifiable,
    max_budget: prefs.max_budget ? Number(prefs.max_budget) : null,
    preferred_amenities: prefs.preferred_amenities || [],
    prefers_urban_zone: prefs.prefers_urban_zone,
    bedrooms_needed: prefs.bedrooms_needed ? Number(prefs.bedrooms_needed) : null,
    smart_home_interest: prefs.smart_home_interest,
    style_preference: prefs.style_preference,
    furnished: prefs.furnished ?? false,
    contract_duration: prefs.contract_duration,
  }, rules);

  const premium = isPremiumTenant(criteriaCount, threshold);

  // 3. Update tenant_preferences
  await supabase
    .from("tenant_preferences")
    .update({
      premium_criteria_count: criteriaCount,
      is_premium: premium,
    })
    .eq("id", prefs.id);

  // 4. Sync to profiles. Steve 4/28: do NOT overwrite role if admin locked it.
  // Steve 4/28 (second pass): a user who signed up as a regular "inquilino"
  // must STAY "inquilino" — premium criteria flip is_premium_tenant=true but
  // the role itself only changes when (a) the user has no role yet, or
  // (b) the user signed up as inquilino_premium directly. This mirrors the
  // owner pattern (a propietario never auto-promotes to inversionista).
  const { data: existing } = await supabase
    .from("profiles")
    .select("role, role_locked")
    .eq("id", userId)
    .single();

  const currentRole = existing?.role as UserRole | undefined;
  const isCurrentTenant =
    currentRole === "inquilino" || currentRole === "inquilino_premium";

  const fallbackRole: UserRole = premium ? "inquilino_premium" : "inquilino";
  let nextRole: UserRole;
  if (existing?.role_locked && currentRole) {
    nextRole = currentRole;
  } else if (isCurrentTenant && currentRole) {
    nextRole = currentRole;
  } else {
    nextRole = fallbackRole;
  }

  const updates: Record<string, unknown> = {
    is_premium_tenant: premium,
    premium_criteria_met: criteriaCount,
  };
  if (nextRole !== currentRole) {
    updates.role = nextRole;
  }
  await supabase.from("profiles").update(updates).eq("id", userId);

  return {
    criteriaCount,
    premium,
    role: nextRole,
    locked: !!existing?.role_locked,
  };
}

// ═══════════════════════════════════════════════════════
// Tenant ↔ Property Matching
// ═══════════════════════════════════════════════════════

/**
 * Match available properties for a tenant based on their preferences.
 * - Premium tenants → Elite properties within their budget
 * - Regular tenants → properties matching preferences (budget, bedrooms, amenities)
 */
export async function matchPropertiesForTenant(userId: string) {
  const supabase = await createClient();

  // 1. Get tenant preferences
  const { data: prefs } = await supabase
    .from("tenant_preferences")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!prefs) return [];

  const premium = prefs.is_premium ?? false;
  const maxBudget = prefs.max_budget ? Number(prefs.max_budget) : null;
  const rawMinBudget = prefs.min_budget ? Number(prefs.min_budget) : null;
  // Steve #2-1 (4/22): If tenant only set max_budget (not min_budget),
  // auto-apply min_budget = max_budget * 0.6 so we don't show properties
  // far below tenant's target range (e.g., $1,000 property for tenant with $3,000 budget)
  const minBudget = rawMinBudget ?? (maxBudget ? Math.floor(maxBudget * 0.6) : null);
  const bedrooms = prefs.bedrooms_needed ? Number(prefs.bedrooms_needed) : null;
  const amenities: string[] = prefs.preferred_amenities || [];

  // 2. Build base query — only available properties
  // Steve #2-1 (4/19): Removed strict Elite-only filter for premium tenants.
  // Premium tenants now see all matching properties but get PRIORITY scoring
  // for Elite-tier properties (handled in scoring below).
  let query = supabase
    .from("properties")
    .select("*, profiles!properties_owner_id_fkey(full_name)")
    .eq("is_available", true);

  // Budget filter
  if (maxBudget) {
    query = query.lte("monthly_rent", maxBudget);
  }
  if (minBudget) {
    query = query.gte("monthly_rent", minBudget);
  }

  // Bedrooms filter (if specified)
  if (bedrooms && bedrooms > 0) {
    query = query.gte("bedrooms", bedrooms);
  }

  const { data: propertiesRaw } = await query
    .order("monthly_rent", { ascending: true })
    .limit(20);

  if (!propertiesRaw || propertiesRaw.length === 0) return [];

  // Steve #2-1 (4/20): Exclude properties that have no photos uploaded.
  // Matched properties without photos look broken from the tenant's perspective.
  const propIds = propertiesRaw.map((p) => p.id);
  const { data: photoCounts } = await supabase
    .from("property_images")
    .select("property_id")
    .in("property_id", propIds);

  const propIdsWithPhotos = new Set((photoCounts || []).map((p) => p.property_id));
  const properties = propertiesRaw.filter((p) => propIdsWithPhotos.has(p.id));

  if (properties.length === 0) return [];

  // 3. Score & rank properties by preference match
  const scored = properties.map((prop) => {
    let score = 0;

    // Amenity overlap
    const propAmenities: string[] = prop.amenities || [];
    const overlap = amenities.filter((a) => propAmenities.includes(a)).length;
    score += overlap * 2;

    // Exact bedroom match bonus
    if (bedrooms && prop.bedrooms === bedrooms) score += 3;

    // Budget fit (closer to budget = better)
    if (maxBudget && prop.monthly_rent) {
      const ratio = Number(prop.monthly_rent) / maxBudget;
      if (ratio >= 0.7 && ratio <= 1.0) score += 2;
    }

    // Premium tenants get +5 bonus for Elite properties (priority, not exclusivity)
    if (premium && prop.service_tier === "elite") score += 5;

    return { ...prop, matchScore: score };
  });

  // Sort by match score descending
  scored.sort((a, b) => b.matchScore - a.matchScore);

  return scored;
}
