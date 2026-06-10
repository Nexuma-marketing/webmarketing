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
  // Steve 6/8 (6-2.md #33): role is now included so the assign
  // dropdown can show the team member's role next to their name.
  // Backend widened from admin-only to all internal roles.
  role?: string;
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
  // Steve 6/10 (6-2.md #48): multi-field search state. DataTable's
  // built-in single-column search wasn't enough — sales needs to
  // type a phone or a name and land on the lead.
  const [leadSearch, setLeadSearch] = useState("");

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
    const name = a.full_name?.trim() || a.email;
    // Steve 6/8 (6-2.md #33): show role next to the name in the
    // assign dropdown — Alex needs to know which marketing/sales
    // member she's picking. Admin entries don't get a tag to keep
    // the legacy display unchanged.
    if (a.role && a.role !== "admin") {
      return `${name} — ${a.role}`;
    }
    return name;
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
      // Steve 6/9 (6-2.md #43): mailto link so sales can click to
      // open their mail client straight from the table.
      cell: ({ row }) => {
        const email = row.getValue("email") as string;
        return email ? (
          <a href={`mailto:${email}`} className="text-blue-600 hover:underline">
            {email}
          </a>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    },
    // Steve 6/9 (6-2.md #43): Alex docx Item 5 sub-issue 8 — sales
    // needs the phone number visible in the table to call the lead
    // without having to open the dialog. Phone is already in the
    // leads.phone column we fetch, just wasn't surfaced.
    {
      accessorKey: "phone",
      header: "Phone",
      cell: ({ row }) => {
        const phone = row.getValue("phone") as string | null;
        return phone ? (
          <a href={`tel:${phone}`} className="text-blue-600 hover:underline">
            {phone}
          </a>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
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

  // Steve 6/10 (6-2.md #48): multi-field filter. Searches name,
  // email, phone, source, and the role label so any commercial
  // facet sales might type lands on the right lead.
  const filteredLeads = leadSearch
    ? leads.filter((l) => {
        const q = leadSearch.toLowerCase();
        return (
          (l.full_name || "").toLowerCase().includes(q) ||
          (l.email || "").toLowerCase().includes(q) ||
          (l.phone || "").toLowerCase().includes(q) ||
          (l.source || "").toLowerCase().includes(q) ||
          (l.role ? (ROLE_LABELS[l.role] || l.role).toLowerCase() : "").includes(q)
        );
      })
    : leads;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">Lead Management</h1>
        <p className="text-muted-foreground">
          Track and manage leads through the status workflow
        </p>
      </div>

      {/* Steve 6/10 (6-2.md #48): multi-field search above the table.
          Replaces DataTable's single-column email search. */}
      <div className="relative max-w-md">
        <input
          type="text"
          value={leadSearch}
          onChange={(e) => setLeadSearch(e.target.value)}
          placeholder="Search by name, email, phone, source, or role..."
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      <DataTable
        columns={columns}
        data={filteredLeads}
        loading={loading}
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
              {selectedLead?.full_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            {/* Steve 6/9 (6-2.md #43): contact card at the top so
                sales can copy/click everything they need to make the
                call right from the lead dialog. Email and phone are
                clickable (mailto / tel). Role and source give context
                on which form the lead came from. */}
            {selectedLead && (
              <div className="rounded-md border bg-muted/30 p-3 space-y-1 text-sm">
                <p className="font-semibold">Contact info</p>
                <div className="grid gap-x-3 gap-y-1 sm:grid-cols-2 text-xs">
                  <div className="flex gap-2">
                    <span className="text-muted-foreground min-w-[60px]">Email:</span>
                    {selectedLead.email ? (
                      <a href={`mailto:${selectedLead.email}`} className="text-blue-600 hover:underline truncate">
                        {selectedLead.email}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground min-w-[60px]">Phone:</span>
                    {selectedLead.phone ? (
                      <a href={`tel:${selectedLead.phone}`} className="text-blue-600 hover:underline">
                        {selectedLead.phone}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground min-w-[60px]">Role:</span>
                    <span className="font-medium">
                      {selectedLead.role ? ROLE_LABELS[selectedLead.role] || selectedLead.role : "—"}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground min-w-[60px]">Source:</span>
                    <span className="font-medium">{selectedLead.source || "—"}</span>
                  </div>
                </div>
              </div>
            )}
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
