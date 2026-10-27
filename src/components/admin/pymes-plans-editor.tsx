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
import { Briefcase } from "lucide-react";
import { pymesPlanTotal } from "@/lib/pymes-plan-pricing";

// FIX_PYME_PRICES_SINGLE_SOURCE_REPORT.md: Admin → Pricing → PYME Plans.
// Edits the pymes_plans table (the only source of PYME prices) through
// /api/admin/pymes-plans. Admin edits; other internal roles see it
// read-only.

interface PymesPlanRow {
  id: string;
  plan_type: string;
  name: string;
  price: number;
  upfront_amount: number | null;
  installment_amount: number | null;
  installment_months: number | null;
}

type Draft = { upfront: string; amount: string; months: string };

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;

function draftOf(p: PymesPlanRow): Draft {
  return {
    upfront: p.upfront_amount == null ? "" : String(p.upfront_amount),
    amount: p.installment_amount == null ? "" : String(p.installment_amount),
    months: p.installment_months == null ? "" : String(p.installment_months),
  };
}

// Client-side check only for a quick message; the API validates again.
function draftError(d: Draft): string | null {
  const upfront = Number(d.upfront);
  const amount = Number(d.amount);
  const months = Number(d.months);
  if (!d.upfront || !(upfront > 0)) return "Upfront payment must be greater than 0.";
  if (!d.amount || !(amount > 0)) return "Installment amount must be greater than 0.";
  if (!Number.isInteger(months) || months < 1 || months > 12) return "Installments must be a whole number from 1 to 12.";
  return null;
}

function draftTotal(d: Draft): number | null {
  if (draftError(d)) return null;
  return pymesPlanTotal(Number(d.upfront), Number(d.amount), Number(d.months));
}

export function PymesPlansEditor() {
  const [plans, setPlans] = useState<PymesPlanRow[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ upfront: "", amount: "", months: "" });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/pymes-plans", { cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as {
      plans?: PymesPlanRow[];
      canEdit?: boolean;
      error?: string;
    };
    if (!res.ok) {
      setLoadError(body.error || `Error ${res.status}`);
      return;
    }
    setLoadError(null);
    setPlans(body.plans || []);
    setCanEdit(!!body.canEdit);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const editing = plans.find((p) => p.id === editingId) || null;
  const total = draftTotal(draft);
  const error = editingId ? draftError(draft) : null;

  async function save() {
    if (!editing) return;
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/admin/pymes-plans", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editing.id,
        upfront_amount: Number(draft.upfront),
        installment_amount: Number(draft.amount),
        installment_months: Number(draft.months),
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string; servicesSynced?: boolean };
    setSaving(false);
    setConfirmOpen(false);
    if (!res.ok) {
      setMessage({ ok: false, text: `Save failed: ${body.error || res.status}` });
      return;
    }
    setEditingId(null);
    setMessage({
      ok: true,
      text:
        `${editing.name} saved at ${new Date().toLocaleTimeString()}. New purchases use the new prices.` +
        (body.servicesSynced === false ? " Warning: the \"Plan: PYMES\" service row price could not be synced." : ""),
    });
    load();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Briefcase className="h-5 w-5" />
          PYME Plans
        </CardTitle>
        <CardDescription>
          Upfront payment and monthly installments for Rescue, Growth and Scale. This is what
          checkout charges and what every PYME page and email shows. Changes apply to new
          purchases only; customers who already bought keep their own prices in Stripe.
          {!canEdit && " Read-only: only admin can edit these prices."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loadError && (
          <p className="rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-800">
            Could not load PYME plans: {loadError}
          </p>
        )}
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead>Upfront</TableHead>
                <TableHead>Installment</TableHead>
                <TableHead># Installments</TableHead>
                <TableHead>Total</TableHead>
                {canEdit && <TableHead>Action</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.map((p) => {
                const isEditing = editingId === p.id;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    {isEditing ? (
                      <>
                        <TableCell>
                          <Input
                            type="number"
                            min={0.01}
                            step="0.01"
                            className="h-8 w-28"
                            value={draft.upfront}
                            onChange={(e) => setDraft({ ...draft, upfront: e.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0.01}
                            step="0.01"
                            className="h-8 w-28"
                            value={draft.amount}
                            onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={1}
                            max={12}
                            step={1}
                            className="h-8 w-20"
                            value={draft.months}
                            onChange={(e) => setDraft({ ...draft, months: e.target.value })}
                          />
                        </TableCell>
                        <TableCell className="font-semibold">
                          {total != null ? `${money(total)} CAD` : "—"}
                        </TableCell>
                        <TableCell className="space-x-1 whitespace-nowrap">
                          <Button
                            size="sm"
                            disabled={!!error || saving}
                            onClick={() => setConfirmOpen(true)}
                          >
                            Save
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                            Cancel
                          </Button>
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell>{p.upfront_amount != null ? money(Number(p.upfront_amount)) : "—"}</TableCell>
                        <TableCell>{p.installment_amount != null ? money(Number(p.installment_amount)) : "—"}</TableCell>
                        <TableCell>{p.installment_months ?? "—"}</TableCell>
                        <TableCell className="font-semibold">{money(Number(p.price))} CAD</TableCell>
                        {canEdit && (
                          <TableCell>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditingId(p.id);
                                setDraft(draftOf(p));
                                setMessage(null);
                              }}
                            >
                              Edit
                            </Button>
                          </TableCell>
                        )}
                      </>
                    )}
                  </TableRow>
                );
              })}
              {plans.length === 0 && !loadError && (
                <TableRow>
                  <TableCell colSpan={canEdit ? 6 : 5} className="py-8 text-center text-muted-foreground">
                    No active PYME plans found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {editingId && error && <p className="text-sm text-red-700">{error}</p>}
        {editingId && total != null && (
          <p className="text-xs text-muted-foreground">
            Total = upfront + installments × amount = {money(Number(draft.upfront))} + {draft.months} ×{" "}
            {money(Number(draft.amount))} = {money(total)} CAD
          </p>
        )}
        {message && (
          <p
            className={`rounded-md border p-2 text-sm ${
              message.ok
                ? "border-green-200 bg-green-50 text-green-800"
                : "border-red-300 bg-red-50 font-medium text-red-800"
            }`}
          >
            {message.text}
          </p>
        )}
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={(open) => { if (!open && !saving) setConfirmOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change {editing?.name} prices?</DialogTitle>
            <DialogDescription>
              This affects new purchases only. Customers who already purchased are not changed.
            </DialogDescription>
          </DialogHeader>
          {editing && total != null && (
            <div className="space-y-1 text-sm">
              <p>
                <span className="text-muted-foreground">Now: </span>
                {editing.upfront_amount != null ? money(Number(editing.upfront_amount)) : "—"} upfront +{" "}
                {editing.installment_months ?? "—"} ×{" "}
                {editing.installment_amount != null ? money(Number(editing.installment_amount)) : "—"} ={" "}
                {money(Number(editing.price))} CAD
              </p>
              <p className="font-medium">
                <span className="text-muted-foreground font-normal">New: </span>
                {money(Number(draft.upfront))} upfront + {draft.months} × {money(Number(draft.amount))} ={" "}
                {money(total)} CAD
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={saving} onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button disabled={saving} onClick={save}>
              {saving ? "Saving..." : "Yes, save new prices"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
