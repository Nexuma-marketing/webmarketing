export type UserRole =
  | "propietario"
  | "propietario_preferido"
  | "inversionista"
  | "inquilino"
  | "inquilino_premium"
  | "pymes"
  | "admin";

export type LeadStatus = "nuevo" | "contactado" | "en_proceso" | "cerrado";
export type UrgencyLevel = "moderate" | "high" | "critical";
export type PaymentStatus = "pending" | "completed" | "failed" | "refunded";
export type PropertyServiceTier = "basic" | "preferred_owners" | "elite";
export type EliteTier = "essentials" | "signature" | "lujo";
export type PymesPlan = "rescue" | "growth" | "scale";
export type ImageStatus = "pending" | "approved" | "rejected";
export type ConsentType =
  | "data_processing"
  | "image_usage"
  | "marketing"
  | "third_party";

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: UserRole;
  company_name: string | null;
  property_count: number;
  is_premium_tenant: boolean;
  premium_criteria_met: number;
  created_at: string;
  updated_at: string;
}

export interface Property {
  id: string;
  owner_id: string;
  property_type: string;
  address: string;
  city: string;
  province: string | null;
  country: string;
  postal_code: string | null;
  monthly_rent: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  area_sqft: number | null;
  amenities: string[];
  is_available: boolean;
  service_tier: PropertyServiceTier | null;
  elite_tier: EliteTier | null;
  cfp_monthly: number | null;
  created_at: string;
  updated_at: string;
}

export interface PropertyImage {
  id: string;
  property_id: string;
  room_category: string;
  image_url: string;
  thumbnail_url: string | null;
  original_filename: string | null;
  file_size_bytes: number | null;
  width: number | null;
  height: number | null;
  orientation: string | null;
  resolution_ok: boolean;
  status: ImageStatus;
  validation_notes: string | null;
  sort_order: number;
  uploaded_at: string;
}

export interface DiscoveryBrief {
  id: string;
  user_id: string;
  property_objective: string;
  property_type: string;
  current_state: string;
  monthly_rent: number | null;
  main_challenge: string;
  property_count: number;
  has_professional_photos: boolean;
  current_listings: string[];
  marketing_budget: string | null;
  timeline: string | null;
  additional_comments: string | null;
  assigned_path: string | null;
  consent_data_processing: boolean;
  consent_image_usage: boolean;
  consent_marketing: boolean;
  consent_third_party: boolean;
  created_at: string;
  updated_at: string;
}

export interface TenantPreferences {
  id: string;
  user_id: string;
  preferred_city: string | null;
  preferred_zones: string[];
  min_budget: number | null;
  max_budget: number | null;
  bedrooms_needed: number | null;
  bathrooms_needed: number | null;
  move_in_date: string | null;
  employment_type: string | null;
  employment_verifiable: boolean;
  seeks_premium_amenities: boolean;
  preferred_amenities: string[];
  prefers_urban_zone: boolean;
  smart_home_interest: boolean;
  style_preference: string | null;
  contract_duration: string | null;
  premium_criteria_count: number;
  is_premium: boolean;
  consent_data_processing: boolean;
  consent_marketing: boolean;
  pet_friendly: boolean;
  parking_needed: boolean;
  additional_requirements: string | null;
  created_at: string;
  updated_at: string;
}

export interface PymesDiagnosis {
  id: string;
  user_id: string;
  company_name: string;
  sector: string;
  monthly_revenue: number;
  q1_online_presence: number;
  q2_seo_positioning: number;
  q3_lead_generation: number;
  q4_lead_conversion: number;
  q5_client_retention: number;
  q6_repeat_purchases: number;
  q7_marketing_strategy: number;
  total_score: number | null;
  urgency_level: UrgencyLevel | null;
  estimated_loss: number | null;
  recommended_plan: PymesPlan | null;
  recommendation_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface Service {
  id: string;
  name: string;
  description: string | null;
  long_description: string | null;
  category: string;
  subcategory: string | null;
  tier: string | null;
  price: number;
  currency: string;
  is_active: boolean;
  status: string;
  visible_on_web: boolean;
  target_time: string | null;
  recurring_interval: string | null;
  media_urls: string[];
  target_roles: UserRole[];
  features: string[];
  features_basic: string[];
  features_preferred: string[];
  features_elite: string[];
  created_at: string;
  updated_at: string;
}

export interface PymesPlanRecord {
  id: string;
  plan_type: PymesPlan;
  name: string;
  price: number;
  upfront_amount: number | null;
  installment_amount: number | null;
  installment_months: number | null;
  features: string[];
  urgency_levels: UrgencyLevel[];
  is_active: boolean;
  created_at: string;
}

export interface Lead {
  id: string;
  user_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  role: UserRole | null;
  source: string | null;
  status: LeadStatus;
  notes: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  user_id: string;
  service_id: string | null;
  pymes_plan_id: string | null;
  stripe_session_id: string;
  stripe_payment_intent_id: string | null;
  stripe_subscription_id: string | null;
  amount: number;
  currency: string;
  payment_type: string | null;
  installment_number: number | null;
  status: PaymentStatus;
  created_at: string;
  updated_at: string;
}

export interface ConsentLog {
  id: string;
  user_id: string;
  consent_type: ConsentType;
  granted: boolean;
  ip_address: string | null;
  user_agent: string | null;
  granted_at: string;
}

export interface EmailLog {
  id: string;
  recipient_email: string;
  recipient_type: string | null;
  template: string;
  subject: string;
  sent_at: string;
  status: string;
}
