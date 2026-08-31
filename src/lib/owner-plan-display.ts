type OwnerPropertyRent = { monthly_rent: number | null };

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
    return `${displayPricing} — approximately $${calculatedPrices[0].amount} CAD.`;
  }
  return `${displayPricing} — ${calculatedPrices
    .map(({ index, amount }) => `Property ${index + 1}: approximately $${amount} CAD`)
    .join("; ")}.`;
}
