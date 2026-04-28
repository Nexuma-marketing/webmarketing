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
const PLANS: { key: string; label: string; defaultTagline: string; defaultFeatures: string[]; color: string }[] = [
  {
    key: "owner_basic",
    label: "Owner — Basic",
    defaultTagline: "Essential property management for single-property owners",
    defaultFeatures: [
      "Professional property listing",
      "Tenant screening & matching",
      "Basic photography guidance",
      "Standard listing optimization",
      "Email support",
    ],
    color: "border-blue-200",
  },
  {
    key: "owner_preferred",
    label: "Owner — Preferred Owners",
    defaultTagline: "Enhanced services for growing property portfolios",
    defaultFeatures: [
      "Everything in Basic, plus:",
      "Professional photography session",
      "Priority tenant matching",
      "Multi-property dashboard",
      "Market analysis reports",
      "Priority email & chat support",
    ],
    color: "border-emerald-200",
  },
  {
    key: "owner_elite",
    label: "Owner — Elite Assets & Legacy",
    defaultTagline: "Full-service management for investment portfolios",
    defaultFeatures: [
      "Everything in Preferred, plus:",
      "Dedicated account manager",
      "Premium photography & virtual tours",
      "Revenue optimization strategy",
      "Legal compliance review",
      "Quarterly portfolio analysis",
      "Concierge-level support",
    ],
    color: "border-amber-200",
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
    defaultTagline: "Intensive intervention plan to exit critical mode",
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
    defaultTagline: "Plan to overcome stagnation and start growing",
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
    defaultTagline: "Plan to scale and maximize revenue",
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
      .like("category", "plan_features:%");

    const next: Record<string, PlanState> = {};
    for (const plan of PLANS) {
      const cat = `plan_features:${plan.key}`;
      const tagline = data?.find((r) => r.category === cat && r.key === "tagline")?.value;
      const features = data?.find((r) => r.category === cat && r.key === "features")?.value;
      next[plan.key] = {
        tagline: tagline ?? plan.defaultTagline,
        features: features ?? plan.defaultFeatures.join("\n"),
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
    const cat = `plan_features:${key}`;
    const rows = [
      { category: cat, key: "tagline", value: state[key].tagline },
      { category: cat, key: "features", value: state[key].features },
    ];
    const { error } = await supabase
      .from("app_config")
      .upsert(rows, { onConflict: "category,key" });
    setSavingKey(null);
    if (error) {
      setMessage(`Error: ${error.message}`);
      return;
    }
    setOriginalState({ ...originalState, [key]: { ...state[key] } });
    setMessage(`Saved ${PLANS.find((p) => p.key === key)?.label || key}`);
    setTimeout(() => setMessage(null), 3000);
  }

  function update(key: string, field: keyof PlanState, value: string) {
    setState({ ...state, [key]: { ...state[key], [field]: value } });
  }

  function isDirty(key: string) {
    return (
      state[key]?.tagline !== originalState[key]?.tagline ||
      state[key]?.features !== originalState[key]?.features
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
