// ═══════════════════════════════════════════════════════
// Shared constants used across dashboard & admin pages
// ═══════════════════════════════════════════════════════

export const ROLE_LABELS: Record<string, string> = {
  propietario: "Property Owner",
  propietario_preferido: "Preferred Owner",
  inversionista: "Investor",
  inquilino: "Tenant",
  inquilino_premium: "Premium Tenant",
  pymes: "Business Owner",
  admin: "Administrator",
};

export const OWNER_TIERS: Record<
  string,
  {
    name: string;
    tagline: string;
    features: string[];
    color: string;
    bgColor: string;
    borderColor: string;
    plans: {
      name: string;
      pricing: string;
      details: string[];
      cta: string;
    }[];
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
        pricing: "Portfolio-based pricing (Essentials / Signature / Luxury)",
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

export const PYMES_PLANS: Record<
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
    tagline:
      "Intensive intervention plan to exit critical mode and move to growth",
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
    tagline:
      "Plan to overcome stagnation, correct weaknesses and start growing",
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

export const LEAD_STATUS_LABELS: Record<string, string> = {
  nuevo: "New",
  contactado: "Contacted",
  en_proceso: "In Progress",
  cerrado: "Closed",
};

export const LEAD_STATUS_COLORS: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  nuevo: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
  },
  contactado: {
    bg: "bg-yellow-50",
    text: "text-yellow-700",
    border: "border-yellow-200",
  },
  en_proceso: {
    bg: "bg-orange-50",
    text: "text-orange-700",
    border: "border-orange-200",
  },
  cerrado: {
    bg: "bg-green-50",
    text: "text-green-700",
    border: "border-green-200",
  },
};

export const LEAD_STATUS_TRANSITIONS: Record<string, string[]> = {
  nuevo: ["contactado"],
  contactado: ["en_proceso", "cerrado"],
  en_proceso: ["cerrado"],
  cerrado: [],
};

export const SERVICE_TIERS: Record<string, string> = {
  basic: "Basic",
  preferred_owners: "Preferred Owners",
  elite: "Elite Assets & Legacy",
};

export const ELITE_TIERS: Record<string, string> = {
  essentials: "Essentials ($2,500–$3,999)",
  signature: "Signature ($4,000–$7,000)",
  lujo: "Luxury ($7,001+)",
};

export const IMAGE_STATUS_COLORS: Record<
  string,
  { bg: string; text: string }
> = {
  pending: { bg: "bg-yellow-50", text: "text-yellow-700" },
  approved: { bg: "bg-green-50", text: "text-green-700" },
  rejected: { bg: "bg-red-50", text: "text-red-700" },
};

export const ROOM_CATEGORIES = [
  "Living Room",
  "Kitchen",
  "Master Bedroom",
  "Bedroom 2",
  "Bedroom 3",
  "Bathroom",
  "Balcony/Terrace",
  "Exterior",
  "Common Areas",
  "Other",
];
