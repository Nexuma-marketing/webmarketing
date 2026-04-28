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
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Trash2, Plus, ArrowRightLeft } from "lucide-react";
import { ROLE_LABELS } from "@/lib/constants";

interface UserRow {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

interface ServiceRow {
  id: string;
  name: string;
  category: string;
  price: number;
  currency: string;
  status: string;
}

interface RecommendationRow {
  id: string;
  user_id: string;
  service_id: string;
  reason: string | null;
  is_purchased: boolean;
  created_at: string;
  services?: {
    id: string;
    name: string;
    category: string;
    price: number;
    currency: string;
  } | null;
}

export default function AdminReassignPage() {
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationRow[]>([]);
  const [newServiceId, setNewServiceId] = useState<string>("");
  const [newReason, setNewReason] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const supabase = createClient();

  const loadInitial = useCallback(async () => {
    const [{ data: u }, { data: s }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, email, role")
        .in("role", ["propietario", "propietario_preferido", "inversionista", "inquilino", "inquilino_premium", "pymes"])
        .order("full_name"),
      supabase
        .from("services")
        .select("id, name, category, price, currency, status")
        .neq("status", "archived")
        .order("category")
        .order("name"),
    ]);
    setUsers((u as UserRow[]) || []);
    setServices((s as ServiceRow[]) || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  async function loadUserRecommendations(userId: string) {
    const { data } = await supabase
      .from("service_recommendations")
      .select("id, user_id, service_id, reason, is_purchased, created_at, services:service_id(id, name, category, price, currency)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    setRecommendations((data as unknown as RecommendationRow[]) || []);
  }

  async function selectUser(user: UserRow) {
    setSelectedUser(user);
    setNewServiceId("");
    setNewReason("");
    setMessage(null);
    await loadUserRecommendations(user.id);
  }

  async function addRecommendation() {
    if (!selectedUser || !newServiceId) return;
    setSaving(true);
    setMessage(null);
    const { error } = await supabase.from("service_recommendations").insert({
      user_id: selectedUser.id,
      service_id: newServiceId,
      reason: newReason || "Manually assigned by admin",
    });
    setSaving(false);
    if (error) {
      setMessage(`Error: ${error.message}`);
      return;
    }
    setMessage("Recommendation added.");
    setNewServiceId("");
    setNewReason("");
    setTimeout(() => setMessage(null), 3000);
    loadUserRecommendations(selectedUser.id);
  }

  async function removeRecommendation(id: string, isPurchased: boolean) {
    if (isPurchased) {
      if (!confirm("This recommendation has been purchased. Removing it will not refund the user. Continue?")) {
        return;
      }
    }
    await supabase.from("service_recommendations").delete().eq("id", id);
    if (selectedUser) loadUserRecommendations(selectedUser.id);
  }

  async function replaceRecommendation(recId: string, newServiceId: string) {
    if (!newServiceId) return;
    await supabase
      .from("service_recommendations")
      .update({ service_id: newServiceId, reason: "Reassigned by admin" })
      .eq("id", recId);
    if (selectedUser) loadUserRecommendations(selectedUser.id);
  }

  const filteredUsers = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.full_name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">Service Reassignment</h1>
        <p className="text-muted-foreground">
          Manually add, remove, or swap a client&apos;s recommended services. Useful when the auto-matching engine&apos;s default is not what the commercial team wants for that client.
        </p>
      </div>

      {message && (
        <div className="rounded-md bg-green-100 p-3 text-sm text-green-800">{message}</div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* User picker */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Pick a client</CardTitle>
            <CardDescription>{filteredUsers.length} clients</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email..."
                className="pl-9"
              />
            </div>
            <div className="max-h-[480px] overflow-y-auto space-y-1">
              {filteredUsers.map((u) => {
                const active = selectedUser?.id === u.id;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => selectUser(u)}
                    className={`w-full text-left rounded-md p-2 text-sm transition-colors ${
                      active ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                    }`}
                  >
                    <div className="font-medium truncate">{u.full_name || "(no name)"}</div>
                    <div className={`text-xs truncate ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                      {u.email}
                    </div>
                    <Badge
                      variant="outline"
                      className={`mt-1 text-[10px] ${active ? "bg-primary-foreground/10 text-primary-foreground border-primary-foreground/30" : ""}`}
                    >
                      {ROLE_LABELS[u.role] || u.role}
                    </Badge>
                  </button>
                );
              })}
              {filteredUsers.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">No clients match.</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recommendations editor */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">
              {selectedUser ? `Recommendations for ${selectedUser.full_name}` : "Select a client to begin"}
            </CardTitle>
            {selectedUser && (
              <CardDescription>{selectedUser.email}</CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedUser ? (
              <p className="text-muted-foreground text-sm">
                Pick a client on the left to view and modify their recommended services.
              </p>
            ) : (
              <>
                {recommendations.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No recommendations yet for this client. Add one below.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {recommendations.map((r) => (
                      <div key={r.id} className="rounded-md border p-3 flex flex-wrap items-center gap-2">
                        <div className="flex-1 min-w-[200px]">
                          <p className="font-medium text-sm">
                            {r.services?.name || "(deleted service)"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {r.services?.category} · ${r.services?.price?.toLocaleString()} {r.services?.currency}
                          </p>
                          {r.reason && (
                            <p className="text-xs text-muted-foreground italic mt-1">
                              {r.reason}
                            </p>
                          )}
                          {r.is_purchased && (
                            <Badge className="mt-1 bg-green-50 text-green-700 text-xs">Purchased</Badge>
                          )}
                        </div>
                        <Select
                          value=""
                          onValueChange={(v) => v && replaceRecommendation(r.id, v)}
                        >
                          <SelectTrigger className="w-[180px] h-8">
                            <SelectValue placeholder="Swap to..." />
                          </SelectTrigger>
                          <SelectContent>
                            {services.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeRecommendation(r.id, r.is_purchased)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="rounded-md border-2 border-dashed p-4 space-y-3">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    Add a new recommendation
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-xs">Service</Label>
                      <Select
                        value={newServiceId}
                        onValueChange={(v) => v && setNewServiceId(v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Pick a service..." />
                        </SelectTrigger>
                        <SelectContent>
                          {services.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name} · ${s.price.toLocaleString()} {s.currency}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Reason (shown to client)</Label>
                      <Textarea
                        value={newReason}
                        onChange={(e) => setNewReason(e.target.value)}
                        rows={2}
                        placeholder="e.g., Recommended after recent diagnostic call"
                      />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={addRecommendation}
                    disabled={saving || !newServiceId}
                  >
                    {saving ? "Adding..." : "Add Recommendation"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
