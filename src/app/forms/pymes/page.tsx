"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import { pymesCalculatorSchema, type PymesCalculatorData } from "@/types/forms";
import { PYMES_PLANS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { BarChart3, TrendingDown, Users, ArrowRight, CheckCircle2, Calendar } from "lucide-react";
import { useFormFieldMeta, fieldDisplay } from "@/lib/form-meta";
import { DynamicField } from "@/components/forms/dynamic-field";

const SECTORS = [
  { value: "retail", label: "Retail / Commerce" },
  { value: "services", label: "Services" },
  { value: "technology", label: "Technology" },
  { value: "food_beverage", label: "Food & Beverage" },
  { value: "health", label: "Health & Wellness" },
  { value: "education", label: "Education" },
  { value: "construction", label: "Construction" },
  { value: "other", label: "Other" },
];

const LIKERT_OPTIONS = [
  { value: 1, label: "1 - No / Very poor" },
  { value: 2, label: "2 - Weak" },
  { value: 3, label: "3 - Average" },
  { value: 4, label: "4 - Good" },
  { value: 5, label: "5 - Excellent / Yes" },
];

interface QuestionDef {
  field: keyof PymesCalculatorData;
  block: string;
  question: string;
  helpText: string;
}

const QUESTIONS: QuestionDef[] = [
  {
    field: "q1_online_presence",
    block: "SALES",
    question: "Is your flow of new clients constant and predictable month to month?",
    helpText: "1 = No, very irregular / 5 = Yes, constant and predictable",
  },
  {
    field: "q2_seo_positioning",
    block: "SALES",
    question: "Do you have an automated system to follow up with prospects?",
    helpText: "1 = No system at all / 5 = Yes, fully automated follow-up",
  },
  {
    field: "q3_lead_generation",
    block: "BRAND",
    question: "Is your value proposition so clear that a child would understand it in 10 seconds?",
    helpText: "1 = Not clear at all / 5 = Absolutely clear and compelling",
  },
  {
    field: "q4_lead_conversion",
    block: "BRAND",
    question: "Does your visual identity look more professional than your direct competition?",
    helpText: "1 = No, it looks amateur / 5 = Yes, clearly more professional",
  },
  {
    field: "q5_client_retention",
    block: "SYSTEMS",
    question: "Can your business operate for a week without you intervening operationally?",
    helpText: "1 = No, it depends on me entirely / 5 = Yes, it runs on its own",
  },
  {
    field: "q6_repeat_purchases",
    block: "SYSTEMS",
    question: "Do you measure the exact cost of acquiring each new client?",
    helpText: "1 = No idea what it costs / 5 = Yes, I know the exact CAC",
  },
  {
    field: "q7_marketing_strategy",
    block: "FUTURE",
    question: "Cost of inaction: How serious would it be to continue the same way for 12 months?",
    helpText: "1 = Not critical at all / 5 = Extremely critical, could threaten the business",
  },
];

function calculateResults(data: PymesCalculatorData) {
  const totalScore =
    data.q1_online_presence +
    data.q2_seo_positioning +
    data.q3_lead_generation +
    data.q4_lead_conversion +
    data.q5_client_retention +
    data.q6_repeat_purchases +
    data.q7_marketing_strategy;

  const estimatedLoss = data.monthly_revenue * 0.3 * 12;

  let urgencyLevel: "critical" | "high" | "moderate";
  let recommendedPlan: "rescue" | "growth" | "scale";

  if (totalScore <= 14) {
    urgencyLevel = "critical";
    recommendedPlan = "rescue";
  } else if (totalScore <= 24) {
    urgencyLevel = "high";
    recommendedPlan = "growth";
  } else {
    urgencyLevel = "moderate";
    recommendedPlan = "scale";
  }

  return { totalScore, estimatedLoss, urgencyLevel, recommendedPlan };
}

// ─── Urgency messages per MVP PDF 5.1.1.1 (English) ──
const URGENCY_MESSAGES: Record<string, { emoji: string; title: string; body: string }> = {
  critical: {
    emoji: "🔴",
    title: "Your company is losing money every hour.",
    body: "You need a restructuring before it's too late.",
  },
  high: {
    emoji: "🟠",
    title: "You have growth opportunities you're not taking advantage of.",
    body: "A strategic plan can change the course.",
  },
  moderate: {
    emoji: "🟢",
    title: "Your business has a solid foundation.",
    body: "With optimization you can scale to the next level.",
  },
};

// ═══════════════════════════════════════════════════════
// Client Acquisition Form (PDF 5.1.2)
// ═══════════════════════════════════════════════════════
const CAPTACION_STEPS = [
  {
    title: "Business Profile",
    fields: [
      { name: "business_name", label: "Business name", type: "text", required: true },
      { name: "industry", label: "Industry / Sector", type: "select", required: true,
        options: SECTORS },
      { name: "years_in_business", label: "Years in business", type: "number", required: true },
      { name: "business_goals", label: "Main business goals (select all that apply)", type: "multi",
        options: [
          "Increase revenue",
          "Get more clients",
          "Improve brand awareness",
          "Launch new product/service",
          "Expand to new market",
          "Improve client retention",
        ] },
    ],
  },
  {
    title: "Target Audience",
    fields: [
      { name: "target_age_range", label: "Target customer age range", type: "select", required: true,
        options: [
          { value: "18_25", label: "18-25" },
          { value: "26_35", label: "26-35" },
          { value: "36_50", label: "36-50" },
          { value: "51_65", label: "51-65" },
          { value: "65_plus", label: "65+" },
          { value: "all_ages", label: "All ages" },
        ] },
      { name: "target_location", label: "Target customer location", type: "text", required: true },
      { name: "target_income", label: "Target customer income level", type: "select", required: false,
        options: [
          { value: "low", label: "Budget-conscious" },
          { value: "medium", label: "Middle income" },
          { value: "high", label: "High income" },
          { value: "premium", label: "Premium / Luxury" },
        ] },
      { name: "ideal_customer_description", label: "Describe your ideal customer", type: "textarea", required: true },
    ],
  },
  {
    title: "Current Marketing",
    fields: [
      { name: "current_channels", label: "Current marketing channels (select all)", type: "multi",
        options: [
          "Social media (organic)",
          "Social media (paid ads)",
          "Google Ads",
          "Email marketing",
          "Content / Blog",
          "Referrals / Word of mouth",
          "Events / Networking",
          "None",
        ] },
      { name: "monthly_marketing_budget", label: "Monthly marketing budget (CAD)", type: "number", required: false },
      { name: "biggest_challenge", label: "Biggest marketing challenge", type: "select", required: true,
        options: [
          { value: "no_leads", label: "Not generating enough leads" },
          { value: "low_conversion", label: "Low conversion rate" },
          { value: "no_strategy", label: "No clear strategy" },
          { value: "no_budget", label: "Limited budget" },
          { value: "no_time", label: "No time to manage marketing" },
          { value: "other", label: "Other" },
        ] },
    ],
  },
];

function CaptacionForm({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const [captStep, setCaptStep] = useState(0);
  const [captLoading, setCaptLoading] = useState(false);
  const [captError, setCaptError] = useState<string | null>(null);
  const [captSuccess, setCaptSuccess] = useState(false);
  const [captData, setCaptData] = useState<Record<string, string | number | string[]>>({
    business_goals: [],
    current_channels: [],
  });

  function updateField(name: string, value: string | number | string[]) {
    setCaptData((prev) => ({ ...prev, [name]: value }));
  }

  function toggleMulti(name: string, value: string) {
    const arr = (captData[name] as string[]) || [];
    const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
    updateField(name, next);
  }

  function validateStep(): string | null {
    const stepDef = CAPTACION_STEPS[captStep];
    for (const field of stepDef.fields) {
      if (!field.required) continue;
      const val = captData[field.name];
      if (field.type === "multi") {
        if (!val || (val as string[]).length === 0) return `Please fill in: ${field.label}`;
      } else {
        if (!val || val === "") return `Please fill in: ${field.label}`;
      }
    }
    return null;
  }

  function nextCaptStep() {
    const err = validateStep();
    if (err) { setCaptError(err); return; }
    setCaptError(null);
    setCaptStep(captStep + 1);
  }

  async function submitCaptacion() {
    const err = validateStep();
    if (err) { setCaptError(err); return; }

    setCaptLoading(true);
    setCaptError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        // Steve 4/22 #7: Don't redirect to login mid-submission; show friendly error instead
        setCaptError("Your session has expired. Please refresh the page and try again (your data may be lost).");
        setCaptLoading(false);
        return;
      }

      const { error: insertError } = await supabase
        .from("pymes_captacion")
        .insert({
          user_id: user.id,
          business_name: captData.business_name,
          industry: captData.industry,
          years_in_business: captData.years_in_business,
          business_goals: captData.business_goals,
          target_age_range: captData.target_age_range,
          target_location: captData.target_location,
          target_income: captData.target_income || null,
          ideal_customer_description: captData.ideal_customer_description,
          current_channels: captData.current_channels,
          monthly_marketing_budget: captData.monthly_marketing_budget || null,
          biggest_challenge: captData.biggest_challenge,
        });

      if (insertError) throw insertError;

      await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "pymes_captacion" }),
      });

      // Steve 4/21 #7: Send lead email to commercial area
      await fetch("/api/pymes-captacion-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_name: captData.business_name,
          industry: captData.industry,
          business_goals: captData.business_goals,
          biggest_challenge: captData.biggest_challenge,
        }),
      }).catch((err) => console.error("Captacion email failed:", err));

      setCaptSuccess(true);
    } catch (e) {
      setCaptError("Failed to save. Please try again.");
      console.error(e);
    } finally {
      setCaptLoading(false);
    }
  }

  const currentStepDef = CAPTACION_STEPS[captStep];
  const progress = Math.round(((captStep + 1) / CAPTACION_STEPS.length) * 100);

  if (captSuccess) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-background to-secondary/20 px-4 py-8">
        <Card className="w-full max-w-xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Submission Received!</CardTitle>
            <CardDescription>
              Thank you. Our team will review your profile and contact you to schedule a personalized rescue session.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
              <p className="text-sm font-medium">What happens next?</p>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc ml-4">
                <li>Our commercial team has been notified and will contact you within 24 hours</li>
                <li>We review your business profile and target audience</li>
                <li>We design a tailored client acquisition strategy during your rescue session</li>
              </ul>
            </div>
            <div className="flex flex-col gap-2">
              {/* Steve 4/21 #7: Primary CTA — AGENDAR MI SESIÓN DE RESCATE */}
              <Button
                onClick={async () => {
                  // Steve 4/24 #6: Robust handling — show success/error feedback explicitly
                  try {
                    const res = await fetch("/api/pymes-captacion-email", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        business_name: captData.business_name,
                        industry: captData.industry,
                        business_goals: captData.business_goals,
                        biggest_challenge: captData.biggest_challenge,
                        reschedule: true,
                      }),
                    });
                    if (!res.ok) {
                      const errBody = await res.json().catch(() => ({}));
                      console.error("Schedule session failed:", res.status, errBody);
                      alert(
                        res.status === 401
                          ? "Your session expired. Please refresh the page and try again."
                          : `Could not send the request (status ${res.status}). Please try again or contact us directly.`
                      );
                      return;
                    }
                    alert("Our commercial team has been notified. They will contact you shortly to schedule your rescue session.");
                  } catch (err) {
                    console.error("Schedule session error:", err);
                    alert("Network error. Please check your connection and try again.");
                  }
                }}
                size="lg"
                className="w-full gap-2 bg-red-600 hover:bg-red-700"
              >
                <Calendar className="h-5 w-5" />
                SCHEDULE MY RESCUE SESSION
              </Button>
              <Button variant="outline" onClick={() => router.push("/dashboard")} className="w-full">
                Go to Dashboard
              </Button>
              <Button variant="ghost" onClick={onBack} className="w-full">
                Back to Assessments
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-background to-secondary/20 px-4 py-8">
      <div className="mb-8 w-full max-w-xl">
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            Client Acquisition — Step {captStep + 1} of {CAPTACION_STEPS.length}
          </span>
          <span>{progress}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted">
          <div className="h-2 rounded-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle className="text-xl">{currentStepDef.title}</CardTitle>
          <CardDescription>
            {captStep === 0 && "Tell us about your business profile and goals."}
            {captStep === 1 && "Define your ideal target audience."}
            {captStep === 2 && "Tell us about your current marketing efforts."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {captError && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{captError}</div>
          )}

          {currentStepDef.fields.map((field) => (
            <div key={field.name} className="space-y-2">
              <Label>{field.label}{field.required && " *"}</Label>

              {field.type === "text" && (
                <Input
                  value={(captData[field.name] as string) || ""}
                  onChange={(e) => updateField(field.name, e.target.value)}
                  placeholder={`Enter ${field.label.toLowerCase()}`}
                />
              )}

              {field.type === "number" && (
                <Input
                  type="number"
                  value={(captData[field.name] as number) || ""}
                  onChange={(e) => updateField(field.name, parseInt(e.target.value) || 0)}
                  placeholder="0"
                />
              )}

              {field.type === "textarea" && (
                <textarea
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={(captData[field.name] as string) || ""}
                  onChange={(e) => updateField(field.name, e.target.value)}
                  placeholder={`Describe...`}
                  rows={3}
                />
              )}

              {field.type === "select" && field.options && (
                <Select
                  value={(captData[field.name] as string) || undefined}
                  onValueChange={(val: string | null) => val && updateField(field.name, val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options.map((opt) => {
                      const v = typeof opt === "string" ? opt : opt.value;
                      const l = typeof opt === "string" ? opt : opt.label;
                      return <SelectItem key={v} value={v}>{l}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              )}

              {field.type === "multi" && field.options && (
                <div className="grid grid-cols-2 gap-2">
                  {(field.options as string[]).map((opt) => (
                    <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={((captData[field.name] as string[]) || []).includes(opt)}
                        onChange={() => toggleMulti(field.name, opt)}
                        className="rounded border-input"
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </CardContent>

        <div className="flex justify-between px-6 pb-6">
          {captStep > 0 ? (
            <Button type="button" variant="ghost" onClick={() => { setCaptStep(captStep - 1); setCaptError(null); }}>
              Back
            </Button>
          ) : (
            <Button type="button" variant="ghost" onClick={onBack}>
              Back to selection
            </Button>
          )}
          {captStep < CAPTACION_STEPS.length - 1 ? (
            <Button type="button" onClick={nextCaptStep}>
              Next
            </Button>
          ) : (
            <Button type="button" onClick={submitCaptacion} disabled={captLoading}>
              {captLoading ? "Submitting..." : "Submit"}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

export default function PymesCalculatorPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formType, setFormType] = useState<"selector" | "diagnosis" | "captacion">("selector");
  const [step, setStep] = useState(1); // 1: company info, 2-8: questions, 9: submit
  const [error, setError] = useState<string | null>(null);
  const [reviewCountdown, setReviewCountdown] = useState(0); // Steve #6-2: force read time on review step

  // Steve 4/28 round 2: admin-editable form metadata overlay.
  const fieldMeta = useFormFieldMeta("pymes_diagnosis");

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
    trigger,
  } = useForm<PymesCalculatorData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(pymesCalculatorSchema) as any,
    defaultValues: {
      q1_online_presence: 0,
      q2_seo_positioning: 0,
      q3_lead_generation: 0,
      q4_lead_conversion: 0,
      q5_client_retention: 0,
      q6_repeat_purchases: 0,
      q7_marketing_strategy: 0,
    },
  });

  const totalSteps = 9; // 1 company + 7 questions + 1 review
  const progress = Math.round((step / totalSteps) * 100);

  // Browser back button navigates to previous step (#30)
  const handlePopState = useCallback(() => {
    if (formType !== "selector") {
      setStep((prev) => {
        if (prev > 1) return prev - 1;
        setFormType("selector");
        return 1;
      });
    }
  }, [formType]);

  useEffect(() => {
    if (formType !== "selector") {
      window.history.pushState({ step }, "", `#step-${step}`);
    }
  }, [step, formType]);

  useEffect(() => {
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [handlePopState]);

  // Steve #6-2: when entering review step (9), start 6-second countdown
  // so user has time to read the urgency message before submitting
  useEffect(() => {
    if (step === 9 && formType === "diagnosis") {
      setReviewCountdown(6);
      const interval = setInterval(() => {
        setReviewCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [step, formType]);

  async function nextStep() {
    if (step === 1) {
      const valid = await trigger(["company_name", "sector", "monthly_revenue"]);
      if (!valid) return;
    }
    setStep(step + 1);
  }

  async function onSubmit(data: PymesCalculatorData) {
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const results = calculateResults(data);

      const { data: diagnosis, error: insertError } = await supabase
        .from("pymes_diagnosis")
        .insert({
          user_id: user.id,
          company_name: data.company_name,
          contact_position: data.contact_position || null,
          sector: data.sector,
          employee_count: "N/A",
          monthly_revenue: data.monthly_revenue,
          main_challenge: "sales_leak",
          q1_online_presence: data.q1_online_presence,
          q2_seo_positioning: data.q2_seo_positioning,
          q3_lead_generation: data.q3_lead_generation,
          q4_lead_conversion: data.q4_lead_conversion,
          q5_client_retention: data.q5_client_retention,
          q6_repeat_purchases: data.q6_repeat_purchases,
          q7_marketing_strategy: data.q7_marketing_strategy,
          total_score: results.totalScore,
          urgency_level: results.urgencyLevel,
          estimated_loss: results.estimatedLoss,
          recommended_plan: results.recommendedPlan,
        })
        .select("id")
        .single();

      if (insertError) throw insertError;

      // Create lead
      await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "pymes_calculator" }),
      });

      // Steve 4/21 #6: Send result email to user with recommendation + CTAs
      await fetch("/api/pymes-result-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          diagnosis_id: diagnosis?.id,
          monthly_revenue: data.monthly_revenue,
        }),
      }).catch((err) => console.error("PYMES email failed:", err));

      router.push(`/results/pymes/${diagnosis?.id}`);
    } catch (err) {
      setError("Failed to save diagnosis. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const currentQuestion = step >= 2 && step <= 8 ? QUESTIONS[step - 2] : null;

  // ─── Form Selector (#24) ─────────────────────────────
  if (formType === "selector") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-background to-secondary/20 px-4 py-8">
        <div className="w-full max-w-2xl space-y-6">
          <div className="text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-accent/10 px-4 py-1.5 text-sm font-medium text-accent">
              <BarChart3 className="h-4 w-4" />
              Business Marketing
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Choose Your Assessment</h1>
            <p className="mt-2 text-muted-foreground">
              Select the type of assessment that best fits your business needs.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Diagnosis form */}
            <button
              type="button"
              onClick={() => { setFormType("diagnosis"); setStep(1); }}
              className="group rounded-2xl border border-accent/20 bg-card p-6 text-left transition-all hover:-translate-y-1 hover:shadow-lg hover:shadow-accent/10 hover:border-accent/40"
            >
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10">
                <TrendingDown className="h-6 w-6 text-accent" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Sales Leak Diagnosis</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Discover how much revenue your business is leaking due to marketing inefficiencies.
                Get a personalized plan based on your score.
              </p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>- 7 diagnostic questions</li>
                <li>- Estimated annual loss calculation</li>
                <li>- Recommended plan (Rescue / Growth / Scale)</li>
              </ul>
              <div className="mt-4 flex items-center gap-1 text-sm font-medium text-accent">
                Start diagnosis Free <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </button>

            {/* Captacion form */}
            <button
              type="button"
              onClick={() => { setFormType("captacion"); setStep(1); }}
              className="group rounded-2xl border border-primary/20 bg-card p-6 text-left transition-all hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/10 hover:border-primary/40"
            >
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Client Acquisition</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Tell us about your business and ideal customer so we can design a targeted
                client acquisition strategy.
              </p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>- Business profile & goals</li>
                <li>- Target audience definition</li>
                <li>- Custom acquisition strategy</li>
              </ul>
              <div className="mt-4 flex items-center gap-1 text-sm font-medium text-primary">
                Start acquisition form <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Captacion form (PDF 5.1.2) ─────────────────────
  if (formType === "captacion") {
    return (
      <CaptacionForm onBack={() => setFormType("selector")} />
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-background to-secondary/20 px-4 py-8">
      {/* Progress */}
      <div className="mb-8 w-full max-w-xl">
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <BarChart3 className="h-3.5 w-3.5" />
            Sales Leak Calculator
          </span>
          <span>{progress}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted">
          <div
            className="h-2 rounded-full bg-accent transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <Card className="w-full max-w-xl">
        <form onSubmit={handleSubmit(onSubmit, (validationErrors) => {
          const firstField = Object.keys(validationErrors)[0];
          const firstError = validationErrors[firstField as keyof typeof validationErrors];
          setError(`Validation error: ${firstError?.message || firstField}`);
          console.error("Form validation errors:", validationErrors);
        })}>
          <CardHeader>
            <CardTitle className="text-xl">
              {step === 1
                ? "Company Information"
                : step <= 8
                  ? `${currentQuestion?.block}`
                  : "Your Results Preview"}
            </CardTitle>
            <CardDescription>
              {step === 1
                ? "Tell us about your business to start the diagnosis."
                : step <= 8
                  ? `Question ${step - 1} of 7`
                  : "Review and submit to see your full diagnosis."}
            </CardDescription>
          </CardHeader>

          <CardContent className="min-h-[200px]">
            {error && (
              <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Step 1: Company Info */}
            {step === 1 && (
              <div className="space-y-4">
                <DynamicField meta={fieldMeta} fieldKey="business_name" fallbackLabel="Company name" htmlFor="company_name">
                  <Input
                    id="company_name"
                    placeholder="Your Business Inc."
                    {...register("company_name")}
                  />
                  {errors.company_name && (
                    <p className="text-sm text-destructive">
                      {errors.company_name.message}
                    </p>
                  )}
                </DynamicField>
                <div className="space-y-2">
                  <Label htmlFor="contact_position">Your position / Job title</Label>
                  <Input
                    id="contact_position"
                    placeholder="e.g. CEO, Marketing Manager"
                    {...register("contact_position")}
                  />
                </div>
                <DynamicField meta={fieldMeta} fieldKey="industry" fallbackLabel="Industry sector">
                  <Select
                    value={watch("sector") as string | undefined}
                    onValueChange={(val: string | null) =>
                      val && setValue(
                        "sector",
                        val as PymesCalculatorData["sector"]
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select sector" />
                    </SelectTrigger>
                    <SelectContent>
                      {SECTORS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.sector && (
                    <p className="text-sm text-destructive">
                      {errors.sector.message}
                    </p>
                  )}
                </DynamicField>
                <DynamicField meta={fieldMeta} fieldKey="monthly_revenue" fallbackLabel="Monthly revenue (CAD)" fallbackHelper="This is used to calculate your estimated annual loss." htmlFor="monthly_revenue">
                  <Input
                    id="monthly_revenue"
                    type="number"
                    placeholder="e.g. 25000"
                    {...register("monthly_revenue")}
                  />
                  {errors.monthly_revenue && (
                    <p className="text-sm text-destructive">
                      {errors.monthly_revenue.message}
                    </p>
                  )}
                </DynamicField>
              </div>
            )}

            {/* Steps 2-8: Diagnostic Questions */}
            {currentQuestion && (
              <div className="space-y-4">
                <div className="rounded-lg border bg-muted/30 p-4">
                  <p className="text-base font-medium">
                    {currentQuestion.question}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {currentQuestion.helpText}
                  </p>
                </div>
                <div className="grid gap-2">
                  {LIKERT_OPTIONS.map((opt) => {
                    const fieldValue = watch(currentQuestion.field as keyof PymesCalculatorData);
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setValue(
                            currentQuestion.field as keyof PymesCalculatorData,
                            opt.value as never,
                            { shouldValidate: true }
                          );
                        }}
                        className={`rounded-lg border p-3 text-left text-sm transition-all hover:border-accent hover:bg-accent/5 ${
                          fieldValue === opt.value
                            ? "border-accent bg-accent/5 font-medium"
                            : "border-border"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 9: Review - PDF 5.1.1.1 format (#26) */}
            {step === 9 && (
              <div className="space-y-4">
                {(() => {
                  const formValues = watch();
                  if (
                    !formValues.q1_online_presence ||
                    !formValues.monthly_revenue
                  )
                    return null;
                  const results = calculateResults(formValues as PymesCalculatorData);
                  const msg = URGENCY_MESSAGES[results.urgencyLevel];
                  return (
                    <>
                      {/* PDF 5.1.1.1 style urgency message */}
                      <div
                        className={`rounded-lg border-2 p-6 ${
                          results.urgencyLevel === "critical"
                            ? "border-red-300 bg-red-50"
                            : results.urgencyLevel === "high"
                              ? "border-orange-300 bg-orange-50"
                              : "border-green-300 bg-green-50"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span className="text-3xl">{msg.emoji}</span>
                          <div className="flex-1 space-y-2">
                            <p className="text-lg font-bold leading-tight">{msg.title}</p>
                            <p className="text-base leading-relaxed">{msg.body}</p>
                            <p className="text-sm leading-relaxed mt-2">
                              You are missing out on{" "}
                              <strong className="text-lg">
                                ${results.estimatedLoss.toLocaleString()} CAD annually
                              </strong>{" "}
                              due to marketing and process inefficiencies.
                            </p>
                          </div>
                        </div>
                        <p className="mt-4 pt-3 border-t text-sm text-muted-foreground">
                          Diagnostic Score: <strong>{results.totalScore} / 35</strong>
                        </p>
                      </div>
                      <p className="text-xs text-center text-muted-foreground">
                        Take your time to review. Click &quot;Get Full Results&quot; below when ready.
                      </p>

                      {/* Steve #6-2 (4/19): Plan description uses centralized PYMES_PLANS
                          data — single source of truth matches Services page and Results page */}
                      {(() => {
                        const plan = PYMES_PLANS[results.recommendedPlan];
                        if (!plan) return null;
                        return (
                          <div className="rounded-lg border p-4 space-y-3">
                            <p className="text-sm font-medium">Recommended Plan</p>
                            <p className={`text-lg font-bold ${plan.color}`}>
                              Plan {plan.name}
                            </p>
                            <p className="text-sm font-semibold">
                              {plan.price}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {plan.tagline}
                            </p>
                            <div className="rounded-md border bg-muted/30 p-2 space-y-1">
                              <p className="text-xs font-medium">Payment Options:</p>
                              <p className="text-xs text-muted-foreground">
                                {plan.upfront}, then {plan.installment}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Or full payment upfront. Accepted: e-Transfer, credit card, or bank transfer.
                              </p>
                              <p className="text-xs text-muted-foreground">{plan.duration}</p>
                            </div>
                            <ul className="text-xs text-muted-foreground space-y-1 list-disc ml-4">
                              {plan.features.map((feat, i) => (
                                <li key={i}>{feat}</li>
                              ))}
                            </ul>
                          </div>
                        );
                      })()}
                    </>
                  );
                })()}
              </div>
            )}
          </CardContent>

          {/* Navigation */}
          <div className="flex justify-between px-6 pb-6">
            {step > 1 ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep(step - 1)}
              >
                Back
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setFormType("selector")}
              >
                Back to selection
              </Button>
            )}
            {step === 9 ? (
              <Button type="submit" disabled={loading || reviewCountdown > 0}>
                {loading
                  ? "Submitting..."
                  : reviewCountdown > 0
                    ? `Read the message (${reviewCountdown}s)`
                    : "Get Full Results"}
              </Button>
            ) : step === 8 ? (
              <Button type="button" onClick={() => setStep(9)}>
                See Results
              </Button>
            ) : (
              <Button type="button" onClick={nextStep}>
                Next
              </Button>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}
