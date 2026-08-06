"use client";

import { useEffect, useState, useCallback } from "react";
import { DataTable } from "@/components/dashboard/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { ROLE_LABELS } from "@/lib/constants";
import type { ColumnDef, FilterFn } from "@tanstack/react-table";

interface UserRow {
  id: string;
  full_name: string;
  email: string;
  // Steve 6/8 (6-2.md #31 Option B): phone added so admin can edit
  // and backfill phones for owners who never provided one at signup.
  phone: string | null;
  role: string;
  property_count: number;
  is_premium_tenant: boolean;
  created_at: string;
}

// Steve 4/28: when admin filters by "inquilino" or "propietario" he expects to
// see ALL tenants / owners regardless of premium/preferred/investor sub-role.
// We expose grouped pseudo-roles ("group:tenant" etc.) on top of the exact roles.
const ROLE_GROUPS: Record<string, string[]> = {
  "group:tenant": ["inquilino", "inquilino_premium"],
  "group:owner": ["propietario", "propietario_preferido", "inversionista"],
};

const groupRoleFilter: FilterFn<UserRow> = (row, columnId, filterValue) => {
  const role = row.getValue<string>(columnId);
  if (!filterValue || filterValue === "all") return true;
  const group = ROLE_GROUPS[filterValue as string];
  if (group) return group.includes(role);
  return role === filterValue;
};

const columns: ColumnDef<UserRow>[] = [
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
    cell: ({ row }) => (
      <Badge variant="outline">
        {ROLE_LABELS[row.getValue("role") as string] || row.getValue("role")}
      </Badge>
    ),
    filterFn: groupRoleFilter,
  },
  {
    accessorKey: "is_premium_tenant",
    header: "Premium Tenant",
    cell: ({ row }) =>
      row.getValue("is_premium_tenant") ? (
        <Badge className="bg-amber-50 text-amber-800">Premium</Badge>
      ) : (
        <span className="text-muted-foreground text-xs">—</span>
      ),
  },
  {
    accessorKey: "property_count",
    header: "Properties",
  },
  {
    accessorKey: "created_at",
    header: "Registered",
    cell: ({ row }) =>
      new Date(row.getValue("created_at")).toLocaleDateString("en-CA"),
  },
];

// Filter dropdown shows umbrella groups (so "All Tenants" includes premium) plus exact roles
const roleFilterOptions = [
  { value: "group:tenant", label: "All Tenants (incl. Premium)" },
  { value: "group:owner", label: "All Owners (incl. Preferred & Investor)" },
  ...Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label })),
];

// Edit-role dropdown uses only real assignable roles (no umbrella groups)
const roleAssignOptions = Object.entries(ROLE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  // Steve 6/8 (6-2.md #31 Option B): expanded from role-only Edit to a
  // full Edit dialog so admin can backfill name + phone too.
  const [editFullName, setEditFullName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRole, setEditRole] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Steve 6/8 (6-2.md #31): switched from cookie-context Supabase
  // client (RLS returned only the admin's own row) to the new
  // service-role API at /api/admin/users for both list + save.
  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      if (!res.ok) {
        setUsers([]);
        return;
      }
      const json = (await res.json()) as { users: UserRow[] };
      setUsers(json.users || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  function openEdit(user: UserRow) {
    setSelectedUser(user);
    setEditFullName(user.full_name || "");
    setEditPhone(user.phone || "");
    setEditRole(user.role);
    setSaveError(null);
  }

  async function handleSave() {
    if (!selectedUser || !editRole) return;
    setSaving(true);
    setSaveError(null);

    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: selectedUser.id,
        full_name: editFullName.trim() || null,
        phone: editPhone.trim() || null,
        role: editRole,
      }),
    });

    setSaving(false);
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      setSaveError(`Save failed: ${err.error || res.status}`);
      return;
    }

    setSelectedUser(null);
    loadUsers();
  }

  const columnsWithActions: ColumnDef<UserRow>[] = [
    ...columns,
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => openEdit(row.original)}
        >
          Edit
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">User Management</h1>
        <p className="text-muted-foreground">
          View and manage all registered users
        </p>
      </div>

      <DataTable
        columns={columnsWithActions}
        data={users}
        loading={loading}
        searchKey="email"
        searchPlaceholder="Search by email..."
        filters={[
          {
            key: "role",
            label: "Role",
            options: roleFilterOptions,
          },
        ]}
      />

      {/* Edit User Dialog */}
      <Dialog open={!!selectedUser} onOpenChange={() => setSelectedUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              {selectedUser?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            {saveError && (
              <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                {saveError}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="edit-fullname">Full name</Label>
              <Input
                id="edit-fullname"
                value={editFullName}
                onChange={(e) => setEditFullName(e.target.value)}
                placeholder="Full name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input
                id="edit-phone"
                type="tel"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="+1 514 000 0000"
              />
              <p className="text-xs text-muted-foreground">
                Backfill phone numbers for owners who skipped this field at signup.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-role">Role</Label>
              <Select value={editRole} onValueChange={(v) => v && setEditRole(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roleAssignOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSelectedUser(null)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
