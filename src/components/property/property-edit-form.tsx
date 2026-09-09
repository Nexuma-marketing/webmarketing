"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import { propertyEditSchema, type PropertyEditFormData } from "@/types/forms";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { Building2, ArrowLeft, ArrowRight, ImageIcon } from "lucide-react";
import { useFormFieldMeta, fieldOptions } from "@/lib/form-meta";
import { DynamicField } from "@/components/forms/dynamic-field";

// Same option lists as the "Add Property" flow
// (src/app/forms/propietario/add-property/page.tsx) — this edit form
// reuses the same field set and validation, just wired to load/save a
// single property by id instead of an array walked by index.
const PROPERTY_TYPES = [
  { value: "house", label: "House" },
  { value: "condo", label: "Condo" },
  { value: "penthouse", label: "Penthouse" },
  { value: "basement", label: "Basement" },
  { value: "studio", label: "Studio / Apartastudio" },
  { value: "rooms_only", label: "Rooms only" },
];

const OCCUPANCY_OPTIONS = [
  { value: "vacant", label: "Vacant" },
  { value: "occupied", label: "Currently occupied" },
  { value: "renovation", label: "Under renovation" },
  { value: "new_construction", label: "New construction" },
];

const LISTING_PLATFORMS = [
  "Zumper", "Craigslist", "Zillow", "Kijiji", "Facebook Marketplace",
  "Realtor.ca", "Rentals.ca", "PadMapper", "Other",
];

const AMENITIES = [
  "Gym", "Rooftop", "Coworking", "Pool", "Jacuzzi", "Sauna",
  "Covered parking", "Open parking", "Private parking",
  "In-unit laundry (washer & dryer)", "Building laundry (paid)",
  "In-unit washer only", "Fireplace", "Internet", "Airfryer", "Other",
];

const COMMON_AREAS = ["BBQ zone", "SPA", "Billiards", "Pool"];

const SMART_HOME_FEATURES = ["Smart locks", "Keyless entry card", "Other"];

const BEDROOMS = ["1 BR", "2 BR", "3 BR", "4 BR", "5 BR", "6 BR", "7 BR"];
const BATHROOMS = ["1 Bath", "1.5 Bath", "2 Bath", "2.5 Bath", "3 Bath", "3.5 Bath"];

const STYLES = [
  { value: "minimalist", label: "Minimalist" },
  { value: "modern", label: "Modern" },
  { value: "classic", label: "Classic" },
  { value: "elegant", label: "Elegant" },
  { value: "other", label: "Other" },
];

const SKYTRAIN_LINES = ["Millennium Line", "Expo Line", "Canada Line"];

const SUPERMARKETS = [
  "Superstore", "Walmart", "Costco", "Save-On-Foods",
  "Whole Foods", "T&T Supermarket", "No Frills", "Safeway", "Dollarama",
];

const BC_CITIES = [
  "Vancouver", "Burnaby", "Surrey", "Richmond", "Coquitlam",
  "New Westminster", "North Vancouver", "West Vancouver", "Langley",
  "Delta", "Abbotsford", "Chilliwack", "Maple Ridge", "Port Moody",
  "Port Coquitlam", "White Rock", "Pitt Meadows",
  "Victoria", "Kelowna", "Nanaimo", "Kamloops",
];

const TOTAL_STEPS = 3;

interface PropertyRow {
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
  objectives: string[] | null;
  common_areas: string[] | null;
  availability_date: string | null;
  dishwasher: boolean | null;
  pet_friendly: boolean | null;
  smart_home: boolean | null;
  smart_home_features: string[] | null;
  shared_unit: boolean | null;
  levels: string | null;
  furnished: boolean | null;
  utilities_included: boolean | null;
  style: string | null;
  near_parks: boolean | null;
  near_churches: boolean | null;
  near_skytrain: boolean | null;
  skytrain_lines: string[] | null;
  near_bus: boolean | null;
  social_life: string | null;
  near_mall: boolean | null;
  nearby_supermarkets: string[] | null;
  occupancy_status: string | null;
  vacancy_date: string | null;
  listing_platforms: string[] | null;
}

interface ExistingImage {
  id: string;
  room_category: string;
  image_url: string;
  status: string;
}

function toDefaultValues(property: PropertyRow): PropertyEditFormData {
  const bedroomsLabel = property.bedrooms != null ? `${property.bedrooms} BR` : "";
  const bathroomsLabel = property.bathrooms != null ? `${property.bathrooms} Bath` : "";

  return {
    property_type: property.property_type,
    monthly_rent: Number(property.monthly_rent) || 0,
    area_sqft: property.area_sqft ?? "",
    area_unit: "sqft",
    occupancy_status: (property.occupancy_status as PropertyEditFormData["occupancy_status"]) || "vacant",
    vacancy_date: (property.vacancy_date || "").slice(0, 10),
    availability_date: (property.availability_date || "").slice(0, 10),
    bedrooms: BEDROOMS.includes(bedroomsLabel) ? bedroomsLabel : "",
    bathrooms: BATHROOMS.includes(bathroomsLabel) ? bathroomsLabel : "",
    amenities: property.amenities || [],
    objectives: property.objectives || [],
    common_areas: property.common_areas || [],
    dishwasher: !!property.dishwasher,
    pet_friendly: !!property.pet_friendly,
    smart_home: !!property.smart_home,
    smart_home_features: property.smart_home_features || [],
    shared_unit: !!property.shared_unit,
    levels: property.levels || "",
    furnished: !!property.furnished,
    utilities_included: !!property.utilities_included,
    style: property.style || "",
    listing_platforms: property.listing_platforms || [],
    address: property.address,
    zone_city: property.city,
    province: property.province || "British Columbia",
    postal_code: property.postal_code || "",
    near_parks: !!property.near_parks,
    near_churches: !!property.near_churches,
    near_skytrain: !!property.near_skytrain,
    skytrain_lines: property.skytrain_lines || [],
    near_bus: !!property.near_bus,
    social_life: property.social_life || "",
    near_mall: !!property.near_mall,
    nearby_supermarkets: property.nearby_supermarkets || [],
  };
}

export function PropertyEditForm({
  property,
  existingImages,
}: {
  property: PropertyRow;
  existingImages: ExistingImage[];
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const fieldMeta = useFormFieldMeta("owner_property");

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    trigger,
    formState: { errors },
  } = useForm<PropertyEditFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(propertyEditSchema) as any,
    defaultValues: toDefaultValues(property),
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

  function toggleArray(field: keyof PropertyEditFormData, value: string, current: string[]) {
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
    let fieldsToValidate: (keyof PropertyEditFormData)[] = [];
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
    else router.push("/dashboard/preferences");
  }

  const handlePopState = useCallback(() => {
    setStep((s) => {
      if (s > 1) return s - 1;
      router.push("/dashboard/preferences");
      return s;
    });
  }, [router]);

  useEffect(() => {
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [handlePopState]);

  async function onSubmit(data: PropertyEditFormData) {
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      // Updates ONLY this property's row, identified by its real id —
      // never by array position. service_tier / elite_tier / cfp_monthly /
      // payback_months are intentionally left untouched here; they are
      // recalculated by the existing profiling logic below.
      const { error: updateError } = await supabase
        .from("properties")
        .update({
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
          is_available: data.occupancy_status === "vacant",
          occupancy_status: data.occupancy_status,
          vacancy_date: data.vacancy_date || null,
          listing_platforms: data.listing_platforms,
        })
        .eq("id", property.id)
        .eq("owner_id", user.id);

      if (updateError) throw updateError;

      // Re-run profiling so tier/CFP/payback reflect the updated rent,
      // etc. — reuses the existing endpoint, does not change its logic.
      await fetch("/api/profiling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "owner" }),
      }).catch(() => null);

      router.push("/dashboard/preferences");
      router.refresh();
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
      <div className="mb-8 w-full max-w-2xl">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
          <span className="flex items-center gap-1">
            <Building2 className="h-3.5 w-3.5" />
            Edit Property &mdash; Step {step} of {TOTAL_STEPS}
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
              {step === 3 && "Photos"}
            </CardTitle>
            <CardDescription>
              {step === 1 && `Editing: ${property.address}, ${property.city}`}
              {step === 2 && "Location details help us match tenants to your property."}
              {step === 3 && "Review this property's existing photos."}
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

                <DynamicField meta={fieldMeta} fieldKey="occupancy_status" fallbackLabel="Occupancy Status">
                  <Select
                    value={watch("occupancy_status") as string | undefined}
                    onValueChange={(val: string | null) => val && setValue("occupancy_status", val as PropertyEditFormData["occupancy_status"])}
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
                    { id: "ep-dishwasher", label: "Dishwasher", field: "dishwasher" as const },
                    { id: "ep-pet_friendly", label: "Pet-friendly", field: "pet_friendly" as const },
                    { id: "ep-shared_unit", label: "Shared unit", field: "shared_unit" as const },
                    { id: "ep-furnished", label: "Furnished", field: "furnished" as const },
                    { id: "ep-utilities", label: "Utilities included", field: "utilities_included" as const },
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

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="ep-smart_home"
                      checked={smartHome}
                      onCheckedChange={(c) => setValue("smart_home", !!c)}
                    />
                    <Label htmlFor="ep-smart_home" className="text-sm font-normal">Smart Home</Label>
                  </div>
                  {smartHome && (
                    <div className="ml-6 space-y-2">
                      {SMART_HOME_FEATURES.map((f) => (
                        <div key={f} className="flex items-center gap-2">
                          <Checkbox
                            id={`ep-sh-${f}`}
                            checked={smartHomeFeatures.includes(f)}
                            onCheckedChange={() => toggleArray("smart_home_features", f, smartHomeFeatures)}
                          />
                          <Label htmlFor={`ep-sh-${f}`} className="text-sm font-normal">{f}</Label>
                        </div>
                      ))}
                      {smartHomeFeatures.includes("Other") && (
                        <Input placeholder="Describe smart home feature" {...register("smart_home_other")} />
                      )}
                    </div>
                  )}
                </div>

                <DynamicField meta={fieldMeta} fieldKey="amenities" fallbackLabel="Amenities">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {fieldOptions(fieldMeta, "amenities", AMENITIES.map((a) => ({ value: a, label: a }))).map((a) => (
                      <div key={a.value} className="flex items-center gap-2">
                        <Checkbox
                          id={`ep-am-${a.value}`}
                          checked={amenities.includes(a.value)}
                          onCheckedChange={() => toggleArray("amenities", a.value, amenities)}
                        />
                        <Label htmlFor={`ep-am-${a.value}`} className="text-sm font-normal">{a.label}</Label>
                      </div>
                    ))}
                  </div>
                  {amenities.includes("Other") && (
                    <Input placeholder="Please specify amenity" {...register("amenities_other")} />
                  )}
                </DynamicField>

                <DynamicField meta={fieldMeta} fieldKey="common_areas" fallbackLabel="Common Areas">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {fieldOptions(fieldMeta, "common_areas", COMMON_AREAS.map((c) => ({ value: c, label: c }))).map((ca) => (
                      <div key={ca.value} className="flex items-center gap-2">
                        <Checkbox
                          id={`ep-ca-${ca.value}`}
                          checked={commonAreas.includes(ca.value)}
                          onCheckedChange={() => toggleArray("common_areas", ca.value, commonAreas)}
                        />
                        <Label htmlFor={`ep-ca-${ca.value}`} className="text-sm font-normal">{ca.label}</Label>
                      </div>
                    ))}
                  </div>
                </DynamicField>

                <DynamicField meta={fieldMeta} fieldKey="listing_platforms" fallbackLabel="Currently listed on">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {fieldOptions(fieldMeta, "listing_platforms", LISTING_PLATFORMS.map((p) => ({ value: p, label: p }))).map((lp) => (
                      <div key={lp.value} className="flex items-center gap-2">
                        <Checkbox
                          id={`ep-lp-${lp.value}`}
                          checked={listingPlatforms.includes(lp.value)}
                          onCheckedChange={() => toggleArray("listing_platforms", lp.value, listingPlatforms)}
                        />
                        <Label htmlFor={`ep-lp-${lp.value}`} className="text-sm font-normal">{lp.label}</Label>
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

                <div className="space-y-3">
                  <Label>Nearby Features</Label>
                  <div className="flex flex-wrap gap-x-6 gap-y-2">
                    {[
                      { id: "ep-near_parks", label: "Parks", field: "near_parks" as const },
                      { id: "ep-near_churches", label: "Churches", field: "near_churches" as const },
                      { id: "ep-near_bus", label: "Bus routes", field: "near_bus" as const },
                      { id: "ep-near_mall", label: "Shopping mall", field: "near_mall" as const },
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

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="ep-near_skytrain"
                      checked={nearSkytrain}
                      onCheckedChange={(c) => setValue("near_skytrain", !!c)}
                    />
                    <Label htmlFor="ep-near_skytrain" className="text-sm font-normal">Near SkyTrain</Label>
                  </div>
                  {nearSkytrain && (
                    <div className="ml-6 space-y-2">
                      {SKYTRAIN_LINES.map((line) => (
                        <div key={line} className="flex items-center gap-2">
                          <Checkbox
                            id={`ep-sky-${line}`}
                            checked={skytrainLines.includes(line)}
                            onCheckedChange={() => toggleArray("skytrain_lines", line, skytrainLines)}
                          />
                          <Label htmlFor={`ep-sky-${line}`} className="text-sm font-normal">{line}</Label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

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

                <DynamicField meta={fieldMeta} fieldKey="nearby_supermarkets" fallbackLabel="Nearby Supermarkets">
                  <div className="grid gap-2 sm:grid-cols-3">
                    {fieldOptions(fieldMeta, "nearby_supermarkets", SUPERMARKETS.map((s) => ({ value: s, label: s }))).map((s) => (
                      <div key={s.value} className="flex items-center gap-2">
                        <Checkbox
                          id={`ep-sup-${s.value}`}
                          checked={nearbySupermarkets.includes(s.value)}
                          onCheckedChange={() => toggleArray("nearby_supermarkets", s.value, nearbySupermarkets)}
                        />
                        <Label htmlFor={`ep-sup-${s.value}`} className="text-sm font-normal">{s.label}</Label>
                      </div>
                    ))}
                  </div>
                </DynamicField>
              </>
            )}

            {/* ═══ Step 3: Photos ═══ */}
            {step === 3 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  To add, remove, or re-tag photos for this exact property, use Manage
                  Photos — it already checks against this property&apos;s saved photos
                  before uploading, so nothing gets duplicated or attached to the wrong
                  unit.
                </p>
                {existingImages.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {existingImages.map((img) => (
                      <div key={img.id} className="relative aspect-[4/3] overflow-hidden rounded-md border bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.image_url}
                          alt={img.room_category}
                          className="h-full w-full object-cover"
                        />
                        <span className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1 text-xs font-medium text-white">
                          {img.room_category}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No photos uploaded yet for this property.</p>
                )}
                <Link
                  href={`/dashboard/images?property=${property.id}`}
                  className={buttonVariants({ variant: "outline", className: "gap-2" })}
                >
                  <ImageIcon className="h-4 w-4" />
                  Manage Photos
                </Link>
              </div>
            )}
          </CardContent>

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
                {loading ? "Saving..." : "Save Changes"}
              </Button>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}
