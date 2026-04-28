"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { DataTable } from "@/components/dashboard/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Trash2, Upload } from "lucide-react";
import { ROLE_LABELS } from "@/lib/constants";
import type { ColumnDef } from "@tanstack/react-table";

interface ServiceRow {
  id: string;
  name: string;
  description: string | null;
  category: string;
  subcategory: string | null;
  tier: string | null;
  price: number;
  currency: string;
  is_active: boolean;
  status: string;
  visible_on_web: boolean;
  target_time: string | null;
  recurring_interval: string | null;
  media_urls: string[];
  target_roles: string[];
  features: string[];
  created_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  paused: "Paused",
  archived: "Archived",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-50 text-green-700",
  paused: "bg-yellow-50 text-yellow-700",
  archived: "bg-gray-100 text-gray-700",
};

const CURRENCY_OPTIONS = ["CAD", "USD", "EUR", "MXN", "COP", "ARS"];

const RECURRING_OPTIONS = [
  { value: "one_time", label: "One-time" },
  { value: "monthly", label: "Monthly recurring" },
  { value: "yearly", label: "Yearly recurring" },
];

const ASSIGNABLE_ROLES = [
  "propietario",
  "propietario_preferido",
  "inversionista",
  "inquilino",
  "inquilino_premium",
  "pymes",
];

const EMPTY_SERVICE: Partial<ServiceRow> = {
  name: "",
  description: "",
  category: "",
  subcategory: "",
  tier: "",
  price: 0,
  currency: "CAD",
  is_active: true,
  status: "active",
  visible_on_web: true,
  target_time: "",
  recurring_interval: "one_time",
  media_urls: [],
  target_roles: [],
  features: [],
};

export default function AdminServicesPage() {
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editService, setEditService] = useState<Partial<ServiceRow> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [featuresText, setFeaturesText] = useState("");
  const [uploadingMedia, setUploadingMedia] = useState(false);

  const supabase = createClient();

  const loadServices = useCallback(async () => {
    const { data } = await supabase
      .from("services")
      .select("*")
      .order("category")
      .order("name");

    setServices((data || []) as ServiceRow[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  function openNew() {
    setEditService({ ...EMPTY_SERVICE });
    setFeaturesText("");
    setIsNew(true);
  }

  function openEdit(service: ServiceRow) {
    setEditService({ ...service });
    setFeaturesText((service.features || []).join("\n"));
    setIsNew(false);
  }

  async function handleSave() {
    if (!editService?.name) return;
    setSaving(true);

    const status = editService.status || "active";
    const payload = {
      name: editService.name,
      description: editService.description || null,
      category: editService.category || "",
      subcategory: editService.subcategory || null,
      tier: editService.tier || null,
      price: editService.price || 0,
      currency: editService.currency || "CAD",
      is_active: status === "active",
      status,
      visible_on_web: editService.visible_on_web ?? true,
      target_time: editService.target_time || null,
      recurring_interval: editService.recurring_interval || "one_time",
      media_urls: editService.media_urls || [],
      target_roles: editService.target_roles || [],
      features: featuresText
        .split("\n")
        .map((f) => f.trim())
        .filter(Boolean),
    };

    if (isNew) {
      await supabase.from("services").insert(payload);
    } else {
      await supabase.from("services").update(payload).eq("id", editService.id!);
    }

    setEditService(null);
    setSaving(false);
    loadServices();
  }

  async function changeStatus(id: string, status: string) {
    await supabase
      .from("services")
      .update({ status, is_active: status === "active" })
      .eq("id", id);
    loadServices();
  }

  async function handleMediaUpload(file: File) {
    if (!editService) return;
    setUploadingMedia(true);
    const ext = file.name.split(".").pop() || "bin";
    const path = `${editService.id || "new"}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("service-media")
      .upload(path, file, { upsert: false, cacheControl: "31536000" });
    if (error) {
      alert(`Upload failed: ${error.message}. Make sure the "service-media" bucket exists.`);
      setUploadingMedia(false);
      return;
    }
    const { data: pub } = supabase.storage.from("service-media").getPublicUrl(path);
    setEditService({
      ...editService,
      media_urls: [...(editService.media_urls || []), pub.publicUrl],
    });
    setUploadingMedia(false);
  }

  function removeMedia(url: string) {
    if (!editService) return;
    setEditService({
      ...editService,
      media_urls: (editService.media_urls || []).filter((u) => u !== url),
    });
  }

  function toggleTargetRole(role: string) {
    if (!editService) return;
    const current = editService.target_roles || [];
    setEditService({
      ...editService,
      target_roles: current.includes(role)
        ? current.filter((r) => r !== role)
        : [...current, role],
    });
  }

  const columns: ColumnDef<ServiceRow>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <span className="font-medium">{row.getValue("name")}</span>
      ),
    },
    {
      accessorKey: "category",
      header: "Category",
      filterFn: "equals",
    },
    {
      accessorKey: "tier",
      header: "Tier",
      cell: ({ row }) => row.getValue("tier") || "—",
    },
    {
      accessorKey: "price",
      header: "Price",
      cell: ({ row }) =>
        `$${(row.getValue("price") as number).toLocaleString()} ${row.original.currency}`,
    },
    {
      accessorKey: "recurring_interval",
      header: "Billing",
      cell: ({ row }) => {
        const r = row.getValue("recurring_interval") as string;
        return RECURRING_OPTIONS.find((o) => o.value === r)?.label || "—";
      },
    },
    {
      accessorKey: "target_time",
      header: "Target Time",
      cell: ({ row }) => row.getValue("target_time") || "—",
    },
    {
      accessorKey: "target_roles",
      header: "Target Roles",
      cell: ({ row }) => {
        const roles = row.getValue("target_roles") as string[];
        return (
          <div className="flex flex-wrap gap-1">
            {roles.map((r) => (
              <Badge key={r} variant="outline" className="text-xs">
                {ROLE_LABELS[r] || r}
              </Badge>
            ))}
          </div>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      filterFn: "equals",
      cell: ({ row }) => {
        const s = (row.getValue("status") as string) || (row.original.is_active ? "active" : "paused");
        return (
          <Select value={s} onValueChange={(v) => v && changeStatus(row.original.id, v)}>
            <SelectTrigger className={`w-[120px] h-8 ${STATUS_COLORS[s] || ""}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      },
    },
    {
      accessorKey: "visible_on_web",
      header: "Web",
      cell: ({ row }) =>
        row.getValue("visible_on_web") ? (
          <Badge className="bg-blue-50 text-blue-700">Visible</Badge>
        ) : (
          <Badge variant="outline">Hidden</Badge>
        ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <Button variant="outline" size="sm" onClick={() => openEdit(row.original)}>
          Edit
        </Button>
      ),
    },
  ];

  // Extract unique categories for filter
  const categoryOptions = Array.from(
    new Set(services.map((s) => s.category).filter(Boolean))
  ).map((c) => ({ value: c, label: c }));

  const statusFilterOptions = Object.entries(STATUS_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Service Catalog</h1>
          <p className="text-muted-foreground">
            Manage services, pricing, status, visibility, and media
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" />
          New Service
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={services}
        loading={loading}
        searchKey="name"
        searchPlaceholder="Search by name..."
        filters={[
          ...(categoryOptions.length > 0
            ? [{ key: "category", label: "Category", options: categoryOptions }]
            : []),
          { key: "status", label: "Status", options: statusFilterOptions },
        ]}
      />

      {/* Service Editor Dialog */}
      <Dialog open={!!editService} onOpenChange={() => setEditService(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isNew ? "New Service" : "Edit Service"}</DialogTitle>
            <DialogDescription>
              {isNew ? "Create a new service" : `Editing: ${editService?.name}`}
            </DialogDescription>
          </DialogHeader>
          {editService && (
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={editService.name || ""}
                  onChange={(e) =>
                    setEditService({ ...editService, name: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Short description</Label>
                <Input
                  value={editService.description || ""}
                  onChange={(e) =>
                    setEditService({ ...editService, description: e.target.value })
                  }
                  placeholder="One-line summary visible on cards"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Input
                    value={editService.category || ""}
                    onChange={(e) =>
                      setEditService({ ...editService, category: e.target.value })
                    }
                    placeholder="e.g., photography"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Subcategory</Label>
                  <Input
                    value={editService.subcategory || ""}
                    onChange={(e) =>
                      setEditService({ ...editService, subcategory: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Tier</Label>
                  <Input
                    value={editService.tier || ""}
                    onChange={(e) =>
                      setEditService({ ...editService, tier: e.target.value })
                    }
                    placeholder="basic / preferred_owners / elite"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Price</Label>
                  <Input
                    type="number"
                    value={editService.price || 0}
                    onChange={(e) =>
                      setEditService({ ...editService, price: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Select
                    value={editService.currency || "CAD"}
                    onValueChange={(v) =>
                      v && setEditService({ ...editService, currency: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCY_OPTIONS.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Billing</Label>
                  <Select
                    value={editService.recurring_interval || "one_time"}
                    onValueChange={(v) =>
                      v && setEditService({ ...editService, recurring_interval: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RECURRING_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Target Time</Label>
                  <Input
                    value={editService.target_time || ""}
                    onChange={(e) =>
                      setEditService({ ...editService, target_time: e.target.value })
                    }
                    placeholder="e.g., 15 days average"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>What it includes (one bullet per line)</Label>
                <Textarea
                  value={featuresText}
                  onChange={(e) => setFeaturesText(e.target.value)}
                  rows={4}
                  placeholder={"Marketing campaign\nProfessional photography\nDedicated account manager"}
                />
              </div>

              <div className="space-y-2">
                <Label>Target Roles (who sees this service in recommendations)</Label>
                <div className="flex flex-wrap gap-2">
                  {ASSIGNABLE_ROLES.map((r) => {
                    const active = (editService.target_roles || []).includes(r);
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => toggleTargetRole(r)}
                        className={`rounded-full border px-3 py-1 text-xs ${
                          active
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background hover:bg-muted"
                        }`}
                      >
                        {ROLE_LABELS[r] || r}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Photos / Videos</Label>
                <div className="flex flex-wrap gap-2">
                  {(editService.media_urls || []).map((url) => (
                    <div key={url} className="relative group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt="service media"
                        className="h-20 w-20 object-cover rounded-md border"
                      />
                      <button
                        type="button"
                        onClick={() => removeMedia(url)}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full h-5 w-5 flex items-center justify-center text-xs"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <label className="h-20 w-20 rounded-md border-2 border-dashed flex items-center justify-center cursor-pointer hover:bg-muted">
                    <input
                      type="file"
                      accept="image/*,video/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleMediaUpload(file);
                      }}
                    />
                    {uploadingMedia ? (
                      <span className="text-xs">...</span>
                    ) : (
                      <Upload className="h-4 w-4 text-muted-foreground" />
                    )}
                  </label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Images/videos uploaded to the &ldquo;service-media&rdquo; bucket. Public URLs are stored on the service.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Lifecycle Status</Label>
                  <Select
                    value={editService.status || "active"}
                    onValueChange={(v) =>
                      v && setEditService({ ...editService, status: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Active = sold and recommended. Paused = recommendation hidden but kept in history. Archived = removed from all flows but kept for past payments.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center justify-between">
                    Visible on public web
                    <Switch
                      checked={editService.visible_on_web ?? true}
                      onCheckedChange={(checked) =>
                        setEditService({ ...editService, visible_on_web: checked })
                      }
                    />
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Off = the service exists for back-office use but is not shown on the marketing site.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditService(null)}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? "Saving..." : isNew ? "Create" : "Update"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
