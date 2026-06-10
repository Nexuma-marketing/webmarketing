"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, AlertCircle, Briefcase } from "lucide-react";

// Steve 6/9 (6-2.md #40): Alex 2026-06-07 docx Item 5 — annotation
// "Donde ve la informacion de empresas?" on the sales-side
// dashboard. New page that lists every business owner (pymes role)
// with both of their assessment forms expanded — the Sales Leak
// Calculator (pymes_diagnosis) and the Client Acquisition form
// (pymes_captacion). Sales can search by name/email and read the
// full picture before calling the lead.

interface Diagnosis {
  company_name: string | null;
  sector: string | null;
  employee_count: string | null;
  monthly_revenue: string | null;
  has_website: boolean | null;
  has_social_media: boolean | null;
  social_media_platforms: string[] | null;
  current_marketing_channels: string[] | null;
  marketing_budget: string | null;
  main_challenge: string | null;
  business_goals: string[] | null;
  urgency_level: string | null;
  urgency_score: number | null;
  recommendation_message: string | null;
  created_at: string;
}
interface Captacion {
  business_name: string | null;
  industry: string | null;
  years_in_business: number | null;
  business_goals: string[] | null;
  target_age_range: string | null;
  target_location: string | null;
  target_income: string | null;
  ideal_customer_description: string | null;
  current_channels: string[] | null;
  monthly_marketing_budget: number | null;
  biggest_challenge: string | null;
  created_at: string;
}
// Steve 6/10 (6-2.md #46): added recommended + purchased plan
// lists so sales can answer "what plan does this business have?"
// per Alex docx Item 5 sub-issue 14.
interface PlanRecommendation {
  reason: string | null;
  is_purchased: boolean;
  created_at: string;
  service_id: string | null;
  service_name: string | null;
  service_price: number | null;
}
interface PlanPurchase {
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  plan_name: string | null;
  plan_type: string | null;
}

interface BusinessProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  created_at: string;
  has_diagnosis: boolean;
  has_captacion: boolean;
  diagnosis: Diagnosis | null;
  captacion: Captacion | null;
  recommendations: PlanRecommendation[];
  purchases: PlanPurchase[];
}

const URGENCY_COLOR: Record<string, string> = {
  bajo: "bg-green-50 text-green-700 border-green-200",
  medio: "bg-amber-50 text-amber-700 border-amber-200",
  alto: "bg-orange-50 text-orange-700 border-orange-200",
  critico: "bg-red-50 text-red-700 border-red-200",
};

export default function AdminBusinessesPage() {
  const [businesses, setBusinesses] = useState<BusinessProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/business-profiles", { cache: "no-store" });
      if (!res.ok) {
        setBusinesses([]);
        return;
      }
      const json = (await res.json()) as { businesses: BusinessProfile[] };
      setBusinesses(json.businesses || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = businesses.filter((b) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (b.full_name || "").toLowerCase().includes(q) ||
      (b.email || "").toLowerCase().includes(q) ||
      (b.diagnosis?.company_name || "").toLowerCase().includes(q) ||
      (b.captacion?.business_name || "").toLowerCase().includes(q)
    );
  });

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading business profiles...</p>
      </div>
    );
  }

  const totalWithForms = filtered.filter((b) => b.has_diagnosis || b.has_captacion).length;
  const totalMissingForms = filtered.length - totalWithForms;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">Business Profiles</h1>
        <p className="text-muted-foreground">
          Every business owner with their Sales Leak Diagnosis + Client Acquisition assessment data.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total businesses</CardDescription>
            <CardTitle className="text-2xl">{filtered.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Completed an assessment</CardDescription>
            <CardTitle className="text-2xl text-green-700">{totalWithForms}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>No assessment yet</CardDescription>
            <CardTitle className="text-2xl text-amber-700">{totalMissingForms}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by owner, email, or business name..."
          className="pl-9"
        />
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No businesses match.
            </CardContent>
          </Card>
        )}
        {filtered.map((b) => {
          const isExpanded = expanded.has(b.id);
          const businessName = b.captacion?.business_name || b.diagnosis?.company_name;
          const urgency = b.diagnosis?.urgency_level;
          return (
            <Card key={b.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center gap-2 justify-between">
                  <div className="min-w-[200px]">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Briefcase className="h-4 w-4 text-muted-foreground" />
                      {businessName || b.full_name || "(no name)"}
                    </CardTitle>
                    <CardDescription>
                      {b.full_name && businessName ? `${b.full_name} · ` : ""}
                      {b.email}
                      {b.phone ? ` · ${b.phone}` : ""}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {urgency && (
                      <Badge variant="outline" className={URGENCY_COLOR[urgency] || ""}>
                        Urgency: {urgency}
                      </Badge>
                    )}
                    {b.has_diagnosis && (
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                        Sales Leak Diagnosis
                      </Badge>
                    )}
                    {b.has_captacion && (
                      <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                        Client Acquisition
                      </Badge>
                    )}
                    {/* Steve 6/10 (6-2.md #46): show a green badge if
                        the business has actually purchased a plan; an
                        outline one if there's only a recommendation. */}
                    {b.purchases.length > 0 && (
                      <Badge className="bg-green-50 text-green-700 border-green-200">
                        {b.purchases.length === 1
                          ? b.purchases[0].plan_name || "Plan purchased"
                          : `${b.purchases.length} plans purchased`}
                      </Badge>
                    )}
                    {b.purchases.length === 0 && b.recommendations.length > 0 && (
                      <Badge variant="outline" className="bg-cyan-50 text-cyan-700 border-cyan-200">
                        {b.recommendations.length === 1
                          ? `Rec: ${b.recommendations[0].service_name || "plan"}`
                          : `${b.recommendations.length} recommendations`}
                      </Badge>
                    )}
                    {!b.has_diagnosis && !b.has_captacion && (
                      <Badge variant="outline" className="bg-muted/50">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        No assessment yet
                      </Badge>
                    )}
                    {(b.has_diagnosis || b.has_captacion || b.recommendations.length > 0 || b.purchases.length > 0) && (
                      <Button variant="ghost" size="sm" onClick={() => toggle(b.id)}>
                        {isExpanded ? "Hide" : "View"}
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              {isExpanded && (
                <CardContent className="pt-0 space-y-4">
                  {(b.recommendations.length > 0 || b.purchases.length > 0) && (
                    <div className="rounded-md border bg-green-50/30 p-3 space-y-3">
                      <p className="text-sm font-semibold">Assigned Plan(s)</p>
                      {b.purchases.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground font-medium">Purchased:</p>
                          {b.purchases.map((p, i) => (
                            <div key={i} className="text-xs flex flex-wrap gap-2 items-center">
                              <Badge className="bg-green-50 text-green-700 border-green-200">
                                {p.plan_name || "Unknown plan"}
                              </Badge>
                              <span className="font-medium">
                                ${p.amount.toLocaleString()} {p.currency || "CAD"}
                              </span>
                              {p.plan_type && (
                                <span className="text-muted-foreground">
                                  · {p.plan_type}
                                </span>
                              )}
                              <span className="text-muted-foreground">
                                · {new Date(p.created_at).toLocaleDateString("en-CA")}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {b.recommendations.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground font-medium">Recommendations:</p>
                          {b.recommendations.map((r, i) => (
                            <div key={i} className="text-xs flex flex-wrap gap-2 items-center">
                              <Badge variant="outline" className="bg-cyan-50 text-cyan-700 border-cyan-200">
                                {r.service_name || "Unknown plan"}
                              </Badge>
                              {r.service_price != null && (
                                <span className="font-medium">
                                  ${r.service_price.toLocaleString()} CAD
                                </span>
                              )}
                              {r.is_purchased && (
                                <Badge className="bg-green-50 text-green-700 border-green-200 text-[10px]">
                                  Purchased
                                </Badge>
                              )}
                              {r.reason && (
                                <span className="text-muted-foreground italic truncate">
                                  &ldquo;{r.reason}&rdquo;
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {b.diagnosis && (
                    <div className="rounded-md border bg-blue-50/30 p-3 space-y-2">
                      <p className="text-sm font-semibold">Sales Leak Diagnosis</p>
                      <DiagGrid d={b.diagnosis} />
                    </div>
                  )}
                  {b.captacion && (
                    <div className="rounded-md border bg-purple-50/30 p-3 space-y-2">
                      <p className="text-sm font-semibold">Client Acquisition Form</p>
                      <CaptGrid c={b.captacion} />
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function DiagGrid({ d }: { d: Diagnosis }) {
  const fields: { label: string; value: string | null }[] = [
    { label: "Company", value: d.company_name || null },
    { label: "Sector", value: d.sector || null },
    { label: "Employees", value: d.employee_count || null },
    { label: "Monthly revenue", value: d.monthly_revenue || null },
    { label: "Marketing budget", value: d.marketing_budget || null },
    { label: "Has website", value: yes(d.has_website) },
    { label: "Has social media", value: yes(d.has_social_media) },
    { label: "Social platforms", value: arr(d.social_media_platforms) },
    { label: "Current channels", value: arr(d.current_marketing_channels) },
    { label: "Business goals", value: arr(d.business_goals) },
    { label: "Main challenge", value: d.main_challenge || null },
    { label: "Urgency score", value: d.urgency_score != null ? String(d.urgency_score) : null },
  ];
  return (
    <>
      <KVGrid fields={fields} />
      {d.recommendation_message && (
        <p className="text-xs italic text-muted-foreground border-t pt-2 mt-2">
          Recommendation: {d.recommendation_message}
        </p>
      )}
    </>
  );
}

function CaptGrid({ c }: { c: Captacion }) {
  const fields: { label: string; value: string | null }[] = [
    { label: "Business name", value: c.business_name || null },
    { label: "Industry", value: c.industry || null },
    { label: "Years in business", value: c.years_in_business != null ? String(c.years_in_business) : null },
    { label: "Business goals", value: arr(c.business_goals) },
    { label: "Target age", value: c.target_age_range || null },
    { label: "Target location", value: c.target_location || null },
    { label: "Target income", value: c.target_income || null },
    { label: "Ideal customer", value: c.ideal_customer_description || null },
    { label: "Current channels", value: arr(c.current_channels) },
    { label: "Monthly marketing budget", value: c.monthly_marketing_budget != null ? `$${Number(c.monthly_marketing_budget).toLocaleString()}` : null },
    { label: "Biggest challenge", value: c.biggest_challenge || null },
  ];
  return <KVGrid fields={fields} />;
}

function KVGrid({ fields }: { fields: { label: string; value: string | null }[] }) {
  const visible = fields.filter((f) => f.value);
  if (visible.length === 0) return <p className="text-xs text-muted-foreground italic">All fields empty.</p>;
  return (
    <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2 text-xs">
      {visible.map((f) => (
        <div key={f.label} className="flex gap-2">
          <span className="text-muted-foreground min-w-[150px]">{f.label}:</span>
          <span className="font-medium">{f.value}</span>
        </div>
      ))}
    </div>
  );
}

function yes(v: boolean | null | undefined): string | null {
  if (v === true) return "Yes";
  if (v === false) return "No";
  return null;
}
function arr(v: string[] | null | undefined): string | null {
  if (!v || v.length === 0) return null;
  return v.join(", ");
}
