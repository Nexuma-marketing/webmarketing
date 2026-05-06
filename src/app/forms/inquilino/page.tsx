"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import { tenantFormSchema, type TenantFormData } from "@/types/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { FileText } from "lucide-react";
import { useFormFieldMeta, fieldDisplay, fieldOptions } from "@/lib/form-meta";
import { DynamicField } from "@/components/forms/dynamic-field";
import { logConsents } from "@/lib/consent-log";

// ─── Legal document texts ────────────────────────────
const LEGAL_DOCS: Record<string, { title: string; text: string }> = {
  consent_data_processing: {
    title: "Data Processing, Screening & Communications Consent",
    text: "In accordance with the Personal Information Protection Act (PIPA) of British Columbia and the Personal Information Protection and Electronic Documents Act (PIPEDA) of Canada, you consent to the collection, use, and processing of your personal information for the purpose of tenant matching, background screening, reference verification, and electronic communications. Your data is stored securely and will not be shared with unauthorized third parties. You may withdraw consent at any time by contacting privacy@nexuma.ca. This consent covers: (1) Background and credit screening via authorized services, (2) Verification of references provided, (3) Electronic communications regarding property matches and service updates, and (4) Marketing communications (optional). You have the right to access, correct, and request deletion of your personal data.",
  },
  consent_screening: {
    title: "Background Screening Consent (PIPA/PIPEDA)",
    text: "You authorize Nexuma marketing ltd and its designated screening partners to conduct background checks, including but not limited to: credit history verification, criminal record checks, and previous rental history verification. This screening is conducted in compliance with the Personal Information Protection Act (PIPA) of British Columbia and PIPEDA. Results are confidential and used solely for tenant qualification purposes.",
  },
  consent_references: {
    title: "Reference Verification Consent",
    text: "You authorize Nexuma marketing ltd to contact the references you have provided, including previous landlords, employers, and personal references, to verify the information provided in your application. All information obtained will be kept confidential and used solely for the purpose of evaluating your tenancy application.",
  },
  consent_communications: {
    title: "Electronic Communications Consent (CASL)",
    text: "In compliance with Canada's Anti-Spam Legislation (CASL), you consent to receive commercial electronic messages from Nexuma marketing ltd including service updates, property match notifications, and relevant information about your tenancy search. You may unsubscribe at any time.",
  },
  consent_truthfulness: {
    title: "Declaration of Truthfulness",
    text: "You declare that all information provided in this form is true, accurate, and complete to the best of your knowledge. You understand that providing false or misleading information may result in the termination of services and potential legal consequences.",
  },
  consent_marketing: {
    title: "Marketing Communications Consent (Optional)",
    text: "You optionally consent to receive marketing communications, newsletters, and promotional offers from Nexuma marketing ltd and its partners. This consent is not required for service and can be withdrawn at any time.",
  },
};

// ─── BC Cities (PDF 5.3.1) ──────────────────────────
const BC_ZONES = [
  "Downtown",
  "Surrey",
  "Burnaby",
  "Vancouver",
  "Victoria",
  "North Vancouver",
  "Metrotown",
];

// ─── Employment types (PDF 5.3.1) ───────────────────
const EMPLOYMENT_TYPES = [
  { value: "full_time", label: "Full-time employment" },
  { value: "part_time", label: "Part-time employment" },
  { value: "contract", label: "Temporary contract" },
  { value: "self_employed", label: "Self-employed / Business owner" },
  { value: "international_student", label: "International student" },
];

// ─── Institution types (conditional for students) ───
const INSTITUTION_TYPES = [
  { value: "university", label: "University" },
  { value: "college", label: "College" },
  { value: "language_school", label: "Language school" },
  { value: "co_op", label: "Co-Op program" },
  { value: "exchange", label: "Exchange program" },
  { value: "other", label: "Other" },
];

// ─── Number of people (PDF) ─────────────────────────
const PEOPLE_OPTIONS = [
  "1 person",
  "Couple",
  "Family of 3",
  "Family of 4",
  "Family of 5",
  "Family of 6",
  "Family of 7",
  "More",
];

// ─── Property types desired (PDF 5.3.1 12+ options) ─
const PROPERTY_TYPES = [
  "Full house / apartment / basement (not shared)",
  "Shared house / apartment / basement",
  "Private room & private bathroom",
  "Private room & shared bathroom",
  "Shared room & shared bathroom",
  "Suite",
  "Penthouse",
  "Den",
  "Smart home",
  "Modern & elegant style",
  "Pet Friendly",
];

// ─── Amenities (PDF 16+ options) ────────────────────
const AMENITIES = [
  "Gym",
  "Rooftop",
  "Coworking",
  "Pool",
  "Jacuzzi",
  "Sauna",
  "Covered parking",
  "Open parking",
  "Private parking",
  "In-unit laundry (washer & dryer)",
  "Building laundry (paid)",
  "In-unit washer only",
  "Fireplace",
  "Internet",
  "Airfryer",
  "Other",
];

// ─── Common areas ───────────────────────────────────
const COMMON_AREAS = [
  "BBQ zone",
  "SPA",
  "Billiards / Game room",
  "Pool",
];

// ─── Bedrooms / Bathrooms ───────────────────────────
const BEDROOM_OPTIONS = ["1 BR", "2 BR", "3 BR", "4 BR", "5 BR", "6 BR", "7 BR"];
const BATHROOM_OPTIONS = ["1 Bath", "1.5 Bath", "2 Bath", "2.5 Bath", "3 Bath", "3.5 Bath"];

// ─── Contract durations (PDF 7 options) ─────────────
const CONTRACT_DURATIONS = [
  { value: "1_month", label: "1 month" },
  { value: "2_months", label: "2 months" },
  { value: "3_months", label: "3 months" },
  { value: "4_6_months", label: "4 to 6 months" },
  { value: "6_8_months", label: "6 to 8 months" },
  { value: "12_months", label: "12 months" },
  { value: "12_24_months", label: "12 to 24 months" },
];

// ─── Style preferences ─────────────────────────────
const STYLE_PREFS = [
  { value: "modern", label: "Modern" },
  { value: "minimalist", label: "Minimalist" },
  { value: "classic", label: "Classic" },
  { value: "elegant", label: "Elegant" },
  { value: "other", label: "Other" },
];

// ─── SkyTrain lines ─────────────────────────────────
const SKYTRAIN_LINES = ["Millennium Line", "Canada Line", "Expo Line"];

// ─── Smart home features ────────────────────────────
const SMART_HOME_FEATURES = ["Smart locks", "Keyless entry card", "Other"];

// ─── Premium classification (PDF 5.3.2) ─────────────
function countPremiumCriteria(data: TenantFormData): number {
  let count = 0;
  // 1. Employment: full_time, self_employed, or student at qualifying uni
  if (data.employment_type === "full_time" || data.employment_type === "self_employed") count++;
  if (data.employment_type === "international_student" && data.institution_type === "university") count++;
  // 2. Budget >= $2500
  if (data.max_budget >= 2500) count++;
  // 3. Premium amenities (gym, rooftop, coworking, jacuzzi, private parking)
  const premiumAmenities = ["Gym", "Rooftop", "Coworking", "Jacuzzi", "Private parking"];
  if (data.preferred_amenities.some((a) => premiumAmenities.includes(a))) count++;
  // 4. Prefers urban elegant zone
  if (data.prefers_urban_zone) count++;
  // 5. 2BR - 4BR
  const brNum = parseInt(data.bedrooms_needed);
  if (brNum >= 2 && brNum <= 4) count++;
  // 6. Smart home interest
  if (data.smart_home_interest) count++;
  // 7. Modern/elegant style + furnished
  if ((data.style_preference === "modern" || data.style_preference === "elegant") && data.furnished) count++;
  // 8. Contract 12-24 months
  if (data.contract_duration === "12_months" || data.contract_duration === "12_24_months") count++;
  return count;
}

const TOTAL_STEPS = 5;

export default function TenantFormPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [otherZone, setOtherZone] = useState("");
  const [showConsentDetails, setShowConsentDetails] = useState(false);
  const [expandedLegal, setExpandedLegal] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  // Steve 4/28 round 2: load admin-editable form metadata so changes
  // in /admin/forms (label, helper text, required, visibility) are
  // reflected on this user-facing page without redeploys.
  const fieldMeta = useFormFieldMeta("tenant_preferences");
  const fld = (key: string, label: string, helper?: string | null, required?: boolean) =>
    fieldDisplay(fieldMeta, key, { label, helper, required });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
    trigger,
  } = useForm<TenantFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(tenantFormSchema) as any,
    defaultValues: {
      preferred_zones: [],
      preferred_amenities: [],
      property_type_desired: [],
      common_areas: [],
      skytrain_lines: [],
      smart_home_features: [],
      pet_friendly: false,
      parking_needed: false,
      furnished: false,
      utilities_included: false,
      smart_home_interest: false,
      near_bus: false,
      near_skytrain: false,
      near_social: false,
      near_banks: false,
      near_downtown: false,
      prefers_urban_zone: false,
      move_in_flexible: false,
      consent_data_processing: false,
      consent_screening: false,
      consent_references: false,
      consent_communications: false,
      consent_truthfulness: false,
      consent_marketing: false,
      size_unit: "sqft",
    },
  });

  const zones = watch("preferred_zones") as string[];
  const amenities = watch("preferred_amenities") as string[];
  const propertyTypes = watch("property_type_desired") as string[];
  const commonAreas = watch("common_areas") as string[];
  const skytrainLines = watch("skytrain_lines") as string[];
  const smartHomeFeatures = watch("smart_home_features") as string[];
  const employmentType = watch("employment_type") as string | undefined;
  const numberOfPeople = watch("number_of_people") as string | undefined;
  const bedroomsNeeded = watch("bedrooms_needed") as string | undefined;
  const bathroomsNeeded = watch("bathrooms_needed") as string | undefined;
  const contractDuration = watch("contract_duration") as string | undefined;
  const levelsPreferred = watch("levels_preferred") as string | undefined;
  const stylePreference = watch("style_preference") as string | undefined;
  const nearSkytrain = watch("near_skytrain") as boolean;
  const smartHomeInterest = watch("smart_home_interest") as boolean;

  function toggleArrayField(field: keyof TenantFormData, value: string, currentArr: string[]) {
    const next = currentArr.includes(value)
      ? currentArr.filter((v) => v !== value)
      : [...currentArr, value];
    setValue(field, next as never);
  }

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
    let fieldsToValidate: (keyof TenantFormData)[] = [];
    if (step === 1) fieldsToValidate = ["employment_type", "number_of_people", "property_type_desired"];
    if (step === 2) fieldsToValidate = ["preferred_zones", "bedrooms_needed", "bathrooms_needed"];
    if (step === 3) fieldsToValidate = ["min_budget", "max_budget", "move_in_date", "contract_duration"];

    const valid = fieldsToValidate.length === 0 || (await trigger(fieldsToValidate));
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

  async function onSubmit(data: TenantFormData) {
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const premiumCount = countPremiumCriteria(data);
      const isPremium = premiumCount >= 3;

      const { data: existing } = await supabase
        .from("tenant_preferences")
        .select("id")
        .eq("user_id", user.id)
        .single();

      const payload = {
        user_id: user.id,
        preferred_city: "British Columbia",
        preferred_zones: data.preferred_zones,
        min_budget: data.min_budget,
        max_budget: data.max_budget,
        bedrooms_needed: parseInt(data.bedrooms_needed),
        bathrooms_needed: Math.floor(parseFloat(data.bathrooms_needed.replace(" Bath", ""))),
        move_in_date: data.move_in_date,
        move_in_flexible: data.move_in_flexible,
        employment_type: data.employment_type,
        // Steve Old#1 (4/19 expanded): employment_verifiable removed for ALL tenants (legal)
        employment_verifiable: false,
        institution_type: data.institution_type || null,
        institution_name: data.institution_name || null,
        number_of_people: data.number_of_people,
        property_type_desired: data.property_type_desired,
        seeks_premium_amenities: data.preferred_amenities.some((a) =>
          ["Gym", "Rooftop", "Coworking", "Jacuzzi", "Private parking"].includes(a)
        ),
        preferred_amenities: data.preferred_amenities,
        prefers_urban_zone: data.prefers_urban_zone,
        smart_home_interest: data.smart_home_interest,
        style_preference: data.style_preference || null,
        contract_duration: data.contract_duration,
        furnished: data.furnished,
        utilities_included: data.utilities_included,
        levels_preferred: data.levels_preferred || null,
        size_sqft: typeof data.size_sqft === "number" ? data.size_sqft : null,
        common_areas: data.common_areas,
        near_bus: data.near_bus,
        skytrain_lines: data.skytrain_lines,
        near_social: data.near_social,
        near_banks: data.near_banks,
        near_downtown: data.near_downtown,
        premium_criteria_count: premiumCount,
        is_premium: isPremium,
        consent_data_processing: data.consent_data_processing,
        consent_screening: data.consent_screening,
        consent_references: data.consent_references,
        consent_communications: data.consent_communications,
        consent_truthfulness: data.consent_truthfulness,
        consent_marketing: data.consent_marketing,
        pet_friendly: data.pet_friendly,
        parking_needed: data.parking_needed,
        additional_requirements: data.additional_requirements || null,
      };

      if (existing) {
        const { error: updateError } = await supabase
          .from("tenant_preferences")
          .update(payload)
          .eq("id", existing.id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from("tenant_preferences")
          .insert(payload);
        if (insertError) throw insertError;
      }

      // Steve 5/4 #7: log every consent the tenant ticked. Non-blocking.
      logConsents(user.id, [
        { type: "data_processing", granted: !!data.consent_data_processing },
        { type: "screening", granted: !!data.consent_screening },
        { type: "references", granted: !!data.consent_references },
        { type: "communications", granted: !!data.consent_communications },
        { type: "truthfulness", granted: !!data.consent_truthfulness },
        { type: "marketing", granted: !!data.consent_marketing },
      ]).catch((err) => console.error("Consent log failed:", err));

      // Run profiling (premium classification + sync to profiles)
      await fetch("/api/profiling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "tenant" }),
      });

      // Create lead
      await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "tenant_form" }),
      });

      // Steve 4/22 #8: Send email to commercial + confirmation to tenant
      await fetch("/api/tenant-submit-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          min_budget: data.min_budget,
          max_budget: data.max_budget,
          bedrooms_needed: data.bedrooms_needed,
          move_in_date: data.move_in_date,
          is_premium: false, // profiling endpoint will classify; email just for heads-up
        }),
      }).catch((err) => console.error("Tenant submit email failed:", err));

      router.push("/dashboard");
    } catch (err) {
      setError("Failed to save preferences. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div ref={formRef} className="mx-auto max-w-2xl px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>Tenant Profile</CardTitle>
          <CardDescription>
            Tell us your preferences to find your ideal home in British Columbia.
            Step {step} of {TOTAL_STEPS}.
          </CardDescription>
          <div className="flex gap-1 pt-2">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((s) => (
              <div
                key={s}
                className={`h-2 flex-1 rounded-full ${s <= step ? "bg-primary" : "bg-muted"}`}
              />
            ))}
          </div>
        </CardHeader>

        <form onSubmit={handleSubmit(onSubmit, () => {
          const errorFields = Object.keys(errors);
          if (errorFields.length > 0) {
            setError(`Please fill in the required fields: ${errorFields.map(f => f.replace(/_/g, " ")).join(", ")}`);
          }
          scrollToFirstError();
        })}>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* ═══ Step 1: Personal & Employment ═══ */}
            {step === 1 && (
              <>
                <DynamicField
                  meta={fieldMeta}
                  fieldKey="employment_type"
                  fallbackLabel="What is your current situation?"
                >
                  <Select
                    value={employmentType}
                    onValueChange={(val: string | null) => {
                      if (!val) return;
                      setValue("employment_type", val as TenantFormData["employment_type"]);
                      if (val === "international_student") {
                        setValue("employment_verifiable", false);
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select your situation" />
                    </SelectTrigger>
                    <SelectContent>
                      {fieldOptions(fieldMeta, "employment_type", EMPLOYMENT_TYPES).map((e) => (
                        <SelectItem key={e.value} value={e.value}>
                          {e.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.employment_type && (
                    <p className="text-sm text-destructive">{errors.employment_type.message}</p>
                  )}
                </DynamicField>

                {/* Student sub-questions */}
                {employmentType === "international_student" && (
                  <div className="space-y-3 rounded-md border p-4">
                    <div className="space-y-2">
                      <Label>Type of institution</Label>
                      <Select value={watch("institution_type") as string | undefined} onValueChange={(val: string | null) => val && setValue("institution_type", val)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select institution type" />
                        </SelectTrigger>
                        <SelectContent>
                          {fieldOptions(fieldMeta, "institution_type", INSTITUTION_TYPES).map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="institution_name">Name of institution (optional)</Label>
                      <Input
                        id="institution_name"
                        placeholder="e.g. University of British Columbia"
                        {...register("institution_name")}
                      />
                    </div>
                  </div>
                )}

                {/* Steve Old#1 (4/19 expanded): employment_verifiable checkbox removed
                    for ALL tenants regardless of current_situation due to legal requirements */}

                <DynamicField
                  meta={fieldMeta}
                  fieldKey="number_of_people"
                  fallbackLabel="How many people are you looking for housing?"
                >
                  <Select value={numberOfPeople} onValueChange={(val: string | null) => val && setValue("number_of_people", val)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select number of people" />
                    </SelectTrigger>
                    <SelectContent>
                      {fieldOptions(fieldMeta, "number_of_people", PEOPLE_OPTIONS).map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.number_of_people && (
                    <p className="text-sm text-destructive">{errors.number_of_people.message}</p>
                  )}
                </DynamicField>

                {(() => { const f = fld("property_type_desired", "Type of property desired", null, true); if (f.hidden) return null; return (
                <div className="space-y-3">
                  <Label>{f.label}</Label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {PROPERTY_TYPES.map((type) => (
                      <div key={type} className="flex items-center gap-2">
                        <Checkbox
                          id={`ptype-${type}`}
                          checked={propertyTypes.includes(type)}
                          onCheckedChange={() => toggleArrayField("property_type_desired", type, propertyTypes)}
                        />
                        <Label htmlFor={`ptype-${type}`} className="text-sm font-normal">
                          {type}
                        </Label>
                      </div>
                    ))}
                  </div>
                  {f.helper && <p className="text-xs text-muted-foreground">{f.helper}</p>}
                  {errors.property_type_desired && (
                    <p className="text-sm text-destructive">{errors.property_type_desired.message}</p>
                  )}
                </div>
                ); })()}
              </>
            )}

            {/* ═══ Step 2: Property Details & Preferences ═══ */}
            {step === 2 && (
              <>
                <div className="space-y-3">
                  <Label>Preferred zone (British Columbia)</Label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {BC_ZONES.map((zone) => (
                      <div key={zone} className="flex items-center gap-2">
                        <Checkbox
                          id={`zone-${zone}`}
                          checked={zones.includes(zone)}
                          onCheckedChange={() => toggleArrayField("preferred_zones", zone, zones)}
                        />
                        <Label htmlFor={`zone-${zone}`} className="text-sm font-normal">
                          {zone}
                        </Label>
                      </div>
                    ))}
                    <div className="col-span-2 flex items-center gap-2 sm:col-span-3">
                      <Checkbox
                        id="zone-other"
                        checked={zones.some((z) => !BC_ZONES.includes(z))}
                        onCheckedChange={(checked) => {
                          if (checked && otherZone) {
                            setValue("preferred_zones", [...zones.filter((z) => BC_ZONES.includes(z)), otherZone]);
                          } else {
                            setValue("preferred_zones", zones.filter((z) => BC_ZONES.includes(z)));
                          }
                        }}
                      />
                      <Input
                        placeholder="Other city..."
                        className="max-w-48"
                        value={otherZone}
                        onChange={(e) => {
                          setOtherZone(e.target.value);
                          if (e.target.value) {
                            setValue("preferred_zones", [
                              ...zones.filter((z) => BC_ZONES.includes(z)),
                              e.target.value,
                            ]);
                          }
                        }}
                      />
                    </div>
                  </div>
                  {errors.preferred_zones && (
                    <p className="text-sm text-destructive">{errors.preferred_zones.message}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <DynamicField meta={fieldMeta} fieldKey="bedrooms_needed" fallbackLabel="Bedrooms">
                    <Select value={bedroomsNeeded} onValueChange={(val: string | null) => val && setValue("bedrooms_needed", val)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {fieldOptions(fieldMeta, "bedrooms_needed", BEDROOM_OPTIONS.map((b) => ({ value: b.replace(" BR", ""), label: b }))).map((b) => (
                          <SelectItem key={b.value} value={b.value}>
                            {b.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.bedrooms_needed && (
                      <p className="text-sm text-destructive">{errors.bedrooms_needed.message}</p>
                    )}
                  </DynamicField>
                  <DynamicField meta={fieldMeta} fieldKey="bathrooms_needed" fallbackLabel="Bathrooms">
                    <Select value={bathroomsNeeded} onValueChange={(val: string | null) => val && setValue("bathrooms_needed", val)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {fieldOptions(fieldMeta, "bathrooms_needed", BATHROOM_OPTIONS).map((b) => (
                          <SelectItem key={b.value} value={b.value}>
                            {b.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.bathrooms_needed && (
                      <p className="text-sm text-destructive">{errors.bathrooms_needed.message}</p>
                    )}
                  </DynamicField>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="size_sqft">Size (optional)</Label>
                    <div className="flex gap-2">
                      <Input
                        id="size_sqft"
                        type="number"
                        placeholder="e.g. 800"
                        {...register("size_sqft")}
                      />
                      <Select
                        value={watch("size_unit")}
                        onValueChange={(val: string | null) => val && setValue("size_unit", val as "sqft" | "m2")}
                      >
                        <SelectTrigger className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sqft">sq ft</SelectItem>
                          <SelectItem value="m2">m²</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Levels / Floor</Label>
                    <Select value={levelsPreferred} onValueChange={(val: string | null) => val && setValue("levels_preferred", val)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Any" />
                      </SelectTrigger>
                      <SelectContent>
                        {["1", "2", "3", "4", "Other"].map((l) => (
                          <SelectItem key={l} value={l}>
                            {l}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {/* #8: Other text field for levels */}
                    {(watch("levels_preferred") as string) === "Other" && (
                      <Input placeholder="Please specify the level/floor" {...register("levels_other")} className="mt-1" />
                    )}
                  </div>
                </div>

                <DynamicField meta={fieldMeta} fieldKey="style_preference" fallbackLabel="Style preference">
                  <Select value={stylePreference} onValueChange={(val: string | null) => val && setValue("style_preference", val as TenantFormData["style_preference"])}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select style" />
                    </SelectTrigger>
                    <SelectContent>
                      {fieldOptions(fieldMeta, "style_preference", STYLE_PREFS).map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {(watch("style_preference") as string) === "other" && (
                    <Input placeholder="Please specify your style preference" {...register("style_other")} />
                  )}
                </DynamicField>

                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  {[
                    { id: "furnished", label: "Furnished", field: "furnished" as const },
                    { id: "utilities", label: "Utilities included", field: "utilities_included" as const },
                    { id: "pet_friendly", label: "Pet-friendly", field: "pet_friendly" as const },
                    { id: "parking", label: "Parking needed", field: "parking_needed" as const },
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
                    checked={smartHomeInterest}
                    onCheckedChange={(c) => setValue("smart_home_interest", c === true)}
                  />
                  <Label htmlFor="smart_home" className="font-normal">Smart home features</Label>
                </div>
                {smartHomeInterest && (
                  <div className="ml-6 space-y-2">
                    {SMART_HOME_FEATURES.map((f) => (
                      <div key={f} className="flex items-center gap-2">
                        <Checkbox
                          id={`sh-${f}`}
                          checked={smartHomeFeatures.includes(f)}
                          onCheckedChange={() => toggleArrayField("smart_home_features", f, smartHomeFeatures)}
                        />
                        <Label htmlFor={`sh-${f}`} className="text-sm font-normal">{f}</Label>
                      </div>
                    ))}
                    {/* #8: Other text field for smart home */}
                    {smartHomeFeatures.includes("Other") && (
                      <Input placeholder="Please specify smart home features" {...register("smart_home_other")} className="ml-6" />
                    )}
                  </div>
                )}
              </>
            )}

            {/* ═══ Step 3: Budget, Move-in, Amenities, Location ═══ */}
            {step === 3 && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <DynamicField meta={fieldMeta} fieldKey="min_budget" fallbackLabel="Monthly budget min (CAD)" htmlFor="min_budget">
                    <Input
                      id="min_budget"
                      type="number"
                      min={400}
                      max={8000}
                      placeholder="400"
                      {...register("min_budget")}
                    />
                    {errors.min_budget && (
                      <p className="text-sm text-destructive">{errors.min_budget.message}</p>
                    )}
                  </DynamicField>
                  <DynamicField meta={fieldMeta} fieldKey="max_budget" fallbackLabel="Monthly budget max (CAD)" htmlFor="max_budget">
                    <Input
                      id="max_budget"
                      type="number"
                      min={400}
                      max={8000}
                      placeholder="3000"
                      {...register("max_budget")}
                    />
                    {errors.max_budget && (
                      <p className="text-sm text-destructive">{errors.max_budget.message}</p>
                    )}
                  </DynamicField>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    {(() => { const f = fld("move_in_date", "When are you planning to move?", null, true); if (f.hidden) return null; return (
                      <>
                        <Label htmlFor="move_in_date">{f.label}</Label>
                        <Input id="move_in_date" type="date" {...register("move_in_date")} />
                        {f.helper && <p className="text-xs text-muted-foreground">{f.helper}</p>}
                        {errors.move_in_date && (
                          <p className="text-sm text-destructive">{errors.move_in_date.message}</p>
                        )}
                      </>
                    ); })()}
                  </div>
                  <div className="flex items-end pb-1">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="move_flexible"
                        checked={watch("move_in_flexible")}
                        onCheckedChange={(c) => setValue("move_in_flexible", c === true)}
                      />
                      <Label htmlFor="move_flexible" className="font-normal">
                        Is your move-in flexible?
                      </Label>
                    </div>
                  </div>
                </div>

                <DynamicField meta={fieldMeta} fieldKey="contract_duration" fallbackLabel="Lease contract duration">
                  <Select value={contractDuration} onValueChange={(val: string | null) => val && setValue("contract_duration", val)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select duration" />
                    </SelectTrigger>
                    <SelectContent>
                      {fieldOptions(fieldMeta, "contract_duration", CONTRACT_DURATIONS).map((d) => (
                        <SelectItem key={d.value} value={d.value}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.contract_duration && (
                    <p className="text-sm text-destructive">{errors.contract_duration.message}</p>
                  )}
                </DynamicField>

                <div className="space-y-3">
                  <Label>Preferred amenities</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {AMENITIES.map((a) => (
                      <div key={a} className="flex items-center gap-2">
                        <Checkbox
                          id={`amenity-${a}`}
                          checked={amenities.includes(a)}
                          onCheckedChange={() => toggleArrayField("preferred_amenities", a, amenities)}
                        />
                        <Label htmlFor={`amenity-${a}`} className="text-sm font-normal">{a}</Label>
                      </div>
                    ))}
                  </div>
                  {/* #8: Other text field for amenities */}
                  {amenities.includes("Other") && (
                    <Input placeholder="Please specify other amenities" {...register("amenities_other")} />
                  )}
                </div>

                <div className="space-y-3">
                  <Label>Building common areas</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {COMMON_AREAS.map((a) => (
                      <div key={a} className="flex items-center gap-2">
                        <Checkbox
                          id={`ca-${a}`}
                          checked={commonAreas.includes(a)}
                          onCheckedChange={() => toggleArrayField("common_areas", a, commonAreas)}
                        />
                        <Label htmlFor={`ca-${a}`} className="text-sm font-normal">{a}</Label>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ═══ Step 4: Location Preferences ═══ */}
            {step === 4 && (
              <>
                <p className="text-sm text-muted-foreground">
                  Select your location preferences. These help us match you with
                  the best properties.
                </p>

                <div className="space-y-3">
                  {[
                    { id: "near_bus", label: "Near a bus stop", field: "near_bus" as const },
                    { id: "near_social", label: "Near bars, cinemas, social life", field: "near_social" as const },
                    { id: "near_banks", label: "Near banks", field: "near_banks" as const },
                    { id: "near_downtown", label: "Near downtown", field: "near_downtown" as const },
                    { id: "urban_zone", label: "Elegant and well-located urban zone", field: "prefers_urban_zone" as const },
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
                    <Label htmlFor="near_skytrain" className="font-normal">
                      Near a SkyTrain station
                    </Label>
                  </div>
                  {nearSkytrain && (
                    <div className="ml-6 space-y-2">
                      <Label className="text-sm">Which SkyTrain line would you prefer?</Label>
                      {SKYTRAIN_LINES.map((line) => (
                        <div key={line} className="flex items-center gap-2">
                          <Checkbox
                            id={`sky-${line}`}
                            checked={skytrainLines.includes(line)}
                            onCheckedChange={() => toggleArrayField("skytrain_lines", line, skytrainLines)}
                          />
                          <Label htmlFor={`sky-${line}`} className="text-sm font-normal">
                            {line}
                          </Label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="additional">Additional requirements (optional)</Label>
                  <Textarea
                    id="additional"
                    placeholder="Any other details about your ideal home..."
                    rows={3}
                    {...register("additional_requirements")}
                  />
                </div>
              </>
            )}

            {/* ═══ Step 5: Legal Consent (2-level) ═══ */}
            {step === 5 && (
              <>
                {/* Level 1: Main consent */}
                <div className="rounded-lg border p-4 space-y-3">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    By submitting this form, I consent to the collection and use of my
                    personal information for rental matching and tenant screening purposes,
                    authorize reference and credit checks where applicable, and agree to
                    receive electronic communications, in accordance with the Terms of
                    Service and Privacy Policy.
                  </p>
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="consent_main"
                      checked={watch("consent_data_processing")}
                      onCheckedChange={(c) => setValue("consent_data_processing", c === true)}
                    />
                    <div className="flex-1">
                      <Label htmlFor="consent_main" className="text-sm font-medium leading-relaxed">
                        I agree to the Terms of Service and Privacy Policy and consent to
                        tenant screening and electronic communications. (Required)
                      </Label>
                      {/* #29: Read full document */}
                      <button
                        type="button"
                        className="mt-1 flex items-center gap-1 text-xs text-primary hover:underline"
                        onClick={() => setExpandedLegal(expandedLegal === "consent_data_processing" ? null : "consent_data_processing")}
                      >
                        <FileText className="h-3 w-3" />
                        {expandedLegal === "consent_data_processing" ? "Hide full document" : "Read full document"}
                      </button>
                      {expandedLegal === "consent_data_processing" && (
                        <div className="mt-2 rounded-md bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
                          <p className="font-medium text-foreground mb-1">{LEGAL_DOCS.consent_data_processing.title}</p>
                          {LEGAL_DOCS.consent_data_processing.text}
                        </div>
                      )}
                    </div>
                  </div>
                  {errors.consent_data_processing && (
                    <p className="text-sm text-destructive" data-error="true">
                      {errors.consent_data_processing.message}
                    </p>
                  )}
                </div>

                {/* Level 2: Detailed consents (collapsible) */}
                <div className="space-y-2">
                  <button
                    type="button"
                    className="text-sm text-primary underline"
                    onClick={() => setShowConsentDetails(!showConsentDetails)}
                  >
                    {showConsentDetails ? "Hide" : "View"} consent details
                  </button>

                  {showConsentDetails && (
                    <div className="space-y-3 rounded-md border p-4 text-sm">
                      {[
                        {
                          id: "consent_screening",
                          field: "consent_screening" as const,
                          label: "Consent to screening — Credit and background checks (PIPA / PIPEDA)",
                        },
                        {
                          id: "consent_references",
                          field: "consent_references" as const,
                          label: "Consent to reference checks",
                        },
                        {
                          id: "consent_communications",
                          field: "consent_communications" as const,
                          label: "Consent to electronic communications (CASL)",
                        },
                        {
                          id: "consent_truthfulness",
                          field: "consent_truthfulness" as const,
                          label: "Declaration of truthfulness of information",
                        },
                        {
                          id: "consent_mktg",
                          field: "consent_marketing" as const,
                          label: "Consent to marketing communications (optional)",
                        },
                      ].map(({ id, field, label }) => (
                        <div key={id} className="rounded-lg border p-3">
                          <div className="flex items-start gap-3">
                            <Checkbox
                              id={id}
                              checked={watch(field) as boolean}
                              onCheckedChange={(c) => setValue(field, c === true)}
                            />
                            <div className="flex-1">
                              <Label htmlFor={id} className="text-sm font-normal leading-relaxed">
                                {label}
                              </Label>
                              {/* #29: Read full document for each consent */}
                              {LEGAL_DOCS[field] && (
                                <>
                                  <button
                                    type="button"
                                    className="mt-1 flex items-center gap-1 text-xs text-primary hover:underline"
                                    onClick={() => setExpandedLegal(expandedLegal === field ? null : field)}
                                  >
                                    <FileText className="h-3 w-3" />
                                    {expandedLegal === field ? "Hide full document" : "Read full document"}
                                  </button>
                                  {expandedLegal === field && (
                                    <div className="mt-2 rounded-md bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
                                      <p className="font-medium text-foreground mb-1">{LEGAL_DOCS[field].title}</p>
                                      {LEGAL_DOCS[field].text}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>

          <div className="flex justify-between px-6 pb-6">
            {step > 1 ? (
              <Button type="button" variant="outline" onClick={() => setStep(step - 1)}>
                Previous
              </Button>
            ) : (
              <div />
            )}
            {step < TOTAL_STEPS ? (
              <Button type="button" onClick={nextStep}>
                Next
              </Button>
            ) : (
              <Button type="submit" disabled={loading}>
                {loading ? "Saving..." : "Save Preferences"}
              </Button>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}
