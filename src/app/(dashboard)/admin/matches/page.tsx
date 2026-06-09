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
import { Link2, Search, Home, AlertCircle } from "lucide-react";

// Steve 6/9 (6-2.md #38): Alex screenshot 2 of the 2026-06-07 docx
// — "Donde ve si un inquilino tuvo match o no, con una propiedad?"
// Sales role had no way to see live tenant-property matches.
// /admin/matching only edits the RULES, not the actual matches.
// This new page lists every tenant with their matched properties.

interface MatchedProperty {
  id: string;
  address: string;
  city: string;
  province: string;
  monthly_rent: number;
  bedrooms: number;
}

// Steve 6/9 (6-2.md #40): widened payload so the expanded card
// can show every field the inquilino filled in their preferences
// form — Alex needs sales to see "todo lo que llenó" to negotiate.
interface TenantPreferences {
  preferred_city?: string | null;
  preferred_zone?: string | null;
  target_zones?: string[] | null;
  min_budget?: number | null;
  max_budget?: number | null;
  bedrooms_needed?: number | null;
  move_in_date?: string | null;
  move_in_flexible?: boolean | null;
  pet_friendly?: boolean | null;
  parking_needed?: boolean | null;
  furnished?: boolean | null;
  utilities_included?: boolean | null;
  number_of_people?: string | null;
  property_type_desired?: string[] | null;
  levels_preferred?: string | null;
  size_sqft?: number | null;
  size_unit?: string | null;
  common_areas?: string[] | null;
  preferred_amenities?: string[] | null;
  skytrain_lines?: string[] | null;
  near_bus?: boolean | null;
  near_social?: boolean | null;
  near_banks?: boolean | null;
  near_downtown?: boolean | null;
  institution_type?: string | null;
  institution_name?: string | null;
  additional_requirements?: string | null;
}

interface TenantWithMatches {
  id: string;
  full_name: string;
  email: string;
  role: string;
  phone: string | null;
  created_at: string;
  has_preferences: boolean;
  is_premium: boolean;
  max_budget: number | null;
  bedrooms_needed: number | null;
  preferences: TenantPreferences | null;
  matches: MatchedProperty[];
}

export default function AdminMatchesPage() {
  const [tenants, setTenants] = useState<TenantWithMatches[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/tenant-matches", { cache: "no-store" });
      if (!res.ok) {
        setTenants([]);
        return;
      }
      const json = (await res.json()) as { tenants: TenantWithMatches[] };
      setTenants(json.tenants || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = tenants.filter((t) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (t.full_name || "").toLowerCase().includes(q) ||
      (t.email || "").toLowerCase().includes(q)
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
        <p className="text-muted-foreground">Loading tenant matches...</p>
      </div>
    );
  }

  const totalMatched = filtered.filter((t) => t.matches.length > 0).length;
  const totalNoMatch = filtered.filter((t) => t.has_preferences && t.matches.length === 0).length;
  const totalNoPrefs = filtered.filter((t) => !t.has_preferences).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">Tenant Matches</h1>
        <p className="text-muted-foreground">
          Which tenants matched which available properties, based on each tenant&apos;s budget, bedrooms and preferences.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>With matches</CardDescription>
            <CardTitle className="text-2xl text-green-700">{totalMatched}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>No matches yet</CardDescription>
            <CardTitle className="text-2xl text-amber-700">{totalNoMatch}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Missing preferences</CardDescription>
            <CardTitle className="text-2xl text-muted-foreground">{totalNoPrefs}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by tenant name or email..."
          className="pl-9"
        />
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No tenants match.
            </CardContent>
          </Card>
        )}
        {filtered.map((t) => {
          const isExpanded = expanded.has(t.id);
          const hasMatches = t.matches.length > 0;
          return (
            <Card key={t.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center gap-2 justify-between">
                  <div className="min-w-[200px]">
                    <CardTitle className="text-base">
                      {t.full_name || "(no name)"}
                      {t.is_premium && (
                        <Badge className="ml-2 bg-amber-50 text-amber-800 border-amber-300">Premium</Badge>
                      )}
                    </CardTitle>
                    <CardDescription>
                      {t.email}
                      {t.phone ? ` · ${t.phone}` : ""}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {!t.has_preferences ? (
                      <Badge variant="outline" className="bg-muted/50">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        No preferences yet
                      </Badge>
                    ) : hasMatches ? (
                      <Badge className="bg-green-50 text-green-700 border-green-200">
                        <Link2 className="h-3 w-3 mr-1" />
                        {t.matches.length} match{t.matches.length === 1 ? "" : "es"}
                      </Badge>
                    ) : (
                      <Badge className="bg-amber-50 text-amber-700 border-amber-200">
                        No matches yet
                      </Badge>
                    )}
                    {/* Steve 6/9 (6-2.md #40): View is now always
                        clickable when there are preferences OR matches
                        — sales needs to see the form data even when
                        no property matched yet. */}
                    {(hasMatches || t.has_preferences) && (
                      <Button variant="ghost" size="sm" onClick={() => toggle(t.id)}>
                        {isExpanded ? "Hide" : "View"}
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              {isExpanded && (hasMatches || t.has_preferences) && (
                <CardContent className="pt-0 space-y-4">
                  {t.preferences && (
                    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                      <p className="text-sm font-semibold">Tenant Preferences (from form)</p>
                      <PreferenceGrid prefs={t.preferences} />
                    </div>
                  )}
                  {hasMatches && (
                    <div>
                      <p className="text-sm font-semibold mb-2">Matched Properties ({t.matches.length})</p>
                      <div className="space-y-2">
                        {t.matches.map((m) => (
                          <div key={m.id} className="rounded-md border p-3 flex flex-wrap items-center gap-3 text-sm">
                            <Home className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-[200px]">
                              <p className="font-medium">{m.address}</p>
                              <p className="text-xs text-muted-foreground">
                                {m.city}, {m.province}
                              </p>
                            </div>
                            <Badge variant="outline">${m.monthly_rent.toLocaleString()}/mo</Badge>
                            <Badge variant="outline">{m.bedrooms} bd</Badge>
                          </div>
                        ))}
                      </div>
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

// Steve 6/9 (6-2.md #40): renders every non-empty field from the
// tenant_preferences form. Booleans show as Yes/No badges, arrays
// as comma-joined lists. Empty / null fields are skipped so the
// grid doesn't get noisy.
function PreferenceGrid({ prefs }: { prefs: TenantPreferences }) {
  const fields: { label: string; value: string | null }[] = [
    { label: "City", value: prefs.preferred_city || null },
    { label: "Zone", value: prefs.preferred_zone || null },
    { label: "Target zones", value: arr(prefs.target_zones) },
    { label: "Budget", value: budgetRange(prefs.min_budget, prefs.max_budget) },
    { label: "Bedrooms needed", value: prefs.bedrooms_needed ? `${prefs.bedrooms_needed}+` : null },
    { label: "Number of people", value: prefs.number_of_people || null },
    { label: "Move-in date", value: prefs.move_in_date ? new Date(prefs.move_in_date).toLocaleDateString("en-CA") : null },
    { label: "Move-in flexible", value: bool(prefs.move_in_flexible) },
    { label: "Property type", value: arr(prefs.property_type_desired) },
    { label: "Levels preferred", value: prefs.levels_preferred || null },
    { label: "Size", value: prefs.size_sqft ? `${prefs.size_sqft} ${prefs.size_unit || "sqft"}` : null },
    { label: "Pet friendly", value: bool(prefs.pet_friendly) },
    { label: "Parking needed", value: bool(prefs.parking_needed) },
    { label: "Furnished", value: bool(prefs.furnished) },
    { label: "Utilities included", value: bool(prefs.utilities_included) },
    { label: "Common areas", value: arr(prefs.common_areas) },
    { label: "Amenities", value: arr(prefs.preferred_amenities) },
    { label: "SkyTrain lines", value: arr(prefs.skytrain_lines) },
    { label: "Near bus", value: bool(prefs.near_bus) },
    { label: "Near social", value: bool(prefs.near_social) },
    { label: "Near banks", value: bool(prefs.near_banks) },
    { label: "Near downtown", value: bool(prefs.near_downtown) },
    { label: "Institution type", value: prefs.institution_type || null },
    { label: "Institution name", value: prefs.institution_name || null },
  ];
  const visible = fields.filter((f) => f.value);
  if (visible.length === 0 && !prefs.additional_requirements) {
    return <p className="text-xs text-muted-foreground italic">All preference fields are empty.</p>;
  }
  return (
    <>
      <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2 text-xs">
        {visible.map((f) => (
          <div key={f.label} className="flex gap-2">
            <span className="text-muted-foreground min-w-[120px]">{f.label}:</span>
            <span className="font-medium">{f.value}</span>
          </div>
        ))}
      </div>
      {prefs.additional_requirements && (
        <div className="mt-2 text-xs">
          <p className="text-muted-foreground">Additional requirements:</p>
          <p className="font-medium italic">{prefs.additional_requirements}</p>
        </div>
      )}
    </>
  );
}

function bool(v: boolean | null | undefined): string | null {
  if (v === true) return "Yes";
  if (v === false) return null;
  return null;
}
function arr(v: string[] | null | undefined): string | null {
  if (!v || v.length === 0) return null;
  return v.join(", ");
}
function budgetRange(min: number | null | undefined, max: number | null | undefined): string | null {
  if (!min && !max) return null;
  if (min && max) return `$${Number(min).toLocaleString()} – $${Number(max).toLocaleString()}`;
  if (max) return `≤ $${Number(max).toLocaleString()}`;
  return `≥ $${Number(min).toLocaleString()}`;
}
