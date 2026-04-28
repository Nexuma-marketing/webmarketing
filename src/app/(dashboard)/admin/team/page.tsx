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
  DialogFooter,
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
import { UserPlus, Shield } from "lucide-react";

interface InternalUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  created_at: string;
}

const INTERNAL_ROLES = [
  { value: "admin", label: "Administrator", description: "Full access to every section." },
  { value: "marketing", label: "Marketing", description: "Manages content, articles, promotions and matching." },
  { value: "sales", label: "Sales", description: "Manages leads and clients only." },
  { value: "support", label: "Support", description: "Read-only access to clients and leads." },
];

const PERMISSIONS_BY_ROLE: Record<string, string[]> = {
  admin: [
    "Read/write all data",
    "Manage users and assign roles",
    "Edit pricing, promotions, plans",
    "Edit content, articles, legal docs",
    "Configure forms and matching engine",
    "Export data",
  ],
  marketing: [
    "Read/write content, articles, FAQ",
    "Manage promotions and pricing",
    "Edit matching engine rules",
    "Read leads (no writes)",
    "Read users (no role changes)",
  ],
  sales: [
    "Read/write leads (status, notes, assignment)",
    "Read clients and their data",
    "Reassign service recommendations",
    "No access to pricing, content, legal",
  ],
  support: [
    "Read leads",
    "Read clients",
    "No write access anywhere",
  ],
};

export default function AdminTeamPage() {
  const [team, setTeam] = useState<InternalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("marketing");

  const supabase = createClient();

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id, email, full_name, role, created_at")
      .in("role", ["admin", "marketing", "sales", "support"])
      .order("role")
      .order("created_at", { ascending: false });

    setTeam((data as InternalUser[]) || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  function generatePassword() {
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
    let p = "";
    for (let i = 0; i < 14; i++) p += chars[Math.floor(Math.random() * chars.length)];
    setPassword(p);
  }

  async function createUser() {
    if (!email || !fullName || !password) {
      setError("All fields are required.");
      return;
    }
    setCreating(true);
    setError(null);
    setMessage(null);
    const res = await fetch("/api/admin/create-internal-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, full_name: fullName, password, role }),
    });
    const body = await res.json().catch(() => ({}));
    setCreating(false);
    if (!res.ok) {
      setError(body.error || `Request failed: ${res.status}`);
      return;
    }
    setMessage(`Created ${email} as ${role}. Share these credentials with them privately.`);
    setOpen(false);
    setEmail("");
    setFullName("");
    setPassword("");
    setRole("marketing");
    load();
  }

  async function changeRole(userId: string, newRole: string) {
    await supabase
      .from("profiles")
      .update({ role: newRole, role_locked: true })
      .eq("id", userId);
    load();
  }

  async function removeFromTeam(userId: string) {
    if (!confirm("Demote this user back to a regular tenant role? They will lose admin access immediately.")) return;
    await supabase
      .from("profiles")
      .update({ role: "inquilino", role_locked: true })
      .eq("id", userId);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Internal Team</h1>
          <p className="text-muted-foreground">
            Create and manage internal users with Admin / Marketing / Sales / Support roles.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          Add team member
        </Button>
      </div>

      {message && (
        <div className="rounded-md bg-green-100 p-3 text-sm text-green-800">{message}</div>
      )}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Team table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team members ({team.length})</CardTitle>
          <CardDescription>Click the role pill to change it.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground py-4">Loading...</p>
          ) : team.length === 0 ? (
            <p className="text-muted-foreground py-4">No internal team members yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {team.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.full_name}</TableCell>
                    <TableCell>{m.email}</TableCell>
                    <TableCell>
                      <Select
                        value={m.role}
                        onValueChange={(v) => v && changeRole(m.id, v)}
                      >
                        <SelectTrigger className="w-[140px] h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {INTERNAL_ROLES.map((r) => (
                            <SelectItem key={r.value} value={r.value}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(m.created_at).toLocaleDateString("en-CA")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFromTeam(m.id)}
                      >
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Permission reference */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4" />
            What each role can do
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {INTERNAL_ROLES.map((r) => (
              <div key={r.value} className="rounded-md border p-3">
                <Badge className="mb-2">{r.label}</Badge>
                <p className="text-xs text-muted-foreground mb-2">{r.description}</p>
                <ul className="space-y-1 text-xs">
                  {(PERMISSIONS_BY_ROLE[r.value] || []).map((p) => (
                    <li key={p} className="text-muted-foreground">
                      &middot; {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a team member</DialogTitle>
            <DialogDescription>
              Creates an authenticated account with the chosen role. Share the credentials privately with the team member; they can change the password from their profile.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Full name</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center justify-between">
                Password
                <button
                  type="button"
                  onClick={generatePassword}
                  className="text-xs text-primary underline"
                >
                  Generate strong password
                </button>
              </Label>
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="text"
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => v && setRole(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTERNAL_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label} — {r.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createUser} disabled={creating}>
              {creating ? "Creating..." : "Create user"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
