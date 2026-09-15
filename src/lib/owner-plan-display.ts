type OwnerPropertyRent = { monthly_rent: number | null };

// Steve — the "Your Service Tier" pricing block (name, per-property
// breakdown, terms, purchase CTA) is shown on both Dashboard home and
// Recommended Services. This map lives here, shared, so both pages
// resolve the exact same primary plan per tier instead of drifting.
// Elite/investor has no single "Asset Management" purchase — pricing
// is per property (Essentials/Signature/Luxury), rendered via its own
// per-property breakdown instead of a generic plan card here.
export const OWNER_PRIMARY_PLAN: Record<
  string,
  { serviceName: string; name: string; pricing: string; cta: string }
> = {
  basic: {
    serviceName: "Plan: Low Price",
    name: "Low Price",
    pricing: "35% of first month's rent (one-time)",
    cta: "Choose & secure your money",
  },
  preferred_owners: {
    serviceName: "Plan: Owner Preferred — Support Tier",
    name: "Support Tier",
    pricing: "30% 1st property / 28% 2nd & 3rd (one-time each)",
    cta: "Get Support",
  },
};

function percentageForPlan(planName: string, propertyIndex: number): number | null {
  const name = planName.toLowerCase();
  if (name.includes("low price")) return 0.35;
  if (name.includes("founder")) return 0.3;
  if (name.includes("support") || name.includes("premier")) {
    if (propertyIndex > 2) return null;
    return propertyIndex === 0 ? 0.3 : 0.28;
  }
  return null;
}

export function formatOwnerPlanPrice(
  pricing: string,
  planName: string,
  properties: OwnerPropertyRent[],
): string {
  const calculatedPrices = properties.flatMap((property, index) => {
    const percentage = percentageForPlan(planName, index);
    const rent = Number(property.monthly_rent) || 0;
    if (percentage === null || rent <= 0) return [];
    const amount = (rent * percentage).toLocaleString("en-CA", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return [{ index, amount }];
  });

  const displayPricing = planName.toLowerCase().includes("premier")
    ? "30% 1st property / 28% 2nd & 3rd (same rates with flexible installment payments)"
    : pricing;

  if (calculatedPrices.length === 0) return displayPricing;
  if (calculatedPrices.length === 1) {
    return `${displayPricing} — you would pay approximately $${calculatedPrices[0].amount} CAD.`;
  }
  return `${displayPricing} — ${calculatedPrices
    .map(({ index, amount }) => `Property ${index + 1}: you would pay approximately $${amount} CAD`)
    .join("; ")}.`;
}
