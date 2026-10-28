"use client";

import { useCallback, useEffect, useState } from "react";
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
import { Plus, Tag } from "lucide-react";
import {
  PROMO_APPLIES_TO,
  PROMO_APPLIES_TO_LABELS,
  PROMO_MAX_PERCENT,
  vancouverToday,
  validatePromotionInput,
  type PromoAppliesTo,
} from "@/lib/promotions";

// FIX_PROMOTIONS_REPORT.md: promo codes, managed by admin, marketing and
// sales (delete: admin only). Moved out of /admin/pricing so marketing
// and sales get their own page. Zones (Zona) were removed: codes are
// limited by client type and by what is bought (applies_to).

interface Promotion {
  id: string;
  code: string;
  description: string | null;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  valid_from: string;
  valid_until: string | null;
  is_active: boolean;
  max_uses: number | null;
  used_count: number;
  target_roles: string[];
  applies_to: PromoAppliesTo | null;
}

const ROLE_TARGET_OPTIONS = [
  { value: "propietario", label: "Property Owner" },
  { value: "propietario_preferido", label: "Preferred Owner" },
  { value: "inversionista", label: "Investor" },
  { value: "inquilino", label: "Tenant" },
  { value: "inquilino_premium", label: "Premium Tenant" },
  { value: "pymes", label: "Business Owner" },
];

export function PromotionsManager() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [canDelete, setCanDelete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editPromo, setEditPromo] = useState<Partial<Promotion> | null>(null);
  const [isNewPromo, setIsNewPromo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<string[]>([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/promotions", { cache: "no-store" });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setLoadError(body.error || `Could not load promotions (${res.status})`);
      setPromotions([]);
    } else {
      const json = (await res.json()) as { promotions: Promotion[]; canDelete?: boolean };
      setLoadError(null);
      setPromotions(json.promotions || []);
      setCanDelete(!!json.canDelete);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function savePromotion() {
    if (!editPromo) return;
    const payload = {
      code: editPromo.code ?? "",
      description: editPromo.description || null,
      discount_type: editPromo.discount_type || "percentage",
      discount_value: editPromo.discount_value ?? "",
      valid_from: editPromo.valid_from || vancouverToday(),
      valid_until: editPromo.valid_until || null,
      is_active: editPromo.is_active ?? true,
      max_uses: editPromo.max_uses ?? null,
      target_roles: editPromo.target_roles || [],
      applies_to: editPromo.applies_to || "all",
    };
    const checked = validatePromotionInput(payload);
    if (!checked.ok) {
      setFormErrors(checked.errors);
      return;
    }
    setFormErrors([]);
    setSaving(true);
    const res = await fetch("/api/admin/promotions", {
      method: isNewPromo ? "POST" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isNewPromo ? checked.value : { id: editPromo.id, ...checked.value }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setFormErrors([body.error || `Save failed (${res.status})`]);
      return;
    }
    setEditPromo(null);
    load();
  }

  async function setActive(promo: Promotion, active: boolean) {
    const res = await fetch("/api/admin/promotions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: promo.id, is_active: active }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      alert(`Could not ${active ? "activate" : "deactivate"} ${promo.code}: ${body.error || res.status}`);
    }
    load();
  }

  if (loading) {
    return <p className="text-muted-foreground py-6">Loading promotions...</p>;
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              Promotions / Campaigns
            </CardTitle>
            <CardDescription>
              Discount codes customers type at checkout. Each code can be limited by
              <b> date range</b> (Temporada), <b>customer type</b> (Tipo de cliente) and
              <b> what it applies to</b> (PYME plans, property purchases, or everything).
              A customer can use each code once. A use is counted when the payment completes.
            </CardDescription>
          </div>
          <Button
            onClick={() => {
              setEditPromo({
                code: "",
                description: "",
                discount_type: "percentage",
                discount_value: 10,
                valid_from: vancouverToday(),
                valid_until: "",
                is_active: true,
                max_uses: null,
                target_roles: [],
                applies_to: "all",
              });
              setFormErrors([]);
              setIsNewPromo(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            New Promotion
          </Button>
        </CardHeader>
        <CardContent>
          {loadError && (
            <p className="mb-3 rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-800">{loadError}</p>
          )}
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Applies to</TableHead>
                  <TableHead>Valid Period</TableHead>
                  <TableHead>Uses</TableHead>
                  <TableHead>Active</TableHead>
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
                      {PROMO_APPLIES_TO_LABELS[(promo.applies_to || "all") as PromoAppliesTo] ?? promo.applies_to}
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
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={promo.is_active}
                          onCheckedChange={(checked) => setActive(promo, checked)}
                          aria-label={`${promo.is_active ? "Deactivate" : "Activate"} ${promo.code}`}
                        />
                        <Badge variant={promo.is_active ? "default" : "secondary"}>
                          {promo.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="space-x-1 whitespace-nowrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditPromo({ ...promo, applies_to: promo.applies_to || "all" });
                          setFormErrors([]);
                          setIsNewPromo(false);
                        }}
                      >
                        Edit
                      </Button>
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={async () => {
                            if (!confirm(`Delete promotion "${promo.code}" permanently? This cannot be undone.`)) return;
                            const res = await fetch(`/api/admin/promotions?id=${encodeURIComponent(promo.id)}`, {
                              method: "DELETE",
                            });
                            if (!res.ok) {
                              const body = (await res.json().catch(() => ({}))) as { error?: string };
                              alert(`Delete failed: ${body.error || res.status}`);
                              return;
                            }
                            load();
                          }}
                        >
                          Delete
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {promotions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{isNewPromo ? "New Promotion / Campaign" : "Edit Promotion"}</DialogTitle>
            <DialogDescription className="space-y-1">
              <span>
                {isNewPromo ? "Create a discount code or seasonal campaign." : `Editing: ${editPromo?.code}`}
              </span>
              <span className="block text-xs text-muted-foreground">
                Sections in this form: <b>Basic info</b> · <b>Applies to</b> · <b>Validity dates (Temporada)</b> · <b>Max uses</b> · <b>Tipo de cliente</b> · <b>Active toggle</b>. Scroll down to see them all.
              </span>
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
                    min={editPromo.discount_type === "fixed" ? 0.01 : 1}
                    max={editPromo.discount_type === "fixed" ? undefined : PROMO_MAX_PERCENT}
                    step={editPromo.discount_type === "fixed" ? 0.01 : 1}
                    value={editPromo.discount_value ?? ""}
                    onChange={(e) =>
                      setEditPromo({
                        ...editPromo,
                        discount_value: e.target.value === "" ? undefined : Number(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Percentage: whole number from 1 to {PROMO_MAX_PERCENT}. Fixed amount: more than $0; at checkout it is
                refused if it would leave any payment below $0.50 CAD. On PYME plans the discount is spread over the
                initial payment and every installment.
              </p>
              <div className="space-y-2">
                <Label>Applies to</Label>
                <Select
                  value={editPromo.applies_to || "all"}
                  onValueChange={(v) => setEditPromo({ ...editPromo, applies_to: v as PromoAppliesTo })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROMO_APPLIES_TO.map((value) => (
                      <SelectItem key={value} value={value}>
                        {PROMO_APPLIES_TO_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-md border border-primary/20 bg-primary/5 p-3 space-y-3">
                <p className="text-sm font-semibold">
                  📅 Temporada / Validity dates
                </p>
                <p className="text-xs text-muted-foreground">
                  Vancouver time, both dates included. Outside this range the code is rejected at
                  checkout. Leave Valid Until blank for an open-ended promo.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Valid From</Label>
                    <Input
                      type="date"
                      value={(editPromo.valid_from || "").slice(0, 10)}
                      onChange={(e) =>
                        setEditPromo({ ...editPromo, valid_from: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Valid Until</Label>
                    <Input
                      type="date"
                      min={(editPromo.valid_from || "").slice(0, 10) || undefined}
                      value={(editPromo.valid_until || "").slice(0, 10)}
                      onChange={(e) =>
                        setEditPromo({ ...editPromo, valid_until: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Max Uses (blank = unlimited)</Label>
                <Input
                  type="number"
                  min={1}
                  step={1}
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
                  placeholder="e.g., Spring season"
                />
              </div>
              <div className="rounded-lg border border-amber-300 bg-amber-50/50 p-4 space-y-2">
                <Label className="font-medium">
                  Tipo de cliente — Target client types
                </Label>
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
                <p className="text-xs text-muted-foreground">
                  Click each role to toggle. Blank = all client types.
                </p>
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
              {formErrors.length > 0 && (
                <ul role="alert" className="rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-800 list-disc pl-6">
                  {formErrors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}
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
    </>
  );
}
