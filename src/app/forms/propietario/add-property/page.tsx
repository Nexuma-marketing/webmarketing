"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import { propertyOnlySchema, type PropertyOnlyFormData } from "@/types/forms";
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
import { useFormFieldMeta, fieldOptions } from "@/lib/form-meta";
import { DynamicField } from "@/components/forms/dynamic-field";

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
  "Vancouver", "Burnaby", "Surrey", "Richmond", "Coquitlam",
  "New Westminster", "North Vancouver", "West Vancouver", "Langley",
  "Delta", "Abbotsford", "Chilliwack", "Maple Ridge", "Port Moody",
  "Port Coquitlam", "White Rock", "Pitt Meadows",
  "Victoria", "Kelowna", "Nanaimo", "Kamloops",
];

// ─── Legal docs (#29) ───────────────────────────────
// Steve 4/21 #15: Nexuma marketing ltd in all legal consents
const LEGAL_DOCS = {
  consent_image_usage:
    "I authorize Nexuma marketing ltd and its affiliates to use photographs, videos, and other visual media of my property for the purpose of marketing, advertising, listing, and promotional activities across all platforms including but not limited to websites, social media, print materials, and third-party listing services. I understand that images may be edited, cropped, or enhanced for presentation purposes while maintaining an accurate representation of the property. This authorization remains in effect for the duration of the service agreement and may be revoked in writing with 30 days notice.",
  consent_data_processing:
    "I acknowledge and consent to Nexuma marketing ltd collecting, using, storing, and processing my personal information including but not limited to: full name, contact information, property details, financial information related to rental pricing, and property images. This data will be processed in accordance with the Personal Information Protection Act (PIPA) of British Columbia and the Personal Information Protection and Electronic Documents Act (PIPEDA) of Canada. My information will be used solely for the purposes of property management services, tenant matching, marketing activities, and regulatory compliance. I understand I have the right to access, correct, and request deletion of my personal data by contacting the privacy officer.",
  consent_marketing:
    "In compliance with Canada's Anti-Spam Legislation (CASL), I consent to receive commercial electronic messages from Nexuma marketing ltd including but not limited to: property listing updates, market reports, service notifications, promotional offers, newsletters, and communications related to my property management services. Messages will be sent via email, SMS, or other electronic means to the contact information I have provided. I understand I may withdraw this consent at any time by clicking the unsubscribe link in any electronic message or by contacting support. Withdrawal of consent will be processed within 10 business days.",
  consent_third_party:
    "I have read, understood, and agree to be bound by the Nexuma marketing ltd Terms and Conditions of Service, including but not limited to: service scope and limitations, fee structure and payment terms, property listing guidelines, tenant screening procedures, dispute resolution mechanisms, liability limitations, and termination clauses. I understand that these terms constitute a legally binding agreement between myself and Nexuma marketing ltd. I acknowledge that I have had the opportunity to review these terms and seek independent legal advice if desired.",
};

const TOTAL_STEPS = 4;

export default function AddPropertyPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedLegal, setExpandedLegal] = useState<Record<string, boolean>>({});
  const [propertyImages, setPropertyImages] = useState<ImageWithMeta[]>([]);
  const formRef = useRef<HTMLDivElement>(null);

  // Steve 5/15: this "add a second property" flow is a separate file
  // from /forms/propietario but shares the same DB schema and the
  // same form_questions metadata under slug 'owner_property'. Pull
  // the same field metadata overlay so any admin edit in /admin/forms
  // also reflects here. Without this hook the page used hardcoded
  // <Label>s and ignored admin label / helper / options edits — the
  // owner would have seen the new wording on /forms/propietario but
  // not when registering an additional property from the dashboard.
  const fieldMeta = useFormFieldMeta("owner_property");

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    trigger,
    formState: { errors },
  } = useForm<PropertyOnlyFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(propertyOnlySchema) as any,
    defaultValues: {
      province: "British Columbia",
      occupancy_status: "vacant",
      area_unit: "sqft",
      amenities: [],
      common_areas: [],
      smart_home_features: [],
      listing_platforms: [],
      skytrain_lines: [],
      nearby_supermarkets: [],
      dishwasher: false,
      pet_friendly: false,
      smart_home: false,
      shared_unit: false,
      furnished: false,
      utilities_included: false,
      near_parks: false,
      near_churches: false,
      near_skytrain: false,
      near_bus: false,
      near_mall: false,
      // Consent defaults — required for Zod boolean validation
      consent_image_usage: false,
      consent_data_processing: false,
      consent_marketing: false,
      consent_third_party: false,
    },
  });

  const selectedStyle = watch("style") as string | undefined;
  const selectedLevels = watch("levels") as string | undefined;
  const smartHome = watch("smart_home") as boolean;
  const smartHomeFeatures = watch("smart_home_features") as string[];
  const amenities = watch("amenities") as string[];
  const commonAreas = watch("common_areas") as string[];
  const listingPlatforms = watch("listing_platforms") as string[];
  const nearSkytrain = watch("near_skytrain") as boolean;
  const skytrainLines = watch("skytrain_lines") as string[];
  const nearbySupermarkets = watch("nearby_supermarkets") as string[];
  const occupancyStatus = watch("occupancy_status") as string;

  function toggleArray(field: keyof PropertyOnlyFormData, value: string, current: string[]) {
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    setValue(field, next, { shouldValidate: true });
  }

  function scrollToFirstError() {
    setTimeout(() => {
      const el = formRef.current?.querySelector("[data-error='true'], .text-destructive");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }

  async function nextStep() {
    let fieldsToValidate: (keyof PropertyOnlyFormData)[] = [];
    if (step === 1) fieldsToValidate = ["property_type", "bedrooms", "bathrooms", "monthly_rent"];
    if (step === 2) fieldsToValidate = ["address", "zone_city"];

    const valid = await trigger(fieldsToValidate);
    if (!valid) {
      scrollToFirstError();
      return;
    }
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
    window.history.pushState({ step: step + 1 }, "");
  }

  function prevStep() {
    if (step > 1) setStep((s) => s - 1);
    else router.push("/dashboard/properties");
  }

  // Browser back button support (#30)
  const handlePopState = useCallback(() => {
    setStep((s) => {
      if (s > 1) return s - 1;
      router.push("/dashboard/properties");
      return s;
    });
  }, [router]);

  useEffect(() => {
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [handlePopState]);

  async function onSubmit(data: PropertyOnlyFormData) {
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      // Determine service tier from existing property count
      const { count } = await supabase
        .from("properties")
        .select("*", { count: "exact", head: true })
        .eq("owner_id", user.id);

      const totalProps = (count || 0) + 1;
      const tier = totalProps >= 4 ? "elite" : totalProps >= 2 ? "preferred_owners" : "basic";

      const { data: propData, error: propError } = await supabase.from("properties").insert({
        owner_id: user.id,
        title: `${data.property_type} in ${data.zone_city}`,
        property_type: data.property_type,
        address: data.address,
        city: data.zone_city,
        province: data.province,
        postal_code: data.postal_code || null,
        monthly_rent: data.monthly_rent,
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
        occupancy_status: data.occupancy_status,
        vacancy_date: data.vacancy_date || null,
        listing_platforms: data.listing_platforms,
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

      // Update profile property count
      await supabase
        .from("profiles")
        .update({ property_count: totalProps })
        .eq("id", user.id);

      // Run profiling (re-classifies role, tier, CFP for all properties)
      await fetch("/api/profiling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "owner" }),
      });

      // Steve 4/24 #6: Send email when adding property via "+ New Property"
      // Get current role to differentiate owner vs investor in email
      const { data: profileForRole } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      const userType = profileForRole?.role === "inversionista" ? "investor" : "owner";

      fetch("/api/owner-submit-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_type: userType,
          property_count: totalProps,
          tier,
          cities: [data.zone_city],
          rents: [data.monthly_rent],
          source: "add_property",
        }),
      }).catch((err) => console.error("Add-property email failed:", err));

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
            Add Property &mdash; Step {step} of {TOTAL_STEPS}
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
        <form onSubmit={handleSubmit(onSubmit, scrollToFirstError)}>
          <CardHeader>
            <CardTitle className="text-xl">
              {step === 1 && "Property Details"}
              {step === 2 && "Zone & Location"}
              {step === 3 && "Property Photos"}
              {step === 4 && "Legal Consents"}
            </CardTitle>
            <CardDescription>
              {step === 1 && "Describe your property details."}
              {step === 2 && "Location details help us match tenants to your property."}
              {step === 3 && "Upload photos of your property. Quality images attract better tenants."}
              {step === 4 && "Please review and accept the following consents."}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* ═══ Step 1: Property Details ═══ */}
            {step === 1 && (
              <>
                <DynamicField meta={fieldMeta} fieldKey="property_type" fallbackLabel="Property Type">
                  <Select value={watch("property_type") as string | undefined} onValueChange={(val: string | null) => val && setValue("property_type", val)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select property type" />
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

                <DynamicField meta={fieldMeta} fieldKey="monthly_rent" fallbackLabel="Monthly Rent (CAD)" htmlFor="monthly_rent">
                  <Input
                    id="monthly_rent"
                    type="number"
                    min={300}
                    placeholder="e.g. 2000"
                    {...register("monthly_rent")}
                  />
                  {errors.monthly_rent && (
                    <p className="text-sm text-destructive" data-error="true">{errors.monthly_rent.message}</p>
                  )}
                </DynamicField>

                {/* Occupancy Status (#18) */}
                <DynamicField meta={fieldMeta} fieldKey="occupancy_status" fallbackLabel="Occupancy Status">
                  <Select
                    value={watch("occupancy_status") as string | undefined}
                    onValueChange={(val: string | null) => val && setValue("occupancy_status", val as PropertyOnlyFormData["occupancy_status"])}
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
                  {occupancyStatus === "occupied" && (
                    <DynamicField meta={fieldMeta} fieldKey="vacancy_date" fallbackLabel="Expected vacancy date" htmlFor="vacancy_date" className="space-y-1">
                      <Input id="vacancy_date" type="date" {...register("vacancy_date")} />
                    </DynamicField>
                  )}
                </DynamicField>

                <DynamicField meta={fieldMeta} fieldKey="availability_date" fallbackLabel="Availability Date" htmlFor="availability_date">
                  <Input id="availability_date" type="date" {...register("availability_date")} />
                </DynamicField>

                <div className="grid grid-cols-2 gap-4">
                  <DynamicField meta={fieldMeta} fieldKey="bedrooms" fallbackLabel="Bedrooms">
                    <Select value={watch("bedrooms") as string | undefined} onValueChange={(val: string | null) => val && setValue("bedrooms", val)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {fieldOptions(fieldMeta, "bedrooms", BEDROOMS.map((b) => ({ value: b, label: b }))).map((b) => (
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
                        {fieldOptions(fieldMeta, "bathrooms", BATHROOMS.map((b) => ({ value: b, label: b }))).map((b) => (
                          <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.bathrooms && (
                      <p className="text-sm text-destructive" data-error="true">{errors.bathrooms.message}</p>
                    )}
                  </DynamicField>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <DynamicField meta={fieldMeta} fieldKey="area_sqft" fallbackLabel="Size" htmlFor="area_sqft">
                    <Input id="area_sqft" type="number" placeholder="e.g. 800" {...register("area_sqft")} />
                  </DynamicField>
                  <div className="space-y-2">
                    <Label>Unit</Label>
                    <Select value={(watch("area_unit") as string | undefined) || "sqft"} onValueChange={(val: string | null) => val && setValue("area_unit", val as "sqft" | "m2")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sqft">sq ft</SelectItem>
                        <SelectItem value="m2">m&sup2;</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Style */}
                <DynamicField meta={fieldMeta} fieldKey="style" fallbackLabel="Style">
                  <Select value={watch("style") as string | undefined} onValueChange={(val: string | null) => val && setValue("style", val)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select style" />
                    </SelectTrigger>
                    <SelectContent>
                      {fieldOptions(fieldMeta, "style", STYLES).map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedStyle === "other" && (
                    <Input placeholder="Please specify style" {...register("style_other")} />
                  )}
                </DynamicField>

                {/* Levels */}
                <DynamicField meta={fieldMeta} fieldKey="levels" fallbackLabel="Levels / Floor">
                  <Select value={watch("levels") as string | undefined} onValueChange={(val: string | null) => val && setValue("levels", val)}>
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
                  {selectedLevels === "Other" && (
                    <Input placeholder="Please specify the level/floor" {...register("levels_other")} />
                  )}
                </DynamicField>

                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  {[
                    { id: "ap-dishwasher", label: "Dishwasher", field: "dishwasher" as const },
                    { id: "ap-pet_friendly", label: "Pet-friendly", field: "pet_friendly" as const },
                    { id: "ap-shared_unit", label: "Shared unit", field: "shared_unit" as const },
                    { id: "ap-furnished", label: "Furnished", field: "furnished" as const },
                    { id: "ap-utilities", label: "Utilities included", field: "utilities_included" as const },
                  ].map((item) => (
                    <div key={item.id} className="flex items-center gap-2">
                      <Checkbox
                        id={item.id}
                        checked={watch(item.field) as boolean}
                        onCheckedChange={(c) => setValue(item.field, !!c)}
                      />
                      <Label htmlFor={item.id} className="text-sm font-normal">{item.label}</Label>
                    </div>
                  ))}
                </div>

                {/* Smart Home */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="ap-smart_home"
                      checked={smartHome}
                      onCheckedChange={(c) => setValue("smart_home", !!c)}
                    />
                    <Label htmlFor="ap-smart_home" className="text-sm font-normal">Smart Home</Label>
                  </div>
                  {smartHome && (
                    <div className="ml-6 space-y-2">
                      {SMART_HOME_FEATURES.map((f) => (
                        <div key={f} className="flex items-center gap-2">
                          <Checkbox
                            id={`ap-sh-${f}`}
                            checked={smartHomeFeatures.includes(f)}
                            onCheckedChange={() => toggleArray("smart_home_features", f, smartHomeFeatures)}
                          />
                          <Label htmlFor={`ap-sh-${f}`} className="text-sm font-normal">{f}</Label>
                        </div>
                      ))}
                      {smartHomeFeatures.includes("Other") && (
                        <Input placeholder="Describe smart home feature" {...register("smart_home_other")} />
                      )}
                    </div>
                  )}
                </div>

                {/* Amenities */}
                <DynamicField meta={fieldMeta} fieldKey="amenities" fallbackLabel="Amenities">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {fieldOptions(fieldMeta, "amenities", AMENITIES.map((a) => ({ value: a, label: a }))).map((a) => (
                      <div key={a.value} className="flex items-center gap-2">
                        <Checkbox
                          id={`ap-am-${a.value}`}
                          checked={amenities.includes(a.value)}
                          onCheckedChange={() => toggleArray("amenities", a.value, amenities)}
                        />
                        <Label htmlFor={`ap-am-${a.value}`} className="text-sm font-normal">{a.label}</Label>
                      </div>
                    ))}
                  </div>
                  {amenities.includes("Other") && (
                    <Input placeholder="Please specify amenity" {...register("amenities_other")} />
                  )}
                </DynamicField>

                {/* Common Areas */}
                <DynamicField meta={fieldMeta} fieldKey="common_areas" fallbackLabel="Common Areas">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {fieldOptions(fieldMeta, "common_areas", COMMON_AREAS.map((c) => ({ value: c, label: c }))).map((ca) => (
                      <div key={ca.value} className="flex items-center gap-2">
                        <Checkbox
                          id={`ap-ca-${ca.value}`}
                          checked={commonAreas.includes(ca.value)}
                          onCheckedChange={() => toggleArray("common_areas", ca.value, commonAreas)}
                        />
                        <Label htmlFor={`ap-ca-${ca.value}`} className="text-sm font-normal">{ca.label}</Label>
                      </div>
                    ))}
                  </div>
                </DynamicField>

                {/* Listing Platforms (#9) */}
                <DynamicField meta={fieldMeta} fieldKey="listing_platforms" fallbackLabel="Currently listed on">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {fieldOptions(fieldMeta, "listing_platforms", LISTING_PLATFORMS.map((p) => ({ value: p, label: p }))).map((lp) => (
                      <div key={lp.value} className="flex items-center gap-2">
                        <Checkbox
                          id={`ap-lp-${lp.value}`}
                          checked={listingPlatforms.includes(lp.value)}
                          onCheckedChange={() => toggleArray("listing_platforms", lp.value, listingPlatforms)}
                        />
                        <Label htmlFor={`ap-lp-${lp.value}`} className="text-sm font-normal">{lp.label}</Label>
                      </div>
                    ))}
                  </div>
                  {listingPlatforms.includes("Other") && (
                    <Input placeholder="Please specify platform" {...register("listing_platforms_other")} />
                  )}
                </DynamicField>
              </>
            )}

            {/* ═══ Step 2: Zone & Location ═══ */}
            {step === 2 && (
              <>
                <DynamicField meta={fieldMeta} fieldKey="address" fallbackLabel="Full Address" htmlFor="address">
                  <Input id="address" placeholder="123 Main St" {...register("address")} />
                  {errors.address && (
                    <p className="text-sm text-destructive" data-error="true">{errors.address.message}</p>
                  )}
                </DynamicField>

                <div className="grid grid-cols-2 gap-4">
                  <DynamicField meta={fieldMeta} fieldKey="city" fallbackLabel="City">
                    <Select value={watch("zone_city") as string | undefined} onValueChange={(val: string | null) => val && setValue("zone_city", val)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select city" />
                      </SelectTrigger>
                      <SelectContent>
                        {fieldOptions(fieldMeta, "city", BC_CITIES.map((c) => ({ value: c, label: c }))).map((c) => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.zone_city && (
                      <p className="text-sm text-destructive" data-error="true">{errors.zone_city.message}</p>
                    )}
                  </DynamicField>
                  <DynamicField meta={fieldMeta} fieldKey="postal_code" fallbackLabel="Postal Code" htmlFor="postal_code">
                    <Input id="postal_code" placeholder="V5K 0A1" {...register("postal_code")} />
                  </DynamicField>
                </div>

                <Input type="hidden" value="British Columbia" {...register("province")} />

                {/* Nearby features */}
                <div className="space-y-3">
                  <Label>Nearby Features</Label>
                  <div className="flex flex-wrap gap-x-6 gap-y-2">
                    {[
                      { id: "ap-near_parks", label: "Parks", field: "near_parks" as const },
                      { id: "ap-near_churches", label: "Churches", field: "near_churches" as const },
                      { id: "ap-near_bus", label: "Bus routes", field: "near_bus" as const },
                      { id: "ap-near_mall", label: "Shopping mall", field: "near_mall" as const },
                    ].map((item) => (
                      <div key={item.id} className="flex items-center gap-2">
                        <Checkbox
                          id={item.id}
                          checked={watch(item.field) as boolean}
                          onCheckedChange={(c) => setValue(item.field, !!c)}
                        />
                        <Label htmlFor={item.id} className="text-sm font-normal">{item.label}</Label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* SkyTrain */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="ap-near_skytrain"
                      checked={nearSkytrain}
                      onCheckedChange={(c) => setValue("near_skytrain", !!c)}
                    />
                    <Label htmlFor="ap-near_skytrain" className="text-sm font-normal">Near SkyTrain</Label>
                  </div>
                  {nearSkytrain && (
                    <div className="ml-6 space-y-2">
                      {SKYTRAIN_LINES.map((line) => (
                        <div key={line} className="flex items-center gap-2">
                          <Checkbox
                            id={`ap-sky-${line}`}
                            checked={skytrainLines.includes(line)}
                            onCheckedChange={() => toggleArray("skytrain_lines", line, skytrainLines)}
                          />
                          <Label htmlFor={`ap-sky-${line}`} className="text-sm font-normal">{line}</Label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Social Life */}
                <DynamicField meta={fieldMeta} fieldKey="social_life" fallbackLabel="Social Life / Nightlife">
                  <Select value={watch("social_life") as string | undefined} onValueChange={(val: string | null) => val && setValue("social_life", val)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {["Active", "Moderate", "Quiet"].map((s) => (
                        <SelectItem key={s} value={s.toLowerCase()}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </DynamicField>

                {/* Supermarkets */}
                <DynamicField meta={fieldMeta} fieldKey="nearby_supermarkets" fallbackLabel="Nearby Supermarkets">
                  <div className="grid gap-2 sm:grid-cols-3">
                    {fieldOptions(fieldMeta, "nearby_supermarkets", SUPERMARKETS.map((s) => ({ value: s, label: s }))).map((s) => (
                      <div key={s.value} className="flex items-center gap-2">
                        <Checkbox
                          id={`ap-sup-${s.value}`}
                          checked={nearbySupermarkets.includes(s.value)}
                          onCheckedChange={() => toggleArray("nearby_supermarkets", s.value, nearbySupermarkets)}
                        />
                        <Label htmlFor={`ap-sup-${s.value}`} className="text-sm font-normal">{s.label}</Label>
                      </div>
                    ))}
                  </div>
                </DynamicField>
              </>
            )}

            {/* ═══ Step 3: Property Photos ═══ */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                  <p className="text-sm font-medium text-amber-800">Required to continue</p>
                  <p className="mt-1 text-xs text-amber-700">
                    Upload at least one photo each of the Living Room, Bedroom, Kitchen, Bathroom, and Exterior.
                  </p>
                </div>
                <ImageUpload
                  images={propertyImages}
                  onImagesChange={setPropertyImages}
                  maxImages={20}
                />
              </div>
            )}

            {/* ═══ Step 4: Legal Consents ═══ */}
            {step === 4 && (
              <>
                {(
                  [
                    { field: "consent_image_usage" as const, label: "I consent to image usage and editing for marketing purposes." },
                    { field: "consent_data_processing" as const, label: "I consent to data collection and processing (PIPA/PIPEDA)." },
                    { field: "consent_marketing" as const, label: "I consent to receive electronic communications (CASL)." },
                    { field: "consent_third_party" as const, label: "I accept the Terms and Conditions of Service." },
                  ] as const
                ).map((consent) => (
                  <div key={consent.field} className="space-y-2">
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id={consent.field}
                        checked={watch(consent.field) as boolean}
                        onCheckedChange={(c) => setValue(consent.field, !!c, { shouldValidate: true })}
                      />
                      <div className="flex-1">
                        <Label htmlFor={consent.field} className="text-sm font-normal leading-snug">
                          {consent.label}
                        </Label>
                        <button
                          type="button"
                          className="mt-1 flex items-center gap-1 text-xs text-primary hover:underline"
                          onClick={() =>
                            setExpandedLegal((prev) => ({
                              ...prev,
                              [consent.field]: !prev[consent.field],
                            }))
                          }
                        >
                          <FileText className="h-3 w-3" />
                          {expandedLegal[consent.field] ? "Hide" : "Read full document"}
                        </button>
                        {expandedLegal[consent.field] && (
                          <p className="mt-2 rounded border bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
                            {LEGAL_DOCS[consent.field as keyof typeof LEGAL_DOCS]}
                          </p>
                        )}
                      </div>
                    </div>
                    {errors[consent.field] && (
                      <p className="text-sm text-destructive" data-error="true">
                        {errors[consent.field]?.message}
                      </p>
                    )}
                  </div>
                ))}
              </>
            )}
          </CardContent>

          {/* Navigation */}
          <div className="flex items-center justify-between border-t px-6 py-4">
            <Button type="button" variant="ghost" onClick={prevStep}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {step === 1 ? "Cancel" : "Back"}
            </Button>

            {step < TOTAL_STEPS ? (
              <Button type="button" onClick={nextStep}>
                Next
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button type="submit" disabled={loading}>
                {loading ? "Saving..." : "Register Property"}
              </Button>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}
