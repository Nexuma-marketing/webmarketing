"use client";

import { useEffect, useState, useCallback } from "react";
import { DataTable } from "@/components/dashboard/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import {
  ROLE_LABELS,
  LEAD_STATUS_LABELS,
  LEAD_STATUS_COLORS,
} from "@/lib/constants";
import type { ColumnDef } from "@tanstack/react-table";

interface LeadRow {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: string | null;
  source: string | null;
  status: string;
  notes: string | null;
  assigned_to: string | null;
  created_at: string;
}

interface AdminUser {
  id: string;
  full_name: string | null;
  email: string;
}

export default function AdminLeadsPage() {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<LeadRow | null>(null);
  const [newStatus, setNewStatus] = useState("");
  const [notes, setNotes] = useState("");
  const [assignedTo, setAssignedTo] = useState<string>("unassigned");
  const [saving, setSaving] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // Steve 6/8 (6-2.md #32): leads page used to query the leads
  // table directly via cookie-context client. RLS silently
  // returned 0 rows for sales / marketing / support — "No
  // results found" even though leads exist. Switched to the
  // service-role API at /api/admin/leads (GET roster + admins,
  // PATCH updates) so every internal role can read leads, with
  // write privileges still enforced server-side (admin + sales
  // only).
  const loadLeads = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/leads", { cache: "no-store" });
      if (!res.ok) {
        setLeads([]);
        setAdmins([]);
        return;
      }
      const json = (await res.json()) as { leads: LeadRow[]; admins: AdminUser[] };
      setLeads(json.leads || []);
      setAdmins(json.admins || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  async function handleStatusUpdate() {
    if (!selectedLead) return;
    setSaving(true);
    setUpdateError(null);

    const updates: Record<string, unknown> = {};
    if (newStatus && newStatus !== selectedLead.status) {
      // Steve 6/5 (6-2.md #24): client requested ANY-to-ANY status
      // changes. The strict workflow guard has been removed (also see
      // allowedStatuses below + migration v35).
      updates.status = newStatus;
    }
    if (notes !== (selectedLead.notes || "")) {
      updates.notes = notes || null;
    }
    const newAssignment = assignedTo === "unassigned" ? null : assignedTo;
    if (newAssignment !== (selectedLead.assigned_to || null)) {
      updates.assigned_to = newAssignment;
    }

    if (Object.keys(updates).length > 0) {
      const res = await fetch("/api/admin/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedLead.id, ...updates }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setUpdateError(body.error || `Update failed: ${res.status}`);
        setSaving(false);
        return;
      }
    }

    setSelectedLead(null);
    setSaving(false);
    loadLeads();
  }

  function adminLabel(a: AdminUser) {
    return a.full_name?.trim() || a.email;
  }

  const columns: ColumnDef<LeadRow>[] = [
    {
      accessorKey: "full_name",
      header: "Name",
      cell: ({ row }) => (
        <span className="font-medium">{row.getValue("full_name")}</span>
      ),
    },
    {
      accessorKey: "email",
      header: "Email",
    },
    {
      accessorKey: "role",
      header: "Role",
      cell: ({ row }) => {
        const role = row.getValue("role") as string | null;
        return role ? (
          <Badge variant="outline">
            {ROLE_LABELS[role] || role}
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
      filterFn: "equals",
    },
    {
      accessorKey: "source",
      header: "Source",
      cell: ({ row }) => row.getValue("source") || "—",
      filterFn: "equals",
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.getValue("status") as string;
        const colors = LEAD_STATUS_COLORS[status];
        return (
          <Badge className={`${colors?.bg || ""} ${colors?.text || ""} ${colors?.border || ""}`}>
            {LEAD_STATUS_LABELS[status] || status}
          </Badge>
        );
      },
      filterFn: "equals",
    },
    {
      accessorKey: "created_at",
      header: "Date",
      cell: ({ row }) =>
        new Date(row.getValue("created_at")).toLocaleDateString("en-CA"),
    },
    {
      accessorKey: "assigned_to",
      header: "Assigned To",
      cell: ({ row }) => {
        const id = row.getValue("assigned_to") as string | null;
        if (!id) return <span className="text-muted-foreground">—</span>;
        const admin = admins.find((a) => a.id === id);
        return admin ? adminLabel(admin) : <span className="text-muted-foreground">—</span>;
      },
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const lead = row.original;
            setSelectedLead(lead);
            setNewStatus(lead.status);
            setNotes(lead.notes || "");
            setAssignedTo(lead.assigned_to || "unassigned");
            setUpdateError(null);
          }}
        >
          Manage
        </Button>
      ),
    },
  ];

  const statusOptions = Object.entries(LEAD_STATUS_LABELS).map(
    ([value, label]) => ({ value, label })
  );

  const roleOptions = Array.from(
    new Set(leads.map((l) => l.role).filter((r): r is string => !!r)),
  ).map((r) => ({ value: r, label: ROLE_LABELS[r] || r }));

  const sourceOptions = Array.from(
    new Set(leads.map((l) => l.source).filter((s): s is string => !!s)),
  ).map((s) => ({ value: s, label: s }));

  // Steve 6/5 (6-2.md #24): client reported "solo sale en proceso y
  // cerrado" — the workflow-only transition list hid `nuevo` and
  // `contactado` whenever the selected lead was already past those
  // points. Per the client's expectation, sales need to be able to
  // pick ANY of the 4 statuses (e.g., revert a closed lead to
  // contactado). Expose all 4. The DB-side transition trigger has
  // also been relaxed in migration v35 to accept manual reverts.
  const allowedStatuses = selectedLead
    ? Object.keys(LEAD_STATUS_LABELS)
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">Lead Management</h1>
        <p className="text-muted-foreground">
          Track and manage leads through the status workflow
        </p>
      </div>

      <DataTable
        columns={columns}
        data={leads}
        loading={loading}
        searchKey="email"
        searchPlaceholder="Search by email..."
        filters={[
          {
            key: "status",
            label: "Status",
            options: statusOptions,
          },
          {
            key: "role",
            label: "Role",
            options: roleOptions,
          },
          {
            key: "source",
            label: "Source",
            options: sourceOptions,
          },
        ]}
      />

      {/* Lead Management Dialog */}
      <Dialog open={!!selectedLead} onOpenChange={() => setSelectedLead(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Lead</DialogTitle>
            <DialogDescription>
              {selectedLead?.full_name} — {selectedLead?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={newStatus} onValueChange={(v) => v && setNewStatus(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allowedStatuses.map((s) => (
                    <SelectItem key={s} value={s}>
                      {LEAD_STATUS_LABELS[s] || s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Workflow: nuevo → contactado → en_proceso → cerrado
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Assign To</label>
              <Select value={assignedTo} onValueChange={(v) => v && setAssignedTo(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {admins.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {adminLabel(a)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {admins.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No admin users found. Grant the admin role to a profile to enable assignment.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Notes</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes about this lead..."
                rows={4}
              />
            </div>
            {updateError && (
              <p className="text-sm text-red-600">{updateError}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSelectedLead(null)}>
                Cancel
              </Button>
              <Button onClick={handleStatusUpdate} disabled={saving}>
                {saving ? "Saving..." : "Update Lead"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
