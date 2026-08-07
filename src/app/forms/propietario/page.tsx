"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import { ownerFormSchema, type OwnerFormData } from "@/types/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Building2, ArrowLeft, ArrowRight, FileText } from "lucide-react";
import { ImageUpload, type ImageWithMeta } from "@/components/forms/image-upload";
import { useFormFieldMeta, fieldOptions, fieldDisplay } from "@/lib/form-meta";
import { DynamicField } from "@/components/forms/dynamic-field";
import { logConsents } from "@/lib/consent-log";
import { useLegalDocsOverlay } from "@/lib/legal-docs";

// Steve 5/6: types fetched from legal_documents to override the
// hardcoded LEGAL_DOCS texts on this public form.
const PROPIETARIO_LEGAL_TYPES = [
  "consent_image_usage",
  "consent_data_processing",
  "consent_marketing",
  "consent_third_party",
  "consent_legal_representation",
  "consent_liability_limitation",
  "consent_electronic_signature",
] as const;

// ─── Objectives (PDF 5.2.1 - 8 options) ─────────────
const OBJECTIVES = [
  "Rent extra spaces (rooms, den)",
  "Rent a full unit (basement, suite, house, apartment, penthouse)",
  "Cover mortgage payments",
  "Increase income",
  "Get return on property investment",
  "Short-term rentals",
  "Long-term rentals",
  "Optimize assets",
];

// ─── Property types (PDF 5.2.1.1) ───────────────────
const PROPERTY_TYPES = [
  { value: "house", label: "House" },
  { value: "condo", label: "Condo" },
  { value: "penthouse", label: "Penthouse" },
  { value: "basement", label: "Basement" },
  { value: "studio", label: "Studio / Apartastudio" },
  { value: "rooms_only", label: "Rooms only" },
];

// ─── Occupancy Status ───────────────────────────────
const OCCUPANCY_OPTIONS = [
  { value: "vacant", label: "Vacant" },
  { value: "occupied", label: "Currently occupied" },
  { value: "renovation", label: "Under renovation" },
  { value: "new_construction", label: "New construction" },
];

// ─── Listing Platforms (Steve #9) ───────────────────
const LISTING_PLATFORMS = [
  "Zumper", "Craigslist", "Zillow", "Kijiji", "Facebook Marketplace",
  "Realtor.ca", "Rentals.ca", "PadMapper", "Other",
];

// ─── Amenities (PDF 5.2.1.1 - 16+) ─────────────────
const AMENITIES = [
  "Gym", "Rooftop", "Coworking", "Pool", "Jacuzzi", "Sauna",
  "Covered parking", "Open parking", "Private parking",
  "In-unit laundry (washer & dryer)", "Building laundry (paid)",
  "In-unit washer only", "Fireplace", "Internet", "Airfryer", "Other",
];

// ─── Common areas (PDF 5.2.1.1) ─────────────────────
const COMMON_AREAS = ["BBQ zone", "SPA", "Billiards", "Pool"];

// ─── Smart home features ─────────────────────────────
const SMART_HOME_FEATURES = ["Smart locks", "Keyless entry card", "Other"];

// ─── Bedrooms / Bathrooms ────────────────────────────
const BEDROOMS = ["1 BR", "2 BR", "3 BR", "4 BR", "5 BR", "6 BR", "7 BR"];
const BATHROOMS = ["1 Bath", "1.5 Bath", "2 Bath", "2.5 Bath", "3 Bath", "3.5 Bath"];

// ─── Styles ──────────────────────────────────────────
const STYLES = [
  { value: "minimalist", label: "Minimalist" },
  { value: "modern", label: "Modern" },
  { value: "classic", label: "Classic" },
  { value: "elegant", label: "Elegant" },
  { value: "other", label: "Other" },
];

// ─── SkyTrain lines ──────────────────────────────────
const SKYTRAIN_LINES = ["Millennium Line", "Expo Line", "Canada Line"];

// ─── BC Supermarkets (PDF 5.2.1.2) ──────────────────
const SUPERMARKETS = [
  "Superstore", "Walmart", "Costco", "Save-On-Foods",
  "Whole Foods", "T&T Supermarket", "No Frills", "Safeway", "Dollarama",
];

// ─── BC Cities ───────────────────────────────────────
const BC_CITIES = [
  "Vancouver", "Burnaby", "Surrey", "Richmond", "North Vancouver",
  "West Vancouver", "Coquitlam", "New Westminster", "Victoria",
  "Kelowna", "Langley", "Abbotsford",
];

// ─── Legal document texts ────────────────────────────
const LEGAL_DOCS: Record<string, { title: string; text: string }> = {
  consent_image_usage: {
    title: "Image Usage & Editing Authorization",
    text: "By accepting this consent, you authorize Nexuma marketing ltd and its partners to use, reproduce, edit, and publish photographs, videos, and other visual content of your property for commercial, promotional, and marketing purposes. This includes but is not limited to: listing platforms, social media, advertisements, brochures, and website content. You confirm that you have the legal right to grant this authorization. This consent remains in effect for the duration of the service agreement and may be revoked in writing with 30 days notice.",
  },
  consent_data_processing: {
    title: "Rights & Privacy Declaration",
    text: "In accordance with the Personal Information Protection Act (PIPA) of British Columbia and the Personal Information Protection and Electronic Documents Act (PIPEDA) of Canada, we collect and process your personal information solely for the purpose of providing our marketing and property management services. Your data will be stored securely and will not be shared with third parties without your explicit consent, except as required by law. You have the right to access, correct, and request deletion of your personal data at any time by contacting our privacy officer at privacy@nexuma.ca.",
  },
  consent_marketing: {
    title: "Electronic Communications (CASL)",
    text: "In compliance with Canada's Anti-Spam Legislation (CASL), by providing your consent you agree to receive commercial electronic messages from Nexuma marketing ltd including but not limited to: service updates, marketing recommendations, property performance reports, promotional offers, and newsletters. You may unsubscribe from these communications at any time by clicking the unsubscribe link in any email or by contacting us directly. Your consent to receive these communications is not a condition of service.",
  },
  consent_third_party: {
    title: "Terms & Conditions",
    text: "By accepting these terms and conditions, you agree to the following: (1) All information provided in this form is accurate and truthful. (2) You are the legal owner or authorized representative of the property/properties listed. (3) You authorize Nexuma marketing ltd to act on your behalf for marketing and tenant placement purposes as outlined in your service plan. (4) Service fees are based on the assigned plan tier and are calculated as a percentage of monthly rent as described in the plan details. (5) Either party may terminate the agreement with 30 days written notice. (6) Disputes will be resolved under the laws of British Columbia, Canada.",
  },
  // Steve 4/21 #16: 3 additional legal consents
  consent_legal_representation: {
    title: "Legal Representation Authorization",
    text: "By accepting this consent, you authorize Nexuma marketing ltd to act as your designated representative for all matters related to the marketing, leasing, and tenant placement of the listed property/properties. This representation is limited to the scope of services outlined in your selected plan and does not include legal advice, litigation, or acts requiring power of attorney. You retain full ownership and decision-making authority over the property at all times. This authorization may be revoked at any time with 30 days written notice.",
  },
  consent_liability_limitation: {
    title: "Limitation of Liability",
    text: "You acknowledge and agree that Nexuma marketing ltd provides marketing and matching services and is not a party to any lease agreement between the property owner and the tenant. To the maximum extent permitted by law, Nexuma marketing ltd's total liability arising from the services shall not exceed the fees paid by you in the twelve (12) months preceding the claim. Nexuma marketing ltd is not liable for: tenant default, property damage caused by tenants, indirect or consequential damages, or outcomes outside of our direct control. This limitation does not exclude liability that cannot be excluded by law.",
  },
  consent_electronic_signature: {
    title: "Electronic Signature Consent",
    text: "By checking this box and submitting this form, you agree that your electronic check-box action constitutes a valid and binding electronic signature under the Personal Information Protection and Electronic Documents Act (PIPEDA) and British Columbia's Electronic Transactions Act. You consent to conduct this transaction by electronic means and agree that electronic records and signatures have the same legal effect as handwritten signatures on paper documents. You acknowledge having the ability to access, read, and retain a copy of these consents at any time.",
  },
};

const TOTAL_STEPS = 6;

function getServiceTier(count: number): string {
  if (count >= 4) return "Elite Assets & Legacy";
  if (count >= 2) return "Preferred Owners";
  return "Basic";
}

function getPortfolio(rent: number): { name: string; key: string; color: string; bgColor: string } {
  if (rent >= 7001) return { name: "Lujo", key: "lujo", color: "text-purple-600", bgColor: "bg-purple-50" };
  if (rent >= 4000) return { name: "Signature", key: "signature", color: "text-amber-600", bgColor: "bg-amber-50" };
  return { name: "Essentials", key: "essentials", color: "text-blue-600", bgColor: "bg-blue-50" };
}

// Portfolio fee structure per MVP (Steve April 16 2026)
// CFP = rent × 10% (fixed for all portfolios)
// Monthly fee = fixed amount per portfolio (for all linked properties)
// Payback = monthly fee / CFP
const CFP_RATE = 0.10; // 10% of rent, fixed

const PORTFOLIO_FEES: Record<string, { oneTime: number; monthlyFee: number }> = {
  essentials: { oneTime: 900, monthlyFee: 100 },
  signature: { oneTime: 1410, monthlyFee: 100 },
  lujo: { oneTime: 1650, monthlyFee: 300 },
};

interface InvestorPropertyData {
  property_type: string;
  bedrooms: string;
  bathrooms: string;
  area_sqft: number | "";
  area_unit: "sqft" | "m2";
  occupancy_status: string;
  vacancy_date: string;
  availability_date: string;
  style: string;
  levels: string;
  dishwasher: boolean;
  pet_friendly: boolean;
  smart_home: boolean;
  smart_home_features: string[];
  shared_unit: boolean;
  furnished: boolean;
  utilities_included: boolean;
  amenities: string[];
  common_areas: string[];
  listing_platforms: string[];
  address: string;
  postal_code: string;
  near_parks: boolean;
  near_churches: boolean;
  near_skytrain: boolean;
  skytrain_lines: string[];
  near_bus: boolean;
  near_mall: boolean;
  social_life: string;
  nearby_supermarkets: string[];
}

const DEFAULT_INVESTOR_PROP: InvestorPropertyData = {
  property_type: "",
  bedrooms: "",
  bathrooms: "",
  area_sqft: "",
  area_unit: "sqft",
  occupancy_status: "vacant",
  vacancy_date: "",
  availability_date: "",
  style: "",
  levels: "",
  dishwasher: false,
  pet_friendly: false,
  smart_home: false,
  smart_home_features: [],
  shared_unit: false,
  furnished: false,
  utilities_included: false,
  amenities: [],
  common_areas: [],
  listing_platforms: [],
  address: "",
  postal_code: "",
  near_parks: false,
  near_churches: false,
  near_skytrain: false,
  skytrain_lines: [],
  near_bus: false,
  near_mall: false,
  social_life: "",
  nearby_supermarkets: [],
};

export default function OwnerFormPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [expandedLegal, setExpandedLegal] = useState<string | null>(null);
  const [propertyImages, setPropertyImages] = useState<ImageWithMeta[]>([]);
  const [investorPropertyImages, setInvestorPropertyImages] = useState<ImageWithMeta[][]>([]);
  const [investorProps, setInvestorProps] = useState<InvestorPropertyData[]>([]);
  const [propIdx, setPropIdx] = useState(0);
  const formRef = useRef<HTMLDivElement>(null);

  // Steve 4/28 round 2: admin-editable form metadata overlay.
  const fieldMeta = useFormFieldMeta("owner_property");
  // Steve 5/6: pull current consent text from legal_documents so admin
  // edits propagate to this form. Falls back to LEGAL_DOCS constant.
  const legalOverlay = useLegalDocsOverlay(PROPIETARIO_LEGAL_TYPES);
  const legalText = (key: keyof typeof LEGAL_DOCS) =>
    legalOverlay[key]?.text ?? LEGAL_DOCS[key].text;
  // Steve 5/11: also expose the DB `updated_at` so the expanded
  // consent block can show "Last updated at <time>" — letting the
  // client see at a glance whether admin edits have reached the form.
  // When undefined the row came from the LEGAL_DOCS code fallback.
  const legalUpdatedAt = (key: keyof typeof LEGAL_DOCS) =>
    legalOverlay[key]?.updatedAt;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
    trigger,
  } = useForm<OwnerFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(ownerFormSchema) as any,
    defaultValues: {
      property_count: 1,
      objectives: [],
      cities: [""],
      rents: [0],
      amenities: [],
      common_areas: [],
      smart_home_features: [],
      skytrain_lines: [],
      nearby_supermarkets: [],
      listing_platforms: [],
      pet_friendly: false,
      smart_home: false,
      shared_unit: false,
      dishwasher: false,
      furnished: false,
      utilities_included: false,
      near_parks: false,
      near_churches: false,
      near_skytrain: false,
      near_bus: false,
      near_mall: false,
      province: "British Columbia",
      consent_image_usage: false,
      consent_data_processing: false,
      consent_marketing: false,
      consent_third_party: false,
      consent_legal_representation: false,
      consent_liability_limitation: false,
      consent_electronic_signature: false,
      area_unit: "sqft",
      occupancy_status: "vacant",
    },
  });

  const objectives = watch("objectives") as string[];
  const amenities = watch("amenities") as string[];
  const commonAreas = watch("common_areas") as string[];
  const smartHomeFeatures = watch("smart_home_features") as string[];
  const skytrainLines = watch("skytrain_lines") as string[];
  const supermarkets = watch("nearby_supermarkets") as string[];
  const listingPlatforms = watch("listing_platforms") as string[];
  const propertyCount = (watch("property_count") as number) || 1;
  const cities = watch("cities") as string[];
  const rents = watch("rents") as number[];
  const smartHome = watch("smart_home") as boolean;
  const nearSkytrain = watch("near_skytrain") as boolean;
  const occupancyStatus = watch("occupancy_status") as string;
  const selectedStyle = watch("style") as string | undefined;
  const selectedLevels = watch("levels") as string | undefined;
  const userType = watch("user_type") as string | undefined;
  const isInvestor = userType === "investor" && propertyCount >= 4;

  function toggleArray(field: keyof OwnerFormData, value: string, arr: string[]) {
    const next = arr.includes(value)
      ? arr.filter((v) => v !== value)
      : [...arr, value];
    setValue(field, next as never);
  }

  // Keep cities/rents arrays in sync with property_count
  function syncPropertyArrays(count: number) {
    const newCities = [...cities];
    const newRents = [...rents];
    while (newCities.length < count) newCities.push("");
    while (newRents.length < count) newRents.push(0);
    setValue("cities", newCities.slice(0, count));
    setValue("rents", newRents.slice(0, count));
    syncInvestorProps(count);
  }

  // Keep investorProps array in sync with property_count for investors
  function syncInvestorProps(count: number) {
    setInvestorProps((prev) => {
      const arr = [...prev];
      while (arr.length < count) arr.push({ ...DEFAULT_INVESTOR_PROP });
      return arr.slice(0, count);
    });
    setInvestorPropertyImages((prev) => {
      const arr = [...prev];
      while (arr.length < count) arr.push([]);
      return arr.slice(0, count);
    });
  }

  // Update a single field on the current investor property
  function setInvProp<K extends keyof InvestorPropertyData>(key: K, value: InvestorPropertyData[K]) {
    setInvestorProps((prev) => {
      const arr = [...prev];
      if (!arr[propIdx]) arr[propIdx] = { ...DEFAULT_INVESTOR_PROP };
      arr[propIdx] = { ...arr[propIdx], [key]: value };
      return arr;
    });
  }

  function toggleInvArray(key: "amenities" | "common_areas" | "smart_home_features" | "skytrain_lines" | "nearby_supermarkets" | "listing_platforms", value: string) {
    setInvestorProps((prev) => {
      const arr = [...prev];
      if (!arr[propIdx]) arr[propIdx] = { ...DEFAULT_INVESTOR_PROP };
      const current = arr[propIdx][key];
      arr[propIdx] = {
        ...arr[propIdx],
        [key]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
      };
      return arr;
    });
  }

  // Current investor property (safe access)
  const invProp = investorProps[propIdx] || DEFAULT_INVESTOR_PROP;

  // Scroll to first error field (#6, #12, #20)
  function scrollToFirstError() {
    setTimeout(() => {
      const firstError = formRef.current?.querySelector("[data-error='true'], .text-destructive");
      if (firstError) {
        firstError.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 100);
  }

  async function nextStep() {
    let valid = true;
    // Clear any previous error when starting a step transition
    setError(null);
    if (step === 1) {
      valid = await trigger(["user_type", "property_count", "objectives"]);
      if (valid) syncInvestorProps(propertyCount);
    }
    if (step === 2) {
      valid = await trigger(["cities", "rents"]);
      if (valid && userType === "investor") {
        const invalidRent = rents.slice(0, propertyCount).find((r) => r < 2500);
        if (invalidRent !== undefined) {
          setError("Investor properties require a minimum rent of $2,500 CAD.");
          scrollToFirstError();
          return;
        }
      }
    }
    if (step === 3) {
      if (isInvestor) {
        // Validate current investor property
        const p = investorProps[propIdx];
        if (!p?.property_type || !p?.bedrooms || !p?.bathrooms) {
          setError("Please fill in property type, bedrooms, and bathrooms.");
          scrollToFirstError();
          return;
        }
        setError(null);
        // Move to next property or next step
        if (propIdx < propertyCount - 1) {
          setPropIdx(propIdx + 1);
          return;
        }
        // All properties done, reset index for step 4
        setPropIdx(0);
      } else {
        valid = await trigger(["property_type", "bedrooms", "bathrooms"]);
      }
    }
    if (step === 4) {
      if (isInvestor) {
        const p = investorProps[propIdx];
        if (!p?.address) {
          setError("Please enter the property address.");
          scrollToFirstError();
          return;
        }
        setError(null);
        if (propIdx < propertyCount - 1) {
          setPropIdx(propIdx + 1);
          return;
        }
        setPropIdx(0);
      } else {
        valid = await trigger(["address", "zone_city"]);
      }
    }
    // Steve #12 (4/19): Each property needs MINIMUM 1 photo per REQUIRED ROOM
    // (Living Room, Kitchen, Bedroom, Bathroom, Exterior) — not just 1 total
    const REQUIRED_ROOMS_FOR_FORM = ["living_room", "kitchen", "bedroom", "bathroom", "exterior"];

    function missingRoomsFor(imgs: ImageWithMeta[] | undefined): string[] {
      const covered = new Set((imgs || []).map((img) => img.room));
      return REQUIRED_ROOMS_FOR_FORM.filter((r) => !covered.has(r));
    }

    if (step === 5 && isInvestor) {
      // Check each property for missing required rooms
      for (let i = 0; i < propertyCount; i++) {
        const missing = missingRoomsFor(investorPropertyImages[i]);
        if (missing.length > 0) {
          setError(
            `Property ${i + 1} is missing photos for: ${missing.join(", ")}. ` +
            `At least 1 photo per required room (Living Room, Kitchen, Bedroom, Bathroom, Exterior) is needed.`
          );
          setPropIdx(i);
          scrollToFirstError();
          return;
        }
      }
      setError(null);
    }
    // Steve #12 (4/19): Owner must also cover all required rooms
    if (step === 5 && !isInvestor) {
      const missing = missingRoomsFor(propertyImages);
      if (missing.length > 0) {
        setError(
          `Missing photos for: ${missing.join(", ")}. ` +
          `At least 1 photo per required room (Living Room, Kitchen, Bedroom, Bathroom, Exterior) is needed.`
        );
        scrollToFirstError();
        return;
      }
      setError(null);
    }
    if (valid) {
      setStep(step + 1);
    } else {
      scrollToFirstError();
    }
  }

  // Browser back button navigates to previous step (#30)
  const handlePopState = useCallback(() => {
    setStep((prev) => {
      if (prev > 1) return prev - 1;
      return prev;
    });
  }, []);

  useEffect(() => {
    window.history.pushState({ step }, "", `#step-${step}`);
  }, [step]);

  useEffect(() => {
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [handlePopState]);

  async function onSubmit(data: OwnerFormData) {
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const tier = propertyCount >= 4 ? "elite" : propertyCount >= 2 ? "preferred_owners" : "basic";
      const isInvestorSubmit = data.user_type === "investor" && propertyCount >= 4;

      // Save owner profile to discovery_briefs
      const { error: briefError } = await supabase
        .from("discovery_briefs")
        .insert({
          user_id: user.id,
          property_objective: "rent",
          property_type: isInvestorSubmit ? investorProps[0]?.property_type || data.property_type : data.property_type,
          current_state: isInvestorSubmit ? investorProps[0]?.occupancy_status || "vacant" : data.occupancy_status,
          monthly_rent: data.rents[0] || null,
          main_challenge: "find_tenants",
          property_count: data.property_count,
          has_professional_photos: false,
          current_listings: isInvestorSubmit ? investorProps[0]?.listing_platforms || [] : data.listing_platforms,
          objectives: data.objectives,
          cities: data.cities,
          rents: data.rents,
          assigned_path: tier,
          consent_data_processing: data.consent_data_processing,
          consent_image_usage: data.consent_image_usage,
          consent_marketing: data.consent_marketing,
          consent_third_party: data.consent_third_party,
        });

      if (briefError) throw briefError;

      // Steve 5/4 #7: every consent the user ticks must produce a
      // consent_logs row with IP + user-agent so /admin/legal can audit.
      // Fire-and-forget — do not block the submit flow on logging failure.
      logConsents(user.id, [
        { type: "data_processing", granted: !!data.consent_data_processing },
        { type: "image_usage", granted: !!data.consent_image_usage },
        { type: "marketing", granted: !!data.consent_marketing },
        { type: "third_party", granted: !!data.consent_third_party },
      ]).catch((err) => console.error("Consent log failed:", err));

      // Steve 4/23 #6: Send email EARLY (before long property/photo operations)
      // so that if photo upload fails, commercial team still gets the lead notification.
      // Fire-and-forget so we don't block the submit flow.
      fetch("/api/owner-submit-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_type: data.user_type,
          property_count: data.property_count,
          tier,
          cities: data.cities,
          rents: data.rents,
        }),
      }).catch((err) => console.error("Owner submit email failed:", err));

      if (isInvestorSubmit) {
        // ─── Investor: create all properties with portfolio assignment ───
        for (let i = 0; i < Math.min(propertyCount, investorProps.length); i++) {
          const ip = investorProps[i];
          const rent = data.rents[i] || 0;
          const city = data.cities[i] || "";
          const portfolio = getPortfolio(rent);
          const portfolioFee = PORTFOLIO_FEES[portfolio.key];
          const cfpMonthly = rent * CFP_RATE;
          const paybackMonths = cfpMonthly > 0 ? portfolioFee.monthlyFee / cfpMonthly : 0;

          const { data: propData, error: propError } = await supabase.from("properties").insert({
            owner_id: user.id,
            title: `${ip.property_type} in ${city}`,
            property_type: ip.property_type,
            address: ip.address,
            city: city,
            province: "British Columbia",
            postal_code: ip.postal_code || null,
            monthly_rent: rent || null,
            bedrooms: parseInt(ip.bedrooms) || null,
            bathrooms: ip.bathrooms ? Math.floor(parseFloat(ip.bathrooms.replace(" Bath", ""))) : null,
            area_sqft: typeof ip.area_sqft === "number" ? ip.area_sqft : null,
            amenities: ip.amenities,
            common_areas: ip.common_areas,
            availability_date: ip.availability_date || null,
            dishwasher: ip.dishwasher,
            pet_friendly: ip.pet_friendly,
            smart_home: ip.smart_home,
            smart_home_features: ip.smart_home_features,
            shared_unit: ip.shared_unit,
            levels: ip.levels || null,
            furnished: ip.furnished,
            utilities_included: ip.utilities_included,
            style: ip.style || null,
            near_parks: ip.near_parks,
            near_churches: ip.near_churches,
            near_skytrain: ip.near_skytrain,
            skytrain_lines: ip.skytrain_lines,
            near_bus: ip.near_bus,
            social_life: ip.social_life || null,
            near_mall: ip.near_mall,
            nearby_supermarkets: ip.nearby_supermarkets,
            service_tier: tier,
            elite_tier: portfolio.key,
            cfp_monthly: cfpMonthly,
            payback_months: paybackMonths,
            is_available: ip.occupancy_status === "vacant",
          }).select().single();

          if (propError) {
            console.error(`Failed to create property ${i + 1}:`, propError);
          }

          // Steve #11: upload photos specifically for THIS property (per-property)
          const thisPropertyImages = investorPropertyImages[i] || [];
          if (propData && thisPropertyImages.length > 0) {
            for (const img of thisPropertyImages) {
              const ext = img.file.name.split(".").pop();
              const path = `properties/${propData.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
              const { error: uploadErr } = await supabase.storage.from("property-images").upload(path, img.file);
              if (uploadErr) { console.error("Image upload failed:", uploadErr); continue; }
              const { data: { publicUrl } } = supabase.storage.from("property-images").getPublicUrl(path);
              await supabase.from("property_images").insert({
                property_id: propData.id,
                room_category: img.room,
                image_url: publicUrl,
                original_filename: img.file.name,
                file_size_bytes: img.file.size,
                resolution_ok: img.validation.resolution_ok,
                orientation: img.validation.orientation,
                status: "pending",
                sort_order: thisPropertyImages.indexOf(img),
              });
            }
          }
        }
      } else {
        // ─── Owner: save single property (existing logic) ───
        const { data: propData, error: propError } = await supabase.from("properties").insert({
          owner_id: user.id,
          title: `${data.property_type} in ${data.zone_city}`,
          property_type: data.property_type,
          address: data.address,
          city: data.zone_city,
          province: data.province,
          postal_code: data.postal_code || null,
          monthly_rent: data.rents[0] || null,
          bedrooms: parseInt(data.bedrooms),
          bathrooms: Math.floor(parseFloat(data.bathrooms.replace(" Bath", ""))),
          area_sqft: typeof data.area_sqft === "number" ? data.area_sqft : null,
          amenities: data.amenities,
          common_areas: data.common_areas,
          availability_date: data.availability_date || null,
          dishwasher: data.dishwasher,
          pet_friendly: data.pet_friendly,
          smart_home: data.smart_home,
          smart_home_features: data.smart_home_features,
          shared_unit: data.shared_unit,
          levels: data.levels || null,
          furnished: data.furnished,
          utilities_included: data.utilities_included,
          style: data.style || null,
          near_parks: data.near_parks,
          near_churches: data.near_churches,
          near_skytrain: data.near_skytrain,
          skytrain_lines: data.skytrain_lines,
          near_bus: data.near_bus,
          social_life: data.social_life || null,
          near_mall: data.near_mall,
          nearby_supermarkets: data.nearby_supermarkets,
          service_tier: tier,
          is_available: data.occupancy_status === "vacant",
        }).select().single();

        if (propError) throw propError;

        // Upload property images to Supabase Storage
        if (propData && propertyImages.length > 0) {
          for (const img of propertyImages) {
            const ext = img.file.name.split(".").pop();
            const path = `properties/${propData.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

            const { error: uploadErr } = await supabase.storage
              .from("property-images")
              .upload(path, img.file);

            if (uploadErr) {
              console.error("Image upload failed:", uploadErr);
              continue;
            }

            const { data: { publicUrl } } = supabase.storage
              .from("property-images")
              .getPublicUrl(path);

            await supabase.from("property_images").insert({
              property_id: propData.id,
              room_category: img.room,
              image_url: publicUrl,
              original_filename: img.file.name,
              file_size_bytes: img.file.size,
              resolution_ok: img.validation.resolution_ok,
              orientation: img.validation.orientation,
              status: "pending",
              sort_order: propertyImages.indexOf(img),
            });
          }
        }
      }

      // Run profiling (classifies tier, CFP, etc. — respects existing role)
      await fetch("/api/profiling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "owner" }),
      });

      // Create lead
      await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "owner_form" }),
      });

      const {
        data: { user: currentUser },
        error: currentUserError,
      } = await supabase.auth.getUser();

      if (currentUserError || !currentUser) {
        setError("Your information was saved, but your session could not be verified. Please sign in and try again.");
        return;
      }

      router.push("/dashboard/properties");
    } catch (err) {
      setError("Failed to save. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const progress = Math.round((step / TOTAL_STEPS) * 100);

  return (
    <div ref={formRef} className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-background to-secondary/20 px-4 py-8">
      {/* Progress */}
      <div className="mb-8 w-full max-w-2xl">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
          <span className="flex items-center gap-1">
            <Building2 className="h-3.5 w-3.5" />
            Owner Profile &mdash; Step {step} of {TOTAL_STEPS}
          </span>
          <span>{progress}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted">
          <div
            className="h-2 rounded-full bg-primary transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <Card className="w-full max-w-2xl">
        <form onSubmit={(e) => {
          // For investors, seed top-level form fields from investorProps[0] so schema validation passes
          // (investor data lives in the investorProps array, not in the top-level form state)
          if (isInvestor && investorProps[0]) {
            const ip0 = investorProps[0];
            if (ip0.property_type) setValue("property_type", ip0.property_type);
            if (ip0.bedrooms) setValue("bedrooms", ip0.bedrooms);
            if (ip0.bathrooms) setValue("bathrooms", ip0.bathrooms);
            if (ip0.address) setValue("address", ip0.address);
            if (cities[0]) setValue("zone_city", cities[0]);
          }
          return handleSubmit(onSubmit, () => {
            const errorFields = Object.keys(errors);
            if (errorFields.length > 0) {
              setError(`Please fill in the required fields: ${errorFields.map(f => f.replace(/_/g, " ")).join(", ")}`);
            }
            scrollToFirstError();
          })(e);
        }}>
          <CardHeader>
            <CardTitle className="text-xl">
              {step === 1 && "Owner Profile"}
              {step === 2 && "Property Portfolio"}
              {step === 3 && (isInvestor ? `Property ${propIdx + 1} Details` : "Property Details")}
              {step === 4 && (isInvestor ? `Property ${propIdx + 1} Location` : "Zone & Location")}
              {step === 5 && "Property Photos"}
              {step === 6 && "Legal Consents"}
            </CardTitle>
            <CardDescription>
              {step === 1 && "Tell us about yourself and your property objectives."}
              {step === 2 && "Enter the city and desired rent for each property."}
              {step === 3 && (isInvestor
                ? `Describe property ${propIdx + 1} of ${propertyCount}. Each property is assigned a portfolio based on rent.`
                : "Describe your first property. You can add more from your dashboard.")}
              {step === 4 && (isInvestor
                ? `Enter the address and nearby features for property ${propIdx + 1} of ${propertyCount}.`
                : "Location details help us match tenants to your property.")}
              {step === 5 && "Upload photos of your property. Quality images attract better tenants."}
              {step === 6 && "Please review and accept the following consents."}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* ═══ Step 1: Owner Profile ═══ */}
            {step === 1 && (
              <>
                {/* #14: Investor or Owner.
                    Steve 5/14: docx reported "perfil del propietario" no
                    reflejaba cambios desde admin. Root cause: this whole
                    Step 1 (label + the two cards + per-card descriptions)
                    was hardcoded JSX with no fieldMeta overlay, so admin
                    label/helper edits to user_type / property_count /
                    objectives were ignored. The two card *values*
                    ("owner" / "investor") still gate downstream business
                    logic (role assignment, schema z.enum), so we let
                    admin rename the visible card labels but keep the
                    underlying values pinned to those two literals. */}
                {(() => {
                  const userTypeDisplay = fieldDisplay(fieldMeta, "user_type", {
                    label: "Are you a property owner or an investor?",
                  });
                  if (userTypeDisplay.hidden) return null;
                  const USER_TYPE_FALLBACK = [
                    { value: "owner", label: "Property Owner" },
                    { value: "investor", label: "Investor" },
                  ] as const;
                  const USER_TYPE_DESCRIPTIONS: Record<string, string> = {
                    owner: "I own 1-3 properties for rental income",
                    investor: "I own 4+ properties as investment assets",
                  };
                  // Steve 5/15: prior version filtered the admin options
                  // to value === "owner" | "investor" so any admin who
                  // renamed the *value* (not just the label) of either
                  // option ended up with zero cards rendered — the form
                  // became unfillable. Instead, always render the two
                  // canonical cards (the schema z.enum and the
                  // role-assignment logic both require these values)
                  // and pick a label by lookup: prefer admin's option
                  // matching by value, then by position, then default.
                  const allAdminOptions = fieldOptions(
                    fieldMeta,
                    "user_type",
                    USER_TYPE_FALLBACK,
                  );
                  const ownerLabel =
                    allAdminOptions.find((o) => o.value === "owner")?.label ||
                    allAdminOptions[0]?.label ||
                    "Property Owner";
                  const investorLabel =
                    allAdminOptions.find((o) => o.value === "investor")?.label ||
                    allAdminOptions[1]?.label ||
                    "Investor";
                  const userTypeOptions = [
                    { value: "owner", label: ownerLabel },
                    { value: "investor", label: investorLabel },
                  ];
                  return (
                    <div className="space-y-2">
                      <Label>
                        {userTypeDisplay.label}
                        {userTypeDisplay.required && <span className="ml-1 text-red-500">*</span>}
                      </Label>
                      <div className="grid grid-cols-2 gap-3">
                        {userTypeOptions.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setValue("user_type", opt.value as "owner" | "investor")}
                            className={`rounded-lg border p-4 text-left transition-all ${
                              (watch("user_type") as string) === opt.value
                                ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                                : "border-muted hover:border-primary/30"
                            }`}
                          >
                            <p className="font-medium text-sm">{opt.label}</p>
                            {USER_TYPE_DESCRIPTIONS[opt.value] && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {USER_TYPE_DESCRIPTIONS[opt.value]}
                              </p>
                            )}
                          </button>
                        ))}
                      </div>
                      {userTypeDisplay.helper && (
                        <p className="text-xs text-muted-foreground">{userTypeDisplay.helper}</p>
                      )}
                      {errors.user_type && (
                        <p className="text-sm text-destructive" data-error="true">{errors.user_type.message}</p>
                      )}
                    </div>
                  );
                })()}

                <DynamicField
                  meta={fieldMeta}
                  fieldKey="property_count"
                  fallbackLabel="Number of properties"
                  htmlFor="property_count"
                >
                  <Input
                    id="property_count"
                    type="number"
                    min={1}
                    placeholder="e.g. 2"
                    {...register("property_count", {
                      onChange: (e) => syncPropertyArrays(parseInt(e.target.value) || 1),
                    })}
                  />
                  {errors.property_count && (
                    <p className="text-sm text-destructive" data-error="true">{errors.property_count.message}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Your service tier: <strong>{getServiceTier(propertyCount)}</strong>
                  </p>
                </DynamicField>

                <DynamicField
                  meta={fieldMeta}
                  fieldKey="objectives"
                  fallbackLabel="What are your objectives? (select all that apply)"
                  className="space-y-3"
                >
                  <div className="grid gap-2 sm:grid-cols-2">
                    {fieldOptions(fieldMeta, "objectives", OBJECTIVES).map((opt) => (
                      <div key={opt.value} className="flex items-center gap-2">
                        <Checkbox
                          id={`obj-${opt.value}`}
                          checked={objectives.includes(opt.value)}
                          onCheckedChange={() => toggleArray("objectives", opt.value, objectives)}
                        />
                        <Label htmlFor={`obj-${opt.value}`} className="text-sm font-normal">
                          {opt.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                  {errors.objectives && (
                    <p className="text-sm text-destructive" data-error="true">{errors.objectives.message}</p>
                  )}
                </DynamicField>
              </>
            )}

            {/* ═══ Step 2: Per-property city & rent ═══ */}
            {step === 2 && (
              <>
                <p className="text-sm text-muted-foreground">
                  Enter the city and desired monthly rent for each of your {propertyCount} {propertyCount === 1 ? "property" : "properties"}.
                  Limited to British Columbia.
                </p>
                {Array.from({ length: Math.min(propertyCount, 10) }, (_, i) => (
                  <div key={i} className="rounded-lg border p-4 space-y-3">
                    <p className="text-sm font-medium">Property {i + 1}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">City</Label>
                        <Select
                          value={cities[i] ?? ""}
                          onValueChange={(val: string | null) => {
                            if (!val) return;
                            const newCities = [...cities];
                            newCities[i] = val;
                            setValue("cities", newCities);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select city" />
                          </SelectTrigger>
                          <SelectContent>
                            {fieldOptions(fieldMeta, "city", BC_CITIES).map((c) => (
                              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">
                          Monthly rent (CAD {userType === "investor" ? "$2,500-$8,000" : "$300-$8,000"})
                        </Label>
                        <Input
                          type="number"
                          min={userType === "investor" ? 2500 : 300}
                          max={8000}
                          placeholder={userType === "investor" ? "e.g. 3500" : "e.g. 2500"}
                          value={rents[i] || ""}
                          onChange={(e) => {
                            const newRents = [...rents];
                            newRents[i] = parseInt(e.target.value) || 0;
                            setValue("rents", newRents);
                          }}
                        />
                        {userType === "investor" && rents[i] > 0 && rents[i] < 2500 && (
                          <p className="text-sm text-destructive">Minimum rent for investors is $2,500 CAD</p>
                        )}
                        {userType !== "investor" && rents[i] > 0 && rents[i] < 300 && (
                          <p className="text-sm text-destructive">Minimum rent is $300 CAD</p>
                        )}
                        {rents[i] > 8000 && (
                          <p className="text-sm text-destructive">Maximum rent is $8,000 CAD</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {errors.cities && (
                  <p className="text-sm text-destructive" data-error="true">{errors.cities.message}</p>
                )}
                {errors.rents && (
                  <p className="text-sm text-destructive" data-error="true">{errors.rents.message}</p>
                )}
              </>
            )}

            {/* ═══ Step 3: Property Details ═══ */}
            {step === 3 && !isInvestor && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <DynamicField meta={fieldMeta} fieldKey="property_type" fallbackLabel="Property type">
                    <Select value={watch("property_type") as string | undefined} onValueChange={(val: string | null) => val && setValue("property_type", val)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {fieldOptions(fieldMeta, "property_type", PROPERTY_TYPES).map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.property_type && (
                      <p className="text-sm text-destructive" data-error="true">{errors.property_type.message}</p>
                    )}
                  </DynamicField>
                  <DynamicField meta={fieldMeta} fieldKey="occupancy_status" fallbackLabel="Current occupancy status">
                    <Select
                      value={occupancyStatus}
                      onValueChange={(val: string | null) => val && setValue("occupancy_status", val as OwnerFormData["occupancy_status"])}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        {fieldOptions(fieldMeta, "occupancy_status", OCCUPANCY_OPTIONS).map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </DynamicField>
                </div>

                {/* #18: When occupied, ask when it becomes available */}
                {occupancyStatus === "occupied" && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                    <DynamicField
                      meta={fieldMeta}
                      fieldKey="vacancy_date"
                      fallbackLabel="When does the property become available?"
                      fallbackHelper="Approximate date when the current tenant moves out."
                    >
                      <Input type="date" {...register("vacancy_date")} />
                    </DynamicField>
                  </div>
                )}

                <DynamicField
                  meta={fieldMeta}
                  fieldKey="availability_date"
                  fallbackLabel="Availability date (for new tenants)"
                >
                  <Input type="date" {...register("availability_date")} />
                </DynamicField>

                <div className="grid grid-cols-3 gap-4">
                  <DynamicField meta={fieldMeta} fieldKey="bedrooms" fallbackLabel="Bedrooms">
                    <Select value={watch("bedrooms") as string | undefined} onValueChange={(val: string | null) => val && setValue("bedrooms", val)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {fieldOptions(fieldMeta, "bedrooms", BEDROOMS.map((b) => ({ value: b.replace(" BR", ""), label: b }))).map((b) => (
                          <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.bedrooms && (
                      <p className="text-sm text-destructive" data-error="true">{errors.bedrooms.message}</p>
                    )}
                  </DynamicField>
                  <DynamicField meta={fieldMeta} fieldKey="bathrooms" fallbackLabel="Bathrooms">
                    <Select value={watch("bathrooms") as string | undefined} onValueChange={(val: string | null) => val && setValue("bathrooms", val)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {fieldOptions(fieldMeta, "bathrooms", BATHROOMS).map((b) => (
                          <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.bathrooms && (
                      <p className="text-sm text-destructive" data-error="true">{errors.bathrooms.message}</p>
                    )}
                  </DynamicField>
                  <DynamicField meta={fieldMeta} fieldKey="area_sqft" fallbackLabel="Size">
                    <div className="flex gap-1">
                      <Input type="number" placeholder="800" {...register("area_sqft")} className="min-w-0" />
                      <Select value={(watch("area_unit") as string) || "sqft"} onValueChange={(v: string | null) => v && setValue("area_unit", v as "sqft" | "m2")}>
                        <SelectTrigger className="w-20 shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sqft">ft²</SelectItem>
                          <SelectItem value="m2">m²</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </DynamicField>
                </div>

                <DynamicField meta={fieldMeta} fieldKey="style" fallbackLabel="Style">
                  <Select value={selectedStyle} onValueChange={(val: string | null) => val && setValue("style", val)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select style" />
                    </SelectTrigger>
                    <SelectContent>
                      {fieldOptions(fieldMeta, "style", STYLES).map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {/* #8: Other text field for style */}
                  {selectedStyle === "other" && (
                    <Input placeholder="Please specify the style" {...register("style_other")} />
                  )}
                </DynamicField>

                <DynamicField meta={fieldMeta} fieldKey="levels" fallbackLabel="Levels / Floor">
                  <Select value={selectedLevels} onValueChange={(val: string | null) => val && setValue("levels", val)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {fieldOptions(
                        fieldMeta,
                        "levels",
                        ["1", "2", "3", "4", "Other"].map((l) => ({ value: l, label: l })),
                      ).map((l) => (
                        <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {/* #8: Other text field for levels */}
                  {selectedLevels === "Other" && (
                    <Input placeholder="Please specify the level/floor" {...register("levels_other")} />
                  )}
                </DynamicField>

                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  {[
                    { id: "dishwasher", label: "Dishwasher", field: "dishwasher" as const },
                    { id: "pet_friendly", label: "Pet-friendly", field: "pet_friendly" as const },
                    { id: "shared_unit", label: "Shared unit", field: "shared_unit" as const },
                    { id: "furnished", label: "Furnished", field: "furnished" as const },
                    { id: "utilities", label: "Utilities included", field: "utilities_included" as const },
                  ].map(({ id, label, field }) => (
                    <div key={id} className="flex items-center gap-2">
                      <Checkbox
                        id={id}
                        checked={watch(field) as boolean}
                        onCheckedChange={(c) => setValue(field, c === true)}
                      />
                      <Label htmlFor={id} className="font-normal">{label}</Label>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="smart_home"
                    checked={smartHome}
                    onCheckedChange={(c) => setValue("smart_home", c === true)}
                  />
                  <Label htmlFor="smart_home" className="font-normal">Smart home</Label>
                </div>
                {smartHome && (
                  <div className="ml-6 space-y-2">
                    {fieldOptions(fieldMeta, "smart_home_features", SMART_HOME_FEATURES).map((opt) => (
                      <div key={opt.value} className="flex items-center gap-2">
                        <Checkbox
                          id={`sh-${opt.value}`}
                          checked={smartHomeFeatures.includes(opt.value)}
                          onCheckedChange={() => toggleArray("smart_home_features", opt.value, smartHomeFeatures)}
                        />
                        <Label htmlFor={`sh-${opt.value}`} className="text-sm font-normal">{opt.label}</Label>
                      </div>
                    ))}
                    {/* #8: Other text field for smart home */}
                    {smartHomeFeatures.includes("Other") && (
                      <Input placeholder="Please specify smart home features" {...register("smart_home_other")} className="ml-6" />
                    )}
                  </div>
                )}

                <DynamicField meta={fieldMeta} fieldKey="amenities" fallbackLabel="Amenities" className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    {fieldOptions(fieldMeta, "amenities", AMENITIES).map((opt) => (
                      <div key={opt.value} className="flex items-center gap-2">
                        <Checkbox
                          id={`am-${opt.value}`}
                          checked={amenities.includes(opt.value)}
                          onCheckedChange={() => toggleArray("amenities", opt.value, amenities)}
                        />
                        <Label htmlFor={`am-${opt.value}`} className="text-sm font-normal">{opt.label}</Label>
                      </div>
                    ))}
                  </div>
                  {/* #8: Other text field for amenities */}
                  {amenities.includes("Other") && (
                    <Input placeholder="Please specify other amenities" {...register("amenities_other")} />
                  )}
                </DynamicField>

                <DynamicField meta={fieldMeta} fieldKey="common_areas" fallbackLabel="Building common areas" className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    {fieldOptions(fieldMeta, "common_areas", COMMON_AREAS).map((opt) => (
                      <div key={opt.value} className="flex items-center gap-2">
                        <Checkbox
                          id={`ca-${opt.value}`}
                          checked={commonAreas.includes(opt.value)}
                          onCheckedChange={() => toggleArray("common_areas", opt.value, commonAreas)}
                        />
                        <Label htmlFor={`ca-${opt.value}`} className="text-sm font-normal">{opt.label}</Label>
                      </div>
                    ))}
                  </div>
                </DynamicField>

                {/* #9: Where is your property listed? */}
                <DynamicField meta={fieldMeta} fieldKey="listing_platforms" fallbackLabel="Where is your property currently listed?" className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    {fieldOptions(fieldMeta, "listing_platforms", LISTING_PLATFORMS).map((opt) => (
                      <div key={opt.value} className="flex items-center gap-2">
                        <Checkbox
                          id={`lp-${opt.value}`}
                          checked={listingPlatforms.includes(opt.value)}
                          onCheckedChange={() => toggleArray("listing_platforms", opt.value, listingPlatforms)}
                        />
                        <Label htmlFor={`lp-${opt.value}`} className="text-sm font-normal">{opt.label}</Label>
                      </div>
                    ))}
                  </div>
                  {/* #8: Other text field for listing platforms */}
                  {listingPlatforms.includes("Other") && (
                    <Input placeholder="Please specify other platforms" {...register("listing_platforms_other")} />
                  )}
                </DynamicField>
              </>
            )}

            {/* ═══ Step 3: Investor Per-Property Details ═══ */}
            {step === 3 && isInvestor && (
              <div key={`inv-step3-${propIdx}`} className="contents">
                {/* Property sub-navigation header */}
                <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
                  <div>
                    <p className="text-sm font-medium">
                      Property {propIdx + 1} of {propertyCount}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {cities[propIdx] || "No city"} &mdash; ${(rents[propIdx] || 0).toLocaleString()} CAD/mo
                    </p>
                  </div>
                  {rents[propIdx] > 0 && (() => {
                    const portfolio = getPortfolio(rents[propIdx]);
                    return (
                      <span className={`rounded-full px-3 py-1 text-xs font-medium ${portfolio.bgColor} ${portfolio.color}`}>
                        {portfolio.name} Portfolio
                      </span>
                    );
                  })()}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <DynamicField meta={fieldMeta} fieldKey="property_type" fallbackLabel="Property type">
                    <Select value={invProp.property_type || undefined} onValueChange={(val: string | null) => val && setInvProp("property_type", val)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {fieldOptions(fieldMeta, "property_type", PROPERTY_TYPES).map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </DynamicField>
                  <DynamicField meta={fieldMeta} fieldKey="occupancy_status" fallbackLabel="Occupancy status">
                    <Select value={invProp.occupancy_status} onValueChange={(val: string | null) => val && setInvProp("occupancy_status", val)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        {fieldOptions(fieldMeta, "occupancy_status", OCCUPANCY_OPTIONS).map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </DynamicField>
                </div>

                {invProp.occupancy_status === "occupied" && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                    <DynamicField meta={fieldMeta} fieldKey="vacancy_date" fallbackLabel="When does the property become available?">
                      <Input type="date" value={invProp.vacancy_date} onChange={(e) => setInvProp("vacancy_date", e.target.value)} />
                    </DynamicField>
                  </div>
                )}

                <DynamicField meta={fieldMeta} fieldKey="availability_date" fallbackLabel="Availability date">
                  <Input type="date" value={invProp.availability_date} onChange={(e) => setInvProp("availability_date", e.target.value)} />
                </DynamicField>

                <div className="grid grid-cols-3 gap-4">
                  <DynamicField meta={fieldMeta} fieldKey="bedrooms" fallbackLabel="Bedrooms">
                    <Select value={invProp.bedrooms || undefined} onValueChange={(val: string | null) => val && setInvProp("bedrooms", val)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {fieldOptions(fieldMeta, "bedrooms", BEDROOMS.map((b) => ({ value: b.replace(" BR", ""), label: b }))).map((b) => (
                          <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </DynamicField>
                  <DynamicField meta={fieldMeta} fieldKey="bathrooms" fallbackLabel="Bathrooms">
                    <Select value={invProp.bathrooms || undefined} onValueChange={(val: string | null) => val && setInvProp("bathrooms", val)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {fieldOptions(fieldMeta, "bathrooms", BATHROOMS).map((b) => (
                          <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </DynamicField>
                  <DynamicField meta={fieldMeta} fieldKey="area_sqft" fallbackLabel="Size">
                    <div className="flex gap-1">
                      <Input
                        type="number"
                        placeholder="800"
                        value={invProp.area_sqft}
                        onChange={(e) => setInvProp("area_sqft", e.target.value ? Number(e.target.value) : "")}
                        className="min-w-0"
                      />
                      <Select value={invProp.area_unit} onValueChange={(v: string | null) => v && setInvProp("area_unit", v as "sqft" | "m2")}>
                        <SelectTrigger className="w-20 shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sqft">ft²</SelectItem>
                          <SelectItem value="m2">m²</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </DynamicField>
                </div>

                <DynamicField meta={fieldMeta} fieldKey="style" fallbackLabel="Style">
                  <Select value={invProp.style || undefined} onValueChange={(val: string | null) => val && setInvProp("style", val)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select style" />
                    </SelectTrigger>
                    <SelectContent>
                      {fieldOptions(fieldMeta, "style", STYLES).map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </DynamicField>

                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  {[
                    { id: `inv-dishwasher-${propIdx}`, label: "Dishwasher", field: "dishwasher" as const },
                    { id: `inv-pet-${propIdx}`, label: "Pet-friendly", field: "pet_friendly" as const },
                    { id: `inv-shared-${propIdx}`, label: "Shared unit", field: "shared_unit" as const },
                    { id: `inv-furnished-${propIdx}`, label: "Furnished", field: "furnished" as const },
                    { id: `inv-utilities-${propIdx}`, label: "Utilities included", field: "utilities_included" as const },
                  ].map(({ id, label, field }) => (
                    <div key={id} className="flex items-center gap-2">
                      <Checkbox
                        id={id}
                        checked={invProp[field] as boolean}
                        onCheckedChange={(c) => setInvProp(field, c === true)}
                      />
                      <Label htmlFor={id} className="font-normal">{label}</Label>
                    </div>
                  ))}
                </div>

                <DynamicField meta={fieldMeta} fieldKey="amenities" fallbackLabel="Amenities" className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    {fieldOptions(fieldMeta, "amenities", AMENITIES).map((opt) => (
                      <div key={opt.value} className="flex items-center gap-2">
                        <Checkbox
                          id={`inv-am-${propIdx}-${opt.value}`}
                          checked={invProp.amenities.includes(opt.value)}
                          onCheckedChange={() => toggleInvArray("amenities", opt.value)}
                        />
                        <Label htmlFor={`inv-am-${propIdx}-${opt.value}`} className="text-sm font-normal">{opt.label}</Label>
                      </div>
                    ))}
                  </div>
                </DynamicField>

                <DynamicField meta={fieldMeta} fieldKey="listing_platforms" fallbackLabel="Where is this property currently listed?" className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    {fieldOptions(fieldMeta, "listing_platforms", LISTING_PLATFORMS).map((opt) => (
                      <div key={opt.value} className="flex items-center gap-2">
                        <Checkbox
                          id={`inv-lp-${propIdx}-${opt.value}`}
                          checked={invProp.listing_platforms.includes(opt.value)}
                          onCheckedChange={() => toggleInvArray("listing_platforms", opt.value)}
                        />
                        <Label htmlFor={`inv-lp-${propIdx}-${opt.value}`} className="text-sm font-normal">{opt.label}</Label>
                      </div>
                    ))}
                  </div>
                </DynamicField>

                {/* CFP Preview for this property */}
                {rents[propIdx] > 0 && (() => {
                  const rent = rents[propIdx];
                  const portfolio = getPortfolio(rent);
                  const portfolioFee = PORTFOLIO_FEES[portfolio.key];
                  const cfp = rent * CFP_RATE;
                  const payback = cfp > 0 ? portfolioFee.monthlyFee / cfp : 0;
                  return (
                    <div className="rounded-lg border bg-emerald-50 p-4 space-y-2">
                      <p className="text-sm font-medium text-emerald-700">Financial Preview — Property {propIdx + 1} ({portfolio.name})</p>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div>
                          <p className="text-xs text-muted-foreground">Rent</p>
                          <p className="text-sm font-semibold">${rent.toLocaleString()}/mo</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">CFP (10% rent)</p>
                          <p className="text-sm font-semibold text-emerald-600">${cfp.toFixed(2)}/mo</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">One-time Fee</p>
                          <p className="text-sm font-semibold">${portfolioFee.oneTime.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Payback ({`$${portfolioFee.monthlyFee}/CFP`})</p>
                          <p className="text-sm font-semibold">{payback.toFixed(1)} months</p>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground pt-1 border-t">
                        Portfolio monthly fee: ${portfolioFee.monthlyFee} (shared across all {portfolio.name} properties)
                      </p>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ═══ Step 4: Zone & Location (Owner) ═══ */}
            {step === 4 && !isInvestor && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <DynamicField meta={fieldMeta} fieldKey="city" fallbackLabel="City" htmlFor="zone_city">
                    <Select
                      value={(watch("zone_city") as string) ?? ""}
                      onValueChange={(val: string | null) => val && setValue("zone_city", val)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select city" />
                      </SelectTrigger>
                      <SelectContent>
                        {fieldOptions(fieldMeta, "city", BC_CITIES).map((c) => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.zone_city && (
                      <p className="text-sm text-destructive" data-error="true">{errors.zone_city.message}</p>
                    )}
                  </DynamicField>
                  <div className="space-y-2">
                    <Label htmlFor="postal_code">Postal code</Label>
                    <Input id="postal_code" placeholder="V6B 1A1" {...register("postal_code")} />
                  </div>
                </div>

                <DynamicField meta={fieldMeta} fieldKey="address" fallbackLabel="Address" htmlFor="address">
                  <Input id="address" placeholder="123 Main St" {...register("address")} />
                  {errors.address && (
                    <p className="text-sm text-destructive" data-error="true">{errors.address.message}</p>
                  )}
                </DynamicField>

                <div className="space-y-3">
                  <Label>Nearby features</Label>
                  {[
                    { id: "near_parks", label: "Parks nearby", field: "near_parks" as const },
                    { id: "near_churches", label: "Churches nearby", field: "near_churches" as const },
                    { id: "near_bus", label: "Bus stop nearby", field: "near_bus" as const },
                    { id: "near_mall", label: "Shopping mall nearby", field: "near_mall" as const },
                  ].map(({ id, label, field }) => (
                    <div key={id} className="flex items-center gap-2">
                      <Checkbox
                        id={id}
                        checked={watch(field) as boolean}
                        onCheckedChange={(c) => setValue(field, c === true)}
                      />
                      <Label htmlFor={id} className="font-normal">{label}</Label>
                    </div>
                  ))}

                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="near_skytrain"
                      checked={nearSkytrain}
                      onCheckedChange={(c) => setValue("near_skytrain", c === true)}
                    />
                    <Label htmlFor="near_skytrain" className="font-normal">SkyTrain nearby</Label>
                  </div>
                  {nearSkytrain && (
                    <div className="ml-6 space-y-2">
                      <Label className="text-sm">Which line?</Label>
                      {fieldOptions(fieldMeta, "skytrain_lines", SKYTRAIN_LINES).map((opt) => (
                        <div key={opt.value} className="flex items-center gap-2">
                          <Checkbox
                            id={`sky-${opt.value}`}
                            checked={skytrainLines.includes(opt.value)}
                            onCheckedChange={() => toggleArray("skytrain_lines", opt.value, skytrainLines)}
                          />
                          <Label htmlFor={`sky-${opt.value}`} className="text-sm font-normal">{opt.label}</Label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <DynamicField meta={fieldMeta} fieldKey="social_life" fallbackLabel="Social life nearby (optional)" htmlFor="social_life">
                  <Input
                    id="social_life"
                    placeholder="e.g. bars, cinemas, entertainment..."
                    {...register("social_life")}
                  />
                </DynamicField>

                <DynamicField meta={fieldMeta} fieldKey="nearby_supermarkets" fallbackLabel="Nearby supermarkets" className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    {fieldOptions(fieldMeta, "nearby_supermarkets", SUPERMARKETS).map((opt) => (
                      <div key={opt.value} className="flex items-center gap-2">
                        <Checkbox
                          id={`sm-${opt.value}`}
                          checked={supermarkets.includes(opt.value)}
                          onCheckedChange={() => toggleArray("nearby_supermarkets", opt.value, supermarkets)}
                        />
                        <Label htmlFor={`sm-${opt.value}`} className="text-sm font-normal">{opt.label}</Label>
                      </div>
                    ))}
                  </div>
                </DynamicField>
              </>
            )}

            {/* ═══ Step 4: Zone & Location (Investor per-property) ═══ */}
            {step === 4 && isInvestor && (
              <div key={`inv-step4-${propIdx}`} className="contents">
                <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
                  <div>
                    <p className="text-sm font-medium">
                      Property {propIdx + 1} of {propertyCount} — Location
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {cities[propIdx] || "No city"} &mdash; ${(rents[propIdx] || 0).toLocaleString()} CAD/mo
                    </p>
                  </div>
                  {rents[propIdx] > 0 && (() => {
                    const portfolio = getPortfolio(rents[propIdx]);
                    return (
                      <span className={`rounded-full px-3 py-1 text-xs font-medium ${portfolio.bgColor} ${portfolio.color}`}>
                        {portfolio.name}
                      </span>
                    );
                  })()}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <DynamicField meta={fieldMeta} fieldKey="city" fallbackLabel="City">
                    <p className="text-sm font-medium px-3 py-2 rounded-md bg-muted">{cities[propIdx] || "Not set"}</p>
                    <p className="text-xs text-muted-foreground">Set in Step 2</p>
                  </DynamicField>
                  <DynamicField meta={fieldMeta} fieldKey="postal_code" fallbackLabel="Postal code">
                    <Input
                      placeholder="V6B 1A1"
                      value={invProp.postal_code}
                      onChange={(e) => setInvProp("postal_code", e.target.value)}
                    />
                  </DynamicField>
                </div>

                <DynamicField meta={fieldMeta} fieldKey="address" fallbackLabel="Address">
                  <Input
                    placeholder="123 Main St"
                    value={invProp.address}
                    onChange={(e) => setInvProp("address", e.target.value)}
                  />
                </DynamicField>

                <div className="space-y-3">
                  <Label>Nearby features</Label>
                  {[
                    { label: "Parks nearby", field: "near_parks" as const },
                    { label: "Churches nearby", field: "near_churches" as const },
                    { label: "Bus stop nearby", field: "near_bus" as const },
                    { label: "Shopping mall nearby", field: "near_mall" as const },
                  ].map(({ label, field }) => (
                    <div key={field} className="flex items-center gap-2">
                      <Checkbox
                        id={`inv-${field}-${propIdx}`}
                        checked={invProp[field]}
                        onCheckedChange={(c) => setInvProp(field, c === true)}
                      />
                      <Label htmlFor={`inv-${field}-${propIdx}`} className="font-normal">{label}</Label>
                    </div>
                  ))}

                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`inv-skytrain-${propIdx}`}
                      checked={invProp.near_skytrain}
                      onCheckedChange={(c) => setInvProp("near_skytrain", c === true)}
                    />
                    <Label htmlFor={`inv-skytrain-${propIdx}`} className="font-normal">SkyTrain nearby</Label>
                  </div>
                  {invProp.near_skytrain && (
                    <div className="ml-6 space-y-2">
                      <Label className="text-sm">Which line?</Label>
                      {fieldOptions(fieldMeta, "skytrain_lines", SKYTRAIN_LINES).map((opt) => (
                        <div key={opt.value} className="flex items-center gap-2">
                          <Checkbox
                            id={`inv-sky-${propIdx}-${opt.value}`}
                            checked={invProp.skytrain_lines.includes(opt.value)}
                            onCheckedChange={() => toggleInvArray("skytrain_lines", opt.value)}
                          />
                          <Label htmlFor={`inv-sky-${propIdx}-${opt.value}`} className="text-sm font-normal">{opt.label}</Label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <DynamicField meta={fieldMeta} fieldKey="social_life" fallbackLabel="Social life nearby (optional)">
                  <Input
                    placeholder="e.g. bars, cinemas, entertainment..."
                    value={invProp.social_life}
                    onChange={(e) => setInvProp("social_life", e.target.value)}
                  />
                </DynamicField>

                <DynamicField meta={fieldMeta} fieldKey="nearby_supermarkets" fallbackLabel="Nearby supermarkets" className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    {fieldOptions(fieldMeta, "nearby_supermarkets", SUPERMARKETS).map((opt) => (
                      <div key={opt.value} className="flex items-center gap-2">
                        <Checkbox
                          id={`inv-sm-${propIdx}-${opt.value}`}
                          checked={invProp.nearby_supermarkets.includes(opt.value)}
                          onCheckedChange={() => toggleInvArray("nearby_supermarkets", opt.value)}
                        />
                        <Label htmlFor={`inv-sm-${propIdx}-${opt.value}`} className="text-sm font-normal">{opt.label}</Label>
                      </div>
                    ))}
                  </div>
                </DynamicField>
              </div>
            )}

            {/* ═══ Step 5: Property Photos (Owner) ═══ */}
            {step === 5 && !isInvestor && (
              <ImageUpload
                images={propertyImages}
                onImagesChange={setPropertyImages}
                maxImages={20}
              />
            )}

            {/* ═══ Step 5: Per-property photos (Investor #11, #12) ═══ */}
            {step === 5 && isInvestor && (
              <div key={`inv-photos-${propIdx}`} className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
                  <div>
                    <p className="text-sm font-medium">
                      Photos for Property {propIdx + 1} of {propertyCount}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {cities[propIdx] || "No city"} &mdash; {investorProps[propIdx]?.address || "No address"}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {(investorPropertyImages[propIdx] || []).length} photos uploaded
                  </span>
                </div>

                <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                  <p className="text-sm font-medium text-amber-800">Required for each property:</p>
                  <p className="text-xs text-amber-700 mt-1">
                    Upload at least 1 photo per required room (Living Room, Kitchen, Bedroom, Bathroom, Exterior).
                    All properties must have photos before you can continue.
                  </p>
                </div>

                <ImageUpload
                  images={investorPropertyImages[propIdx] || []}
                  onImagesChange={(imgs) => {
                    setInvestorPropertyImages((prev) => {
                      const arr = [...prev];
                      arr[propIdx] = imgs;
                      return arr;
                    });
                  }}
                  maxImages={20}
                />

                {/* Progress summary across all properties */}
                <div className="rounded-md border bg-card p-3">
                  <p className="text-xs font-medium mb-2">All Properties Photo Status:</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
                    {Array.from({ length: propertyCount }).map((_, i) => {
                      const imgs = investorPropertyImages[i] || [];
                      const requiredRooms = ["living_room", "kitchen", "bedroom", "bathroom", "exterior"];
                      const covered = new Set(imgs.map((img) => img.room));
                      const coveredCount = requiredRooms.filter((r) => covered.has(r)).length;
                      const isComplete = coveredCount === requiredRooms.length;
                      const isCurrent = i === propIdx;
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setPropIdx(i)}
                          className={`rounded-md border p-2 text-xs text-left transition-colors ${
                            isCurrent
                              ? "border-primary bg-primary/5"
                              : isComplete
                                ? "border-green-300 bg-green-50 text-green-700"
                                : coveredCount > 0
                                  ? "border-yellow-300 bg-yellow-50 text-yellow-700"
                                  : "border-red-300 bg-red-50 text-red-700"
                          }`}
                        >
                          <p className="font-medium">Property {i + 1}</p>
                          <p className="text-[10px]">{coveredCount}/{requiredRooms.length} rooms</p>
                          <p className="text-[10px]">{imgs.length} photo{imgs.length !== 1 ? "s" : ""}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ═══ Step 6: Legal Consents ═══ */}
            {step === 6 && (
              <div className="space-y-4">
                {[
                  {
                    id: "consent_image",
                    field: "consent_image_usage" as const,
                    label: "I authorize the use and editing of property images for commercial purposes.",
                  },
                  {
                    id: "consent_data",
                    field: "consent_data_processing" as const,
                    label: "I accept the rights and privacy declaration.",
                  },
                  {
                    id: "consent_comms",
                    field: "consent_marketing" as const,
                    label: "I consent to electronic communications (CASL).",
                  },
                  {
                    id: "consent_terms",
                    field: "consent_third_party" as const,
                    label: "I accept the terms and conditions.",
                  },
                  // Steve 4/21 #16: 3 additional consents
                  {
                    id: "consent_legal_rep",
                    field: "consent_legal_representation" as const,
                    label: "I authorize legal representation by Nexuma marketing ltd for matters related to marketing and tenant placement.",
                  },
                  {
                    id: "consent_liability",
                    field: "consent_liability_limitation" as const,
                    label: "I accept the limitation of liability outlined in the service agreement.",
                  },
                  {
                    id: "consent_esignature",
                    field: "consent_electronic_signature" as const,
                    label: "I consent to use electronic signatures and acknowledge their legal validity.",
                  },
                ].map(({ id, field, label }) => {
                  // Steve 5/15: the short checkbox label (one-line
                  // summary like "I authorize image usage...") was
                  // hardcoded. Admins editing form_questions.label for
                  // the matching consent field_key saw no effect on
                  // this form. Apply the fieldDisplay overlay so the
                  // label, helper text, and required flag honor admin
                  // edits — the full document text (expanded via "Read
                  // full document") already pulls from legal_documents
                  // via useLegalDocsOverlay.
                  const display = fieldDisplay(fieldMeta, field, { label });
                  if (display.hidden) return null;
                  return (
                  <div key={id} className="rounded-lg border p-3">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id={id}
                        checked={watch(field) as boolean}
                        onCheckedChange={(c) => setValue(field, c === true, { shouldValidate: true })}
                      />
                      <div className="flex-1">
                        <Label htmlFor={id} className="text-sm font-normal leading-relaxed">
                          {display.label}
                          {display.required && <span className="ml-1 text-red-500">*</span>}
                        </Label>
                        {display.helper && (
                          <p className="text-xs text-muted-foreground mt-0.5">{display.helper}</p>
                        )}
                        {/* #29: Read full document button */}
                        <button
                          type="button"
                          className="mt-1 flex items-center gap-1 text-xs text-primary hover:underline"
                          onClick={() => setExpandedLegal(expandedLegal === field ? null : field)}
                        >
                          <FileText className="h-3 w-3" />
                          {expandedLegal === field ? "Hide full document" : "Read full document"}
                        </button>
                        {expandedLegal === field && LEGAL_DOCS[field] && (() => {
                          const ts = legalUpdatedAt(field as keyof typeof LEGAL_DOCS);
                          return (
                            <div className="mt-2 rounded-md bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
                              <p className="font-medium text-foreground mb-1">{LEGAL_DOCS[field].title}</p>
                              {legalText(field as keyof typeof LEGAL_DOCS)}
                              {/* Steve 5/11: timestamp + source so the
                                  client can verify whether admin edits
                                  reached this form. "DB" = pulled from
                                  legal_documents; "fallback" = hardcoded
                                  text because the DB row is missing. */}
                              <p className="mt-2 pt-2 border-t border-border/50 text-[10px] text-muted-foreground/70">
                                {ts
                                  ? `Source: legal_documents · last updated ${new Date(ts).toLocaleString()}`
                                  : "Source: hardcoded fallback (no DB row for this consent — ask admin to seed it)"}
                              </p>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                    {errors[field] && (
                      <p className="mt-1 ml-7 text-sm text-destructive" data-error="true">
                        {(errors[field] as { message?: string })?.message}
                      </p>
                    )}
                  </div>
                  );
                })}

                {/* Review summary */}
                <div className="rounded-lg border bg-primary/5 p-4 mt-4 space-y-3">
                  <div>
                    <p className="text-sm font-medium text-primary">Your service tier:</p>
                    <p className="mt-1 text-lg font-bold">{getServiceTier(propertyCount)}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {propertyCount} {propertyCount === 1 ? "property" : "properties"} in British Columbia
                    </p>
                  </div>

                  {/* Investor portfolio summary */}
                  {isInvestor && investorProps.length > 0 && (
                    <div className="space-y-2 border-t pt-3">
                      <p className="text-sm font-medium">Portfolio Assignment Summary</p>
                      {investorProps.slice(0, propertyCount).map((ip, i) => {
                        const rent = rents[i] || 0;
                        const portfolio = getPortfolio(rent);
                        const cfp = rent * CFP_RATE;
                        return (
                          <div key={i} className="flex items-center justify-between rounded-md border p-2 text-sm">
                            <div>
                              <span className="font-medium">#{i + 1}</span>{" "}
                              <span className="text-muted-foreground">{cities[i]} &mdash; ${rent.toLocaleString()}/mo</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${portfolio.bgColor} ${portfolio.color}`}>
                                {portfolio.name}
                              </span>
                              <span className="text-xs text-emerald-600 font-medium">CFP ${cfp.toFixed(0)}/mo</span>
                            </div>
                          </div>
                        );
                      })}
                      <div className="rounded-md bg-emerald-50 border border-emerald-200 p-2 text-sm text-emerald-700 font-medium">
                        Total Portfolio CFP: ${investorProps.slice(0, propertyCount).reduce((sum, _, i) => {
                          const rent = rents[i] || 0;
                          return sum + (rent * CFP_RATE);
                        }, 0).toFixed(2)} CAD/mo
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>

          {/* Navigation */}
          <div className="flex justify-between px-6 pb-6">
            {step > 1 || (isInvestor && propIdx > 0) ? (
              <Button type="button" variant="ghost" onClick={() => {
                if (isInvestor && (step === 3 || step === 4) && propIdx > 0) {
                  setPropIdx(propIdx - 1);
                } else if (isInvestor && step === 4 && propIdx === 0) {
                  setPropIdx(propertyCount - 1);
                  setStep(3);
                } else {
                  setStep(step - 1);
                }
              }} className="gap-1">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            ) : (
              <div />
            )}
            {step < TOTAL_STEPS ? (
              <Button type="button" onClick={nextStep} className="gap-1">
                Next
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button type="submit" disabled={loading} className="gap-1">
                {loading ? "Submitting..." : "Submit"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}
