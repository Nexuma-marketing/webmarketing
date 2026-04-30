"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Crown, Save } from "lucide-react";

// The plan tiers Steve refers to in his 4/28 PDF item #9 — Basic / Preferred Owners /
// Elite Assets / Investor portfolios (Essentials / Signature / Lujo) / PYMES Rescue /
// Growth / Scale. Stored as app_config rows with category="plan_features:<key>" so
// admin can edit them without redeploying.
//
// Steve 4/29: defaults below mirror EXACTLY what the user sees on /dashboard/services
// (Marketing campaign per property until tenant found …) so an admin opening this
// page for the first time sees the live copy and their edits replace it 1:1.
// `supportsTiming` adds a "Tiempo objetivo" field that maps to plan_timing:<key>
// — Steve 4/29 #9 ("no vi donde cambiar esto").
const PLANS: {
  key: string;
  label: string;
  defaultTagline: string;
  defaultFeatures: string[];
  color: string;
  supportsTiming?: boolean;
  defaultTiming?: string;
}[] = [
  {
    key: "owner_basic",
    label: "Owner — Basic",
    defaultTagline: "Marketing that maximizes your profitability — your property, your money",
    defaultFeatures: [
      "Marketing campaign per property until tenant found (~16 days avg.)",
      "Client-uploaded photos with validation",
      "Visual recommendations prior to listing",
      "Unit verification (on-site visit)",
      "Tenant credit screening",
      "RTB-1 (BC) contract drafting & signing",
    ],
    color: "border-blue-200",
    supportsTiming: true,
    defaultTiming: "~16 days avg.",
  },
  {
    key: "owner_preferred",
    label: "Owner — Preferred Owners",
    defaultTagline: "Enhanced services for growing property portfolios (2–3 properties)",
    defaultFeatures: [
      "Marketing campaign per property until tenant found (~15 days avg.)",
      "Client-uploaded photos",
      "Weekly interested-parties report",
      "Priority credit analysis of best applicants",
      "Full credit screening of tenants",
      "Unit handover with inventory checklist",
      "RTB-1 (BC) contract drafting & signing",
    ],
    color: "border-emerald-200",
    supportsTiming: true,
    defaultTiming: "~15 days avg.",
  },
  {
    key: "owner_elite",
    label: "Owner — Elite Assets & Legacy",
    defaultTagline: "Full-service management for investment portfolios (4+ properties)",
    defaultFeatures: [
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
    color: "border-amber-200",
    supportsTiming: true,
    defaultTiming: "~15 days avg.",
  },
  {
    key: "investor_essentials",
    label: "Investor — Essentials",
    defaultTagline: "Entry-tier portfolio optimization for $2,500–$3,999/mo rents",
    defaultFeatures: [
      "$100/month shared portfolio fee",
      "Portfolio matching across cities",
      "Quarterly performance review",
    ],
    color: "border-sky-200",
  },
  {
    key: "investor_signature",
    label: "Investor — Signature",
    defaultTagline: "Mid-tier portfolio management for $4,000–$7,000/mo rents",
    defaultFeatures: [
      "$100/month shared portfolio fee",
      "Concierge tenant placement",
      "Monthly portfolio review",
      "Premium tenant priority",
    ],
    color: "border-indigo-200",
  },
  {
    key: "investor_lujo",
    label: "Investor — Lujo",
    defaultTagline: "Top-tier portfolio management for $7,001+/mo rents",
    defaultFeatures: [
      "$300/month shared portfolio fee",
      "White-glove concierge",
      "Weekly performance updates",
      "Dedicated investor advisor",
    ],
    color: "border-purple-200",
  },
  {
    key: "pymes_rescue",
    label: "PYMES — Rescue",
    defaultTagline: "Intensive intervention plan to exit critical mode and move to growth",
    defaultFeatures: [
      "Complete business diagnosis & sales leak analysis",
      "Digital presence emergency recovery",
      "Basic optimization (Google Business, Social Media, SEO)",
      "Lead capture structure & funnel setup",
      "Direct 1-on-1 advisory sessions",
      "Monthly KPI performance report",
    ],
    color: "border-red-200",
  },
  {
    key: "pymes_growth",
    label: "PYMES — Growth",
    defaultTagline: "Plan to overcome stagnation, correct weaknesses and start growing",
    defaultFeatures: [
      "Complete business diagnosis & sales leak analysis",
      "Marketing strategy development & execution",
      "Conversion rate optimization",
      "Campaign structure & ad management",
      "Lead tracking system implementation",
      "Market positioning analysis",
      "Bi-weekly KPI performance reports",
    ],
    color: "border-orange-200",
  },
  {
    key: "pymes_scale",
    label: "PYMES — Scale",
    defaultTagline: "Plan to scale and maximize revenue with advanced strategies",
    defaultFeatures: [
      "Complete business diagnosis & sales leak analysis",
      "Advanced multi-channel optimization",
      "Channel expansion & new market entry",
      "Growth strategy & scaling roadmap",
      "Opportunity & competitor analysis",
      "Weekly KPI performance reports",
    ],
    color: "border-green-200",
  },
];

interface PlanState {
  tagline: string;
  features: string;
  timing: string;
}

export default function AdminPlansPage() {
  const [state, setState] = useState<Record<string, PlanState>>({});
  const [originalState, setOriginalState] = useState<Record<string, PlanState>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const supabase = createClient();

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("app_config")
      .select("category, key, value")
      .or("category.like.plan_features:%,category.like.plan_timing:%");

    const next: Record<string, PlanState> = {};
    for (const plan of PLANS) {
      const featCat = `plan_features:${plan.key}`;
      const timeCat = `plan_timing:${plan.key}`;
      const tagline = data?.find((r) => r.category === featCat && r.key === "tagline")?.value;
      const features = data?.find((r) => r.category === featCat && r.key === "features")?.value;
      const timing = data?.find((r) => r.category === timeCat && r.key === "time_to_tenant")?.value;
      next[plan.key] = {
        tagline: tagline ?? plan.defaultTagline,
        features: features ?? plan.defaultFeatures.join("\n"),
        timing: timing ?? plan.defaultTiming ?? "",
      };
    }

    setState(next);
    setOriginalState(JSON.parse(JSON.stringify(next)));
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function savePlan(key: string) {
    setSavingKey(key);
    setMessage(null);
    const featCat = `plan_features:${key}`;
    const timeCat = `plan_timing:${key}`;
    const plan = PLANS.find((p) => p.key === key);
    const rows: { category: string; key: string; value: string }[] = [
      { category: featCat, key: "tagline", value: state[key].tagline },
      { category: featCat, key: "features", value: state[key].features },
    ];
    if (plan?.supportsTiming) {
      rows.push({
        category: timeCat,
        key: "time_to_tenant",
        value: state[key].timing,
      });
    }
    const { error } = await supabase
      .from("app_config")
      .upsert(rows, { onConflict: "category,key" });
    setSavingKey(null);
    if (error) {
      setMessage(`Error: ${error.message}`);
      return;
    }
    setOriginalState({ ...originalState, [key]: { ...state[key] } });
    setMessage(`Saved ${plan?.label || key}`);
    setTimeout(() => setMessage(null), 3000);
  }

  function update(key: string, field: keyof PlanState, value: string) {
    setState({ ...state, [key]: { ...state[key], [field]: value } });
  }

  function isDirty(key: string) {
    return (
      state[key]?.tagline !== originalState[key]?.tagline ||
      state[key]?.features !== originalState[key]?.features ||
      state[key]?.timing !== originalState[key]?.timing
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading plan checklists...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">Plan Checklists</h1>
        <p className="text-muted-foreground">
          Edit the tagline and &ldquo;what&apos;s included&rdquo; bullet list shown to clients on the Services page for each plan.
        </p>
      </div>

      {message && (
        <div className="rounded-md bg-green-100 p-3 text-sm text-green-800">{message}</div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {PLANS.map((plan) => (
          <Card key={plan.key} className={`${plan.color} border-2`}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Crown className="h-4 w-4" />
                {plan.label}
              </CardTitle>
              <CardDescription>Plan key: <code>{plan.key}</code></CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Tagline</Label>
                <Input
                  value={state[plan.key]?.tagline || ""}
                  onChange={(e) => update(plan.key, "tagline", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Features (one per line)</Label>
                <Textarea
                  value={state[plan.key]?.features || ""}
                  onChange={(e) => update(plan.key, "features", e.target.value)}
                  rows={6}
                  className="font-mono text-xs"
                />
              </div>
              {plan.supportsTiming && (
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Tiempo objetivo (e.g., &ldquo;~16 days avg.&rdquo;)
                  </Label>
                  <Input
                    value={state[plan.key]?.timing || ""}
                    onChange={(e) => update(plan.key, "timing", e.target.value)}
                    placeholder="~15 days avg."
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Replaces the parenthesized timing in the &ldquo;Marketing
                    campaign per property until tenant found&rdquo; bullet shown to
                    clients.
                  </p>
                </div>
              )}
              {isDirty(plan.key) && (
                <Badge variant="outline" className="bg-yellow-50 text-yellow-800">
                  Unsaved changes
                </Badge>
              )}
              <Button
                size="sm"
                onClick={() => savePlan(plan.key)}
                disabled={savingKey === plan.key || !isDirty(plan.key)}
                className="w-full"
              >
                <Save className="mr-2 h-3.5 w-3.5" />
                {savingKey === plan.key ? "Saving..." : "Save"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
