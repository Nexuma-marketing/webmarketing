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
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, DollarSign, Tag, Users } from "lucide-react";

interface ServicePrice {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  price: number;
  currency: string;
  is_active: boolean;
}

interface Promotion {
  id: string;
  code: string;
  description: string | null;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  valid_from: string;
  valid_until: string;
  is_active: boolean;
  max_uses: number | null;
  used_count: number;
  target_zones: string[];
  target_roles: string[];
}

const ROLE_TARGET_OPTIONS = [
  { value: "propietario", label: "Property Owner" },
  { value: "propietario_preferido", label: "Preferred Owner" },
  { value: "inversionista", label: "Investor" },
  { value: "inquilino", label: "Tenant" },
  { value: "inquilino_premium", label: "Premium Tenant" },
  { value: "pymes", label: "Business Owner" },
];

export default function AdminPricingPage() {
  const [services, setServices] = useState<ServicePrice[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [editPromo, setEditPromo] = useState<Partial<Promotion> | null>(null);
  const [isNewPromo, setIsNewPromo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingPrice, setEditingPrice] = useState<string | null>(null);
  const [newPrice, setNewPrice] = useState("");
  const [foundersTaken, setFoundersTaken] = useState<number>(0);
  const [foundersLimit, setFoundersLimit] = useState<number>(20);
  const [foundersSaving, setFoundersSaving] = useState(false);
  const [foundersMessage, setFoundersMessage] = useState<string | null>(null);

  const supabase = createClient();

  const load = useCallback(async () => {
    const [{ data: svcData }, { data: promoData }, { data: cfgData }] = await Promise.all([
      supabase
        .from("services")
        .select("id, name, description, category, price, currency, is_active")
        .order("name"),
      supabase
        .from("promotions")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("app_config")
        .select("key, value")
        .eq("category", "founders_plan"),
    ]);

    setServices(svcData || []);
    setPromotions((promoData as Promotion[]) || []);
    const cfg = Object.fromEntries(
      ((cfgData || []) as { key: string; value: string }[]).map((r) => [r.key, r.value]),
    );
    setFoundersTaken(Number(cfg.taken ?? "0"));
    setFoundersLimit(Number(cfg.limit ?? "20"));
    setLoading(false);
  }, [supabase]);

  async function saveFoundersConfig() {
    setFoundersSaving(true);
    setFoundersMessage(null);
    const rows = [
      { category: "founders_plan", key: "taken", value: String(foundersTaken) },
      { category: "founders_plan", key: "limit", value: String(foundersLimit) },
    ];
    const { error } = await supabase
      .from("app_config")
      .upsert(rows, { onConflict: "category,key" });
    if (error) {
      setFoundersMessage(`Save failed: ${error.message}`);
    } else {
      setFoundersMessage("Updated. Visible on the public dashboard within seconds.");
    }
    setFoundersSaving(false);
  }

  useEffect(() => {
    load();
  }, [load]);

  async function updatePrice(id: string) {
    if (!newPrice) return;
    await supabase
      .from("services")
      .update({ price: Number(newPrice) })
      .eq("id", id);
    setEditingPrice(null);
    setNewPrice("");
    load();
  }

  async function savePromotion() {
    if (!editPromo?.code) return;
    setSaving(true);

    const payload = {
      code: editPromo.code,
      description: editPromo.description || null,
      discount_type: editPromo.discount_type || "percentage",
      discount_value: editPromo.discount_value || 0,
      valid_from: editPromo.valid_from || new Date().toISOString().split("T")[0],
      valid_until: editPromo.valid_until || null,
      is_active: editPromo.is_active ?? true,
      max_uses: editPromo.max_uses || null,
      target_zones: editPromo.target_zones || [],
      target_roles: editPromo.target_roles || [],
    };

    if (isNewPromo) {
      await supabase.from("promotions").insert(payload);
    } else {
      await supabase
        .from("promotions")
        .update(payload)
        .eq("id", editPromo.id!);
    }

    setEditPromo(null);
    setSaving(false);
    load();
  }

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
        <h1 className="text-2xl font-bold md:text-3xl">Pricing & Promotions</h1>
        <p className="text-muted-foreground">
          Manage service prices and promotional discounts
        </p>
      </div>

      {/* Founders Plan Counter */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Founders Plan Counter
          </CardTitle>
          <CardDescription>
            Drives the urgency banner shown to Basic-tier owners on the Services page.
            The banner reads: &ldquo;{foundersTaken} owners have already chosen the Founders Package — only {Math.max(0, foundersLimit - foundersTaken)} spots left.&rdquo;
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Owners enrolled</Label>
              <Input
                type="number"
                min={0}
                value={foundersTaken}
                onChange={(e) => setFoundersTaken(Math.max(0, Number(e.target.value)))}
              />
            </div>
            <div className="space-y-2">
              <Label>Total cap</Label>
              <Input
                type="number"
                min={0}
                value={foundersLimit}
                onChange={(e) => setFoundersLimit(Math.max(0, Number(e.target.value)))}
              />
            </div>
            <div className="space-y-2">
              <Label>&nbsp;</Label>
              <Button
                onClick={saveFoundersConfig}
                disabled={foundersSaving}
                className="w-full"
              >
                {foundersSaving ? "Saving..." : "Save Counter"}
              </Button>
            </div>
          </div>
          {foundersMessage && (
            <p className="mt-3 text-sm text-muted-foreground">{foundersMessage}</p>
          )}
        </CardContent>
      </Card>

      {/* Service Prices */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Service Prices
          </CardTitle>
          <CardDescription>Click on a price to edit it</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {services.map((svc) => (
                  <TableRow key={svc.id}>
                    <TableCell className="font-medium">{svc.name}</TableCell>
                    <TableCell>
                      {editingPrice === svc.id ? (
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            className="w-28 h-8"
                            value={newPrice}
                            onChange={(e) => setNewPrice(e.target.value)}
                            autoFocus
                          />
                          <Button size="sm" onClick={() => updatePrice(svc.id)}>
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingPrice(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="flex flex-col">
                          <span>${svc.price.toLocaleString()} {svc.currency}</span>
                          {/* Steve 5/8: a $0 price for plan-category
                              rows used to look like missing data. The
                              admin asked why several services read $0.
                              Show the description as a tooltip-like
                              hint so it is clear the value is by
                              design (CFP-based plans collect monthly,
                              not upfront). */}
                          {svc.price === 0 && svc.description && (
                            <span className="text-[11px] text-muted-foreground mt-0.5 max-w-[260px] line-clamp-2">
                              {svc.description}
                            </span>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={svc.is_active ? "default" : "secondary"}>
                        {svc.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingPrice(svc.id);
                          setNewPrice(String(svc.price));
                        }}
                      >
                        Edit Price
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {services.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      No services found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Promotions */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              Promotions
            </CardTitle>
            <CardDescription>Discount codes and promotional offers</CardDescription>
          </div>
          <Button
            onClick={() => {
              setEditPromo({
                code: "",
                description: "",
                discount_type: "percentage",
                discount_value: 10,
                valid_from: new Date().toISOString().split("T")[0],
                valid_until: "",
                is_active: true,
                max_uses: null,
                target_zones: [],
                target_roles: [],
              });
              setIsNewPromo(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            New Promotion
          </Button>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Valid Period</TableHead>
                  <TableHead>Uses</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {promotions.map((promo) => (
                  <TableRow key={promo.id}>
                    <TableCell className="font-mono font-medium">{promo.code}</TableCell>
                    <TableCell>
                      {promo.discount_type === "percentage"
                        ? `${promo.discount_value}%`
                        : `$${promo.discount_value}`}
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(promo.valid_from).toLocaleDateString("en-CA")} —{" "}
                      {promo.valid_until
                        ? new Date(promo.valid_until).toLocaleDateString("en-CA")
                        : "No end"}
                    </TableCell>
                    <TableCell>
                      {promo.used_count}
                      {promo.max_uses ? ` / ${promo.max_uses}` : ""}
                    </TableCell>
                    <TableCell>
                      <Badge variant={promo.is_active ? "default" : "secondary"}>
                        {promo.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditPromo({ ...promo });
                          setIsNewPromo(false);
                        }}
                      >
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {promotions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No promotions yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Promotion Editor Dialog */}
      <Dialog open={!!editPromo} onOpenChange={() => setEditPromo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isNewPromo ? "New Promotion" : "Edit Promotion"}</DialogTitle>
            <DialogDescription>
              {isNewPromo ? "Create a discount code" : `Editing: ${editPromo?.code}`}
            </DialogDescription>
          </DialogHeader>
          {editPromo && (
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Promo Code</Label>
                <Input
                  value={editPromo.code || ""}
                  onChange={(e) =>
                    setEditPromo({ ...editPromo, code: e.target.value.toUpperCase() })
                  }
                  placeholder="SAVE20"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Discount Type</Label>
                  <Select
                    value={editPromo.discount_type || "percentage"}
                    onValueChange={(v) =>
                      setEditPromo({
                        ...editPromo,
                        discount_type: v as "percentage" | "fixed",
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage (%)</SelectItem>
                      <SelectItem value="fixed">Fixed Amount ($)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Discount Value</Label>
                  <Input
                    type="number"
                    value={editPromo.discount_value || 0}
                    onChange={(e) =>
                      setEditPromo({
                        ...editPromo,
                        discount_value: Number(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Valid From</Label>
                  <Input
                    type="date"
                    value={editPromo.valid_from || ""}
                    onChange={(e) =>
                      setEditPromo({ ...editPromo, valid_from: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Valid Until</Label>
                  <Input
                    type="date"
                    value={editPromo.valid_until || ""}
                    onChange={(e) =>
                      setEditPromo({ ...editPromo, valid_until: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Max Uses (blank = unlimited)</Label>
                <Input
                  type="number"
                  value={editPromo.max_uses ?? ""}
                  onChange={(e) =>
                    setEditPromo({
                      ...editPromo,
                      max_uses: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Description (shown to clients)</Label>
                <Input
                  value={editPromo.description || ""}
                  onChange={(e) =>
                    setEditPromo({ ...editPromo, description: e.target.value })
                  }
                  placeholder="e.g., Spring season — Vancouver only"
                />
              </div>
              <div className="space-y-2">
                <Label>Target zones (cities, comma-separated; blank = all)</Label>
                <Input
                  value={(editPromo.target_zones || []).join(", ")}
                  onChange={(e) =>
                    setEditPromo({
                      ...editPromo,
                      target_zones: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="e.g., Vancouver, Burnaby, Richmond"
                />
              </div>
              <div className="space-y-2">
                <Label>Target client types (blank = all)</Label>
                <div className="flex flex-wrap gap-2">
                  {ROLE_TARGET_OPTIONS.map((opt) => {
                    const active = (editPromo.target_roles || []).includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          const current = editPromo.target_roles || [];
                          setEditPromo({
                            ...editPromo,
                            target_roles: active
                              ? current.filter((r) => r !== opt.value)
                              : [...current, opt.value],
                          });
                        }}
                        className={`rounded-full border px-3 py-1 text-xs ${
                          active
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background hover:bg-muted"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={editPromo.is_active ?? true}
                  onCheckedChange={(checked) =>
                    setEditPromo({ ...editPromo, is_active: checked })
                  }
                />
                <Label>Active</Label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditPromo(null)}>
                  Cancel
                </Button>
                <Button onClick={savePromotion} disabled={saving}>
                  {saving ? "Saving..." : isNewPromo ? "Create" : "Update"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
