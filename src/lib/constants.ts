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
  }
> = {
  basic: {
    name: "Basic",
    tagline: "Essential property management for single-property owners",
    features: [
      "Professional property listing",
      "Tenant screening & matching",
      "Basic photography guidance",
      "Standard listing optimization",
      "Email support",
    ],
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
  },
  preferred_owners: {
    name: "Preferred Owners",
    tagline: "Enhanced services for growing property portfolios",
    features: [
      "Everything in Basic, plus:",
      "Professional photography session",
      "Priority tenant matching",
      "Multi-property dashboard",
      "Market analysis reports",
      "Priority email & chat support",
    ],
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-200",
  },
  elite: {
    name: "Elite Assets & Legacy",
    tagline: "Full-service management for investment portfolios",
    features: [
      "Everything in Preferred, plus:",
      "Dedicated account manager",
      "Premium photography & virtual tours",
      "Revenue optimization strategy",
      "Legal compliance review",
      "Quarterly portfolio analysis",
      "Concierge-level support",
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
  lujo: "Lujo ($7,001+)",
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
