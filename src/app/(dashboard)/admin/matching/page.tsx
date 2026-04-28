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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Save, RefreshCw, Sliders } from "lucide-react";

interface Rule {
  id: string;
  rule_key: string;
  description: string;
  weight: number;
  is_active: boolean;
}

const GROUPS = [
  {
    prefix: "tenant_premium.",
    title: "Premium Tenant Criteria",
    description:
      "Each criterion (weight 1) contributes to the count. Set the threshold to control how many criteria a tenant needs to be classified as Premium.",
  },
  {
    prefix: "property_match.",
    title: "Property Matching Score",
    description:
      "Bonus points applied to each property when matching against a tenant's preferences. Higher = more important in ranking.",
  },
];

export default function AdminMatchingPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const supabase = createClient();

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("matching_rules")
      .select("*")
      .order("rule_key");
    setRules((data as Rule[]) || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveRule(rule: Rule) {
    setSaving(rule.id);
    setMessage(null);
    const { error } = await supabase
      .from("matching_rules")
      .update({
        weight: rule.weight,
        is_active: rule.is_active,
      })
      .eq("id", rule.id);
    setSaving(null);
    if (error) {
      setMessage(`Error: ${error.message}`);
      return;
    }
    setMessage(`Updated ${rule.rule_key}.`);
    setTimeout(() => setMessage(null), 2500);
  }

  async function resetDefaults() {
    if (!confirm("Reset all matching rule weights to their defaults? This will overwrite any custom values.")) return;
    const defaults: Record<string, number> = {
      "tenant_premium.stable_employment": 1,
      "tenant_premium.budget_2500": 1,
      "tenant_premium.premium_amenities": 1,
      "tenant_premium.urban_zone": 1,
      "tenant_premium.bedrooms_2_4": 1,
      "tenant_premium.smart_home": 1,
      "tenant_premium.modern_style": 1,
      "tenant_premium.long_contract": 1,
      "tenant_premium.threshold": 3,
      "property_match.elite_premium_bonus": 5,
      "property_match.budget_match": 3,
      "property_match.bedrooms_match": 3,
      "property_match.city_match": 4,
      "property_match.amenities_overlap": 1,
    };
    for (const [key, weight] of Object.entries(defaults)) {
      await supabase
        .from("matching_rules")
        .update({ weight, is_active: true })
        .eq("rule_key", key);
    }
    load();
  }

  function updateRule(id: string, field: keyof Rule, value: number | boolean) {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading rules...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Matching Engine</h1>
          <p className="text-muted-foreground">
            Edit the scoring weights and thresholds used to classify tenants and rank properties.
          </p>
        </div>
        <Button variant="outline" onClick={resetDefaults}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Reset to defaults
        </Button>
      </div>

      {message && (
        <div className="rounded-md bg-green-100 p-3 text-sm text-green-800">{message}</div>
      )}

      {GROUPS.map((group) => {
        const groupRules = rules.filter((r) => r.rule_key.startsWith(group.prefix));
        if (groupRules.length === 0) {
          return (
            <Card key={group.prefix}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sliders className="h-4 w-4" />
                  {group.title}
                </CardTitle>
                <CardDescription>{group.description}</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                No rules seeded for this group. Run migration v9 in Supabase to seed defaults.
              </CardContent>
            </Card>
          );
        }
        return (
          <Card key={group.prefix}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sliders className="h-4 w-4" />
                {group.title}
              </CardTitle>
              <CardDescription>{group.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {groupRules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex flex-wrap items-center gap-3 rounded-md border p-3"
                >
                  <div className="flex-1 min-w-[200px]">
                    <p className="text-sm font-medium">{rule.description}</p>
                    <code className="text-xs text-muted-foreground">{rule.rule_key}</code>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Weight</Label>
                    <Input
                      type="number"
                      step="0.5"
                      value={rule.weight}
                      onChange={(e) =>
                        updateRule(rule.id, "weight", Number(e.target.value))
                      }
                      className="w-24"
                    />
                  </div>
                  <div className="space-y-1 flex flex-col items-center">
                    <Label className="text-xs">Active</Label>
                    <Switch
                      checked={rule.is_active}
                      onCheckedChange={(checked) =>
                        updateRule(rule.id, "is_active", checked)
                      }
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={() => saveRule(rule)}
                    disabled={saving === rule.id}
                  >
                    <Save className="mr-1 h-3.5 w-3.5" />
                    {saving === rule.id ? "Saving..." : "Save"}
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}

      <Card className="bg-muted/30">
        <CardHeader>
          <CardTitle className="text-base">How the engine uses these rules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <b>Premium Tenant Criteria</b> — A tenant is classified as Premium when the sum of weights from active criteria they meet is greater than or equal to the <code>threshold</code>. With all weights at 1 and threshold at 3, any 3-of-8 criteria triggers Premium.
          </p>
          <p>
            <b>Property Matching Score</b> — When a tenant&apos;s preferences are compared to available properties, each rule adds its weight to the property&apos;s score when satisfied. Properties are ranked descending by score.
          </p>
          <p className="text-xs">
            Changes apply on the next form submission or matching call. They are read live from the database, so a redeploy is not required.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
