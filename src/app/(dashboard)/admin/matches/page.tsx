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
                    {hasMatches && (
                      <Button variant="ghost" size="sm" onClick={() => toggle(t.id)}>
                        {isExpanded ? "Hide" : "View"}
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              {isExpanded && hasMatches && (
                <CardContent className="pt-0">
                  <div className="text-xs text-muted-foreground mb-2">
                    Tenant constraints:
                    {t.max_budget && ` max budget $${Number(t.max_budget).toLocaleString()}`}
                    {t.bedrooms_needed && `, ${t.bedrooms_needed}+ bedrooms`}
                  </div>
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
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
