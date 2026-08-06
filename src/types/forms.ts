import { z } from "zod";

// ===========================================
// Owner / Investor Form (PDF 5.2.1)
// Owner Profile + Property Details + Zone
// ===========================================
export const ownerFormSchema = z.object({
  // ─── Owner Profile (PDF 5.2.1) ───
  user_type: z.enum(["owner", "investor"], { message: "Please select if you are an owner or investor" }),
  property_count: z.coerce.number().int().min(1, "Must own at least 1 property"),
  objectives: z.array(z.string()).min(1, "Select at least one objective"),
  // Per-property: city and rent (arrays matching property_count)
  cities: z.array(z.string()).min(1, "Enter city for each property"),
  rents: z.array(z.coerce.number().min(300).max(8000)).min(1, "Enter rent for each property"),

  // ─── Property Details (PDF 5.2.1.1) ─── first property
  property_type: z.string({ message: "Select property type" }).min(1, "Select property type"),
  area_sqft: z.coerce.number().positive().optional().or(z.literal("")),
  area_unit: z.enum(["sqft", "m2"]).default("sqft"),
  occupancy_status: z.enum(["vacant", "occupied", "renovation", "new_construction"]).default("vacant"),
  vacancy_date: z.string().optional(),
  availability_date: z.string().optional(),
  bedrooms: z.string({ message: "Select bedrooms" }).min(1, "Select bedrooms"),
  bathrooms: z.string({ message: "Select bathrooms" }).min(1, "Select bathrooms"),
  amenities: z.array(z.string()).default([]),
  common_areas: z.array(z.string()).default([]),
  dishwasher: z.boolean().default(false),
  pet_friendly: z.boolean().default(false),
  smart_home: z.boolean().default(false),
  smart_home_features: z.array(z.string()).default([]),
  smart_home_other: z.string().optional(),
  shared_unit: z.boolean().default(false),
  levels: z.string().optional(),
  levels_other: z.string().optional(),
  furnished: z.boolean().default(false),
  utilities_included: z.boolean().default(false),
  style: z.string().optional(),
  style_other: z.string().optional(),
  amenities_other: z.string().optional(),

  // ─── Listing Platforms (Steve #9) ───
  listing_platforms: z.array(z.string()).default([]),
  listing_platforms_other: z.string().optional(),

  // ─── Zone Info (PDF 5.2.1.2) ───
  address: z.string({ message: "Address is required" }).min(1, "Address is required"),
  zone_city: z.string({ message: "City is required" }).min(1, "City is required"),
  province: z.string().default("British Columbia"),
  postal_code: z.string().optional(),
  near_parks: z.boolean().default(false),
  near_churches: z.boolean().default(false),
  near_skytrain: z.boolean().default(false),
  skytrain_lines: z.array(z.string()).default([]),
  near_bus: z.boolean().default(false),
  social_life: z.string().optional(),
  near_mall: z.boolean().default(false),
  nearby_supermarkets: z.array(z.string()).default([]),

  // ─── Legal Consents (7 checkboxes: 4 original + 3 added Steve 4/21 #16) ───
  consent_image_usage: z.boolean().refine((v) => v === true, {
    message: "You must consent to image usage and editing",
  }),
  consent_data_processing: z.boolean().refine((v) => v === true, {
    message: "You must consent to rights and privacy declaration",
  }),
  consent_marketing: z.boolean().refine((v) => v === true, {
    message: "You must consent to electronic communications",
  }),
  consent_third_party: z.boolean().refine((v) => v === true, {
    message: "You must accept terms and conditions",
  }),
  // Steve 4/21 #16
  consent_legal_representation: z.boolean().refine((v) => v === true, {
    message: "You must authorize legal representation",
  }),
  consent_liability_limitation: z.boolean().refine((v) => v === true, {
    message: "You must accept the limitation of liability",
  }),
  consent_electronic_signature: z.boolean().refine((v) => v === true, {
    message: "You must consent to electronic signature",
  }),
});

export type OwnerFormData = z.infer<typeof ownerFormSchema>;

// ===========================================
// Property-Only Form (for adding additional properties)
// Skips owner profile — only property details + zone + consents
// ===========================================
export const propertyOnlySchema = z.object({
  // ─── Property Details (PDF 5.2.1.1) ───
  property_type: z.string({ message: "Select property type" }).min(1, "Select property type"),
  monthly_rent: z.coerce.number().min(300, "Minimum $300").max(8000, "Maximum $8000"),
  area_sqft: z.coerce.number().positive().optional().or(z.literal("")),
  area_unit: z.enum(["sqft", "m2"]).default("sqft"),
  occupancy_status: z.enum(["vacant", "occupied", "renovation", "new_construction"]).default("vacant"),
  vacancy_date: z.string().optional(),
  availability_date: z.string().optional(),
  bedrooms: z.string({ message: "Select bedrooms" }).min(1, "Select bedrooms"),
  bathrooms: z.string({ message: "Select bathrooms" }).min(1, "Select bathrooms"),
  amenities: z.array(z.string()).default([]),
  common_areas: z.array(z.string()).default([]),
  dishwasher: z.boolean().default(false),
  pet_friendly: z.boolean().default(false),
  smart_home: z.boolean().default(false),
  smart_home_features: z.array(z.string()).default([]),
  smart_home_other: z.string().optional(),
  shared_unit: z.boolean().default(false),
  levels: z.string().optional(),
  levels_other: z.string().optional(),
  furnished: z.boolean().default(false),
  utilities_included: z.boolean().default(false),
  style: z.string().optional(),
  style_other: z.string().optional(),
  amenities_other: z.string().optional(),
  listing_platforms: z.array(z.string()).default([]),
  listing_platforms_other: z.string().optional(),

  // ─── Zone Info (PDF 5.2.1.2) ───
  address: z.string({ message: "Address is required" }).min(1, "Address is required"),
  zone_city: z.string({ message: "City is required" }).min(1, "City is required"),
  province: z.string().default("British Columbia"),
  postal_code: z.string().optional(),
  near_parks: z.boolean().default(false),
  near_churches: z.boolean().default(false),
  near_skytrain: z.boolean().default(false),
  skytrain_lines: z.array(z.string()).default([]),
  near_bus: z.boolean().default(false),
  social_life: z.string().optional(),
  near_mall: z.boolean().default(false),
  nearby_supermarkets: z.array(z.string()).default([]),

  // ─── Legal Consents ───
  consent_image_usage: z.boolean().refine((v) => v === true, {
    message: "You must consent to image usage and editing",
  }),
  consent_data_processing: z.boolean().refine((v) => v === true, {
    message: "You must consent to rights and privacy declaration",
  }),
  consent_marketing: z.boolean().refine((v) => v === true, {
    message: "You must consent to electronic communications",
  }),
  consent_third_party: z.boolean().refine((v) => v === true, {
    message: "You must accept terms and conditions",
  }),
});

export type PropertyOnlyFormData = z.infer<typeof propertyOnlySchema>;

// ===========================================
// Tenant Form (with 8 premium criteria)
// British Columbia focused
// ===========================================
export const tenantFormSchema = z.object({
  // Employment & situation
  employment_type: z.enum(
    ["full_time", "part_time", "contract", "self_employed", "international_student"],
    { message: "Please select your current situation" }
  ),
  institution_type: z.string().optional(),
  institution_name: z.string().optional(),
  employment_verifiable: z.boolean().default(false),

  // People
  number_of_people: z.string({ message: "Please select how many people" }).min(1, "Please select how many people"),

  // Property type desired (multi-select)
  property_type_desired: z.array(z.string()).min(1, "Select at least one property type"),

  // Smart home
  smart_home_interest: z.boolean().default(false),
  smart_home_features: z.array(z.string()).default([]),
  smart_home_other: z.string().optional(),

  // Style & pet
  style_preference: z
    .enum(["modern", "classic", "minimalist", "elegant", "other"])
    .optional(),
  style_other: z.string().optional(),
  pet_friendly: z.boolean().default(false),

  // Levels & furnished & utilities
  levels_preferred: z.string().optional(),
  levels_other: z.string().optional(),
  furnished: z.boolean().default(false),
  utilities_included: z.boolean().default(false),

  // Zone / City preference (BC)
  preferred_zones: z.array(z.string()).min(1, "Select at least one zone"),

  // Budget
  min_budget: z.coerce.number().min(400, "Minimum $400"),
  max_budget: z.coerce.number().max(8000, "Maximum $8000"),

  // Move-in
  move_in_date: z.string({ message: "Move-in date is required" }).min(1, "Move-in date is required"),
  move_in_flexible: z.boolean().default(false),

  // Amenities
  preferred_amenities: z.array(z.string()).default([]),
  amenities_other: z.string().optional(),

  // Size (optional)
  size_sqft: z.coerce.number().positive().optional().or(z.literal("")),
  size_unit: z.enum(["sqft", "m2"]).default("sqft"),

  // Bedrooms / Bathrooms
  bedrooms_needed: z.string({ message: "Select bedrooms" }).min(1, "Select bedrooms"),
  bathrooms_needed: z.string({ message: "Select bathrooms" }).min(1, "Select bathrooms"),

  // Common areas
  common_areas: z.array(z.string()).default([]),

  // Contract duration
  contract_duration: z.string({ message: "Select contract duration" }).min(1, "Select contract duration"),

  // Location preferences
  near_bus: z.boolean().default(false),
  near_skytrain: z.boolean().default(false),
  skytrain_lines: z.array(z.string()).default([]),
  near_social: z.boolean().default(false),
  near_banks: z.boolean().default(false),
  near_downtown: z.boolean().default(false),
  prefers_urban_zone: z.boolean().default(false),

  // Parking
  parking_needed: z.boolean().default(false),

  // Additional
  additional_requirements: z.string().optional(),

  // Level 1 consent (required)
  consent_data_processing: z.boolean().refine((v) => v === true, {
    message: "You must consent to data processing",
  }),
  // Level 2 detailed consents
  consent_screening: z.boolean().default(false),
  consent_references: z.boolean().default(false),
  consent_communications: z.boolean().default(false),
  consent_truthfulness: z.boolean().default(false),
  consent_marketing: z.boolean().default(false),
});

export type TenantFormData = z.infer<typeof tenantFormSchema>;

// ===========================================
// PYMES Sales Leak Calculator
// 7 questions on 1-5 Likert scale
// ===========================================
export const pymesCalculatorSchema = z.object({
  // Company info
  company_name: z.string().min(2, "Company name is required"),
  contact_position: z.string().optional(),
  sector: z.enum(
    [
      "retail",
      "services",
      "technology",
      "food_beverage",
      "health",
      "education",
      "construction",
      "other",
    ],
    { message: "Please select a sector" }
  ),
  monthly_revenue: z.coerce
    .number()
    .positive("Monthly revenue must be greater than 0"),

  // 7 diagnostic questions (1-5 scale each)
  // Block 1: Digital Visibility
  q1_online_presence: z.coerce.number().min(1).max(5),
  q2_seo_positioning: z.coerce.number().min(1).max(5),
  // Block 2: Lead Generation
  q3_lead_generation: z.coerce.number().min(1).max(5),
  q4_lead_conversion: z.coerce.number().min(1).max(5),
  // Block 3: Retention & Loyalty
  q5_client_retention: z.coerce.number().min(1).max(5),
  q6_repeat_purchases: z.coerce.number().min(1).max(5),
  // Block 4: Marketing Strategy
  q7_marketing_strategy: z.coerce.number().min(1).max(5),
});

export type PymesCalculatorData = z.infer<typeof pymesCalculatorSchema>;
