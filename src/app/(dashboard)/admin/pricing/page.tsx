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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DollarSign, Tag, Users } from "lucide-react";
import { PymesPlansEditor } from "@/components/admin/pymes-plans-editor";

// FIX_PYME_PRICES_SINGLE_SOURCE_REPORT.md: the "Plan: PYMES — X" services
// rows are read-only here. PYME prices live in pymes_plans and are edited
// in the PYME Plans section below (admin only).
const isPymePlanService = (name: string | null | undefined) =>
  (name || "").startsWith("Plan: PYMES");

interface ServicePrice {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  price: number;
  currency: string;
  is_active: boolean;
}

export default function AdminPricingPage() {
  const [services, setServices] = useState<ServicePrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPrice, setEditingPrice] = useState<string | null>(null);
  const [newPrice, setNewPrice] = useState("");
  const [foundersTaken, setFoundersTaken] = useState<number>(0);
  const [foundersLimit, setFoundersLimit] = useState<number>(20);
  const [foundersSaving, setFoundersSaving] = useState(false);
  const [foundersMessage, setFoundersMessage] = useState<string | null>(null);

  const supabase = createClient();

  const load = useCallback(async () => {
    // FIX_PROMOTIONS_REPORT.md: promotions moved to /admin/promotions.
    const [{ data: svcData }, { data: cfgData }] = await Promise.all([
      supabase
        .from("services")
        .select("id, name, description, category, price, currency, is_active")
        .order("name"),
      supabase
        .from("app_config")
        .select("key, value")
        .eq("category", "founders_plan"),
    ]);

    setServices(svcData || []);
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
    // Steve 5/11: re-fetch the affected rows so RLS-blocked writes
    // (0 rows + no error) surface as a loud error instead of a silent
    // success that confuses the admin into thinking the counter saved.
    const { data: returned, error } = await supabase
      .from("app_config")
      .upsert(rows, { onConflict: "category,key" })
      .select("category, key, value");
    setFoundersSaving(false);
    if (error) {
      setFoundersMessage(`Save failed: ${error.message}`);
      return;
    }
    if (!returned || returned.length < 2) {
      setFoundersMessage(
        "Save reported success but the database did not change. " +
        "Likely cause: your account is missing the admin role. " +
        "Verify with: SELECT role FROM profiles WHERE id = auth.uid();",
      );
      return;
    }
    setFoundersMessage(
      `Updated & verified at ${new Date().toLocaleTimeString()}. ` +
      `Visible on the public dashboard within seconds.`,
    );
  }

  useEffect(() => {
    load();
  }, [load]);

  async function updatePrice(id: string) {
    if (!newPrice) return;
    if (isPymePlanService(services.find((s) => s.id === id)?.name)) return;
    // Steve 5/11: verify the write actually changed a row. An empty
    // `data` array means RLS blocked the UPDATE silently.
    const { data: returned, error } = await supabase
      .from("services")
      .update({ price: Number(newPrice) })
      .eq("id", id)
      .select("id, price");
    if (error) {
      setFoundersMessage(`Price save failed: ${error.message}`);
      return;
    }
    if (!returned || returned.length === 0) {
      setFoundersMessage(
        "Price save reported success but the database did not change. " +
        "Likely cause: your account is missing the admin role.",
      );
      return;
    }
    setEditingPrice(null);
    setNewPrice("");
    setFoundersMessage(`Price updated & verified at ${new Date().toLocaleTimeString()}.`);
    setTimeout(() => setFoundersMessage(null), 4000);
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

      {/* Steve 6/8 (6-2.md #35): Alex reported confusion — she edited a
          plan price here but the "$200 system fee" text on the public
          card didn't change. Those bullets + the tagline ("35% of first
          month's rent") live in /admin/plans, NOT here. Adding this
          banner so admins know where to go for each field. */}
      <div className="rounded-lg border-2 border-blue-200 bg-blue-50 p-4 text-sm">
        <p className="font-semibold text-blue-900 mb-2">Where to edit what:</p>
        <ul className="list-disc ml-5 space-y-1 text-blue-900">
          <li>
            <strong>Service Prices (below)</strong>: the one-time price of each service, used on its purchase button (for example the Founders upgrade and add-on services). The &ldquo;Plan: PYMES&rdquo; rows are read-only here.
          </li>
          <li>
            <strong>PYME Plans (below, admin only)</strong>: upfront payment, installment amount and number of installments for Rescue, Growth and Scale. These are what checkout charges and what every PYME page and email shows (&ldquo;Pay $X CAD upfront&rdquo;, &ldquo;N installments of $Y&rdquo;). Changes apply to new purchases only.
          </li>
          <li>
            <strong><a href="/admin/plans" className="underline font-semibold">Plan Checklists →</a></strong>: the feature bullets (e.g. &ldquo;$200 system fee upfront&rdquo;, &ldquo;Pay the balance only after tenant signs the lease&rdquo;) and the tagline (e.g. &ldquo;35% of first month&apos;s rent&rdquo;).
          </li>
          <li>
            The two are intentionally separate — the system fee is a fixed platform fee, the plan price varies per tier.
          </li>
        </ul>
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
            <p
              className={`mt-3 text-sm rounded-md border p-2 ${
                foundersMessage.toLowerCase().includes("fail") ||
                foundersMessage.toLowerCase().includes("did not change") ||
                foundersMessage.toLowerCase().includes("missing the admin")
                  ? "border-red-300 bg-red-50 text-red-800 font-medium"
                  : "border-green-200 bg-green-50 text-green-800"
              }`}
            >
              {foundersMessage}
            </p>
          )}
        </CardContent>
      </Card>

      {/* PYME Plans — only source of PYME prices */}
      <PymesPlansEditor />

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
                      {isPymePlanService(svc.name) ? (
                        <span className="text-xs text-muted-foreground">
                          Edit PYME plan prices in PYME Plans
                        </span>
                      ) : (
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
                      )}
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

      {/* FIX_PROMOTIONS_REPORT.md: promo codes have their own page now. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Promotions / Campaigns
          </CardTitle>
          <CardDescription>
            Promo codes are managed in{" "}
            <a href="/admin/promotions" className="underline font-semibold">Promotions →</a>
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
