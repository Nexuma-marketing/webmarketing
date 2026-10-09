"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ExternalLink, ImageIcon } from "lucide-react";
import { ELITE_TIERS, SERVICE_TIERS } from "@/lib/constants";

export interface PropertyDetail {
  id: string;
  title: string;
  description: string;
  address: string;
  city: string;
  province: string;
  postal_code: string;
  country: string;
  property_type: string;
  monthly_rent: number | null;
  is_available: boolean;
  service_tier: string | null;
  elite_tier: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  area_sqft: number | null;
  amenities: string[];
  common_areas: string[];
  pet_friendly: boolean | null;
  smart_home: boolean | null;
  dishwasher: boolean | null;
  occupancy_status: string | null;
  availability_date: string | null;
  near_parks: boolean;
  near_churches: boolean;
  near_skytrain: boolean;
  skytrain_lines: string[];
  near_bus: boolean;
  near_mall: boolean;
  social_life: string | null;
  nearby_supermarkets: string[];
  owner_name: string;
  owner_email: string;
  owner_phone: string;
  tenant_lease_signed_at: string | null;
  balance_invoice_url: string | null;
  balance_invoice_status: string | null;
  /** Most recent completed plan payment's service name for this property; null if none. */
  purchased_plan_name: string | null;
  /** True only for Premier Tier — the one plan billed via plan_installments. */
  uses_installments: boolean;
  installments: InstallmentRow[];
  installments_error: string | null;
}

interface InstallmentRow {
  sequence: number;
  due_date: string;
  percentage: number;
  amount_cents: number;
  status: string;
  hosted_invoice_url?: string | null;
}

interface PhotoRow {
  id: string;
  image_url: string;
  room_category: string;
  status: string;
}

interface Props {
  propertyId: string | null;
  onClose: () => void;
  onPhotoStatusChanged?: () => void;
}

export function PropertyDetailModal({ propertyId, onClose, onPhotoStatusChanged }: Props) {
  const [property, setProperty] = useState<PropertyDetail | null>(null);
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [photoSavingId, setPhotoSavingId] = useState<string | null>(null);
  const [planDetails, setPlanDetails] = useState<{ tagline: string; features: string[] } | null>(null);
  const [signingLease, setSigningLease] = useState(false);
  const [regeneratingInvoice, setRegeneratingInvoice] = useState(false);
  const [invoiceMessage, setInvoiceMessage] = useState("");
  const [reschedulingInstallments, setReschedulingInstallments] = useState(false);
  const [installmentsMessage, setInstallmentsMessage] = useState("");
  const [processingInstallments, setProcessingInstallments] = useState(false);
  const [processMessage, setProcessMessage] = useState("");
  const [processErrors, setProcessErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!propertyId) {
      setProperty(null);
      setPhotos([]);
      setError("");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");
    setProperty(null);
    setPhotos([]);
    setPlanDetails(null);
    setInvoiceMessage("");
    setInstallmentsMessage("");
    setProcessMessage("");
    setProcessErrors([]);

    void (async () => {
      try {
        const detailRes = await fetch(`/api/admin/properties/${propertyId}`, { cache: "no-store" });
        if (!detailRes.ok) {
          const body = (await detailRes.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error || `Property details failed (${detailRes.status})`);
        }
        const detail = (await detailRes.json()) as { property: PropertyDetail; photos: PhotoRow[] };
        if (cancelled) return;
        setProperty(detail.property);
        setPhotos(detail.photos || []);

        if (detail.property.service_tier) {
          const planRes = await fetch(
            `/api/admin/plan-details/${encodeURIComponent(detail.property.service_tier)}`,
            { cache: "no-store" },
          );
          if (planRes.ok && !cancelled) {
            const plan = (await planRes.json()) as { tagline: string; features: string[] };
            setPlanDetails({ tagline: plan.tagline || "", features: plan.features || [] });
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Property details failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [propertyId]);

  async function setPhotoStatus(photoId: string, status: string) {
    setPhotoSavingId(photoId);
    const res = await fetch("/api/admin/images", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: photoId, status }),
    });
    setPhotoSavingId(null);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error || `Status change failed (${res.status})`);
      return;
    }
    setPhotos((current) => current.map((photo) => photo.id === photoId ? { ...photo, status } : photo));
    onPhotoStatusChanged?.();
  }

  // PROMPT2 item 1: same explicit "Tenant signed lease" action as the
  // admin properties table, available here too since a detail modal is
  // the other natural place a sales/marketing/admin user would trigger
  // it from while reviewing a property.
  async function markTenantSignedLease() {
    if (!propertyId) return;
    setSigningLease(true);
    try {
      const res = await fetch(`/api/admin/properties/${propertyId}/tenant-signed-lease`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; signed_at?: string };
      if (!res.ok) {
        setError(body.error || `Tenant signed lease failed (${res.status})`);
        return;
      }
      setProperty((current) =>
        current ? { ...current, tenant_lease_signed_at: body.signed_at || new Date().toISOString() } : current,
      );
      onPhotoStatusChanged?.();
    } finally {
      setSigningLease(false);
    }
  }

  // Re-issues the lump-sum balance invoice for a property whose lease is
  // already signed (e.g. after the $0-invoice bug — see
  // BUGFIX_ZERO_DOLLAR_INVOICE_REPORT.md). The server voids an open
  // previous invoice and refuses if the previous one was really paid.
  async function regenerateBalanceInvoice() {
    if (!propertyId) return;
    if (!window.confirm("Regenerate and re-send the balance invoice for this property? Any open previous invoice will be voided in Stripe.")) return;
    setRegeneratingInvoice(true);
    setInvoiceMessage("");
    setError("");
    try {
      const res = await fetch(`/api/admin/properties/${propertyId}/balance-invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerate: true }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        no_balance?: boolean;
        message?: string;
        amount?: number;
        hosted_invoice_url?: string | null;
      };
      if (!res.ok) {
        setError(body.error || `Regenerate balance invoice failed (${res.status})`);
        return;
      }
      if (body.no_balance) {
        setInvoiceMessage(body.message || "No balance due — nothing to invoice.");
        return;
      }
      setInvoiceMessage(`New balance invoice sent ($${(body.amount ?? 0).toFixed(2)} CAD).`);
      setProperty((current) =>
        current
          ? { ...current, balance_invoice_url: body.hosted_invoice_url ?? current.balance_invoice_url, balance_invoice_status: "open" }
          : current,
      );
      onPhotoStatusChanged?.();
    } finally {
      setRegeneratingInvoice(false);
    }
  }

  // Re-runs the Premier Tier installment schedule for a property whose
  // webhook run failed (see migration v66). The server recalculates
  // from the upfront payment date, replaces only not-yet-invoiced rows
  // and refuses for any plan other than Premier Tier.
  async function rescheduleInstallments() {
    if (!propertyId) return;
    if (!window.confirm("Reschedule this property's Premier Tier installments? Installments not yet invoiced will be recalculated from the upfront payment date. Invoiced or paid installments are never changed.")) return;
    setReschedulingInstallments(true);
    setInstallmentsMessage("");
    setError("");
    try {
      const res = await fetch(`/api/admin/properties/${propertyId}/reschedule-installments`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        skipped?: string;
        created?: InstallmentRow[];
        kept?: InstallmentRow[];
        deletedCount?: number;
      };
      if (!res.ok) {
        setError(body.error || `Reschedule installments failed (${res.status})`);
        return;
      }
      const created = body.created ?? [];
      const kept = body.kept ?? [];
      if (body.skipped === "no_balance") {
        setInstallmentsMessage("No balance owed after the upfront — nothing to schedule.");
      } else {
        const amounts = created.map((row) => `#${row.sequence} ${formatCents(row.amount_cents)}`).join(", ");
        setInstallmentsMessage(
          `${created.length} installment${created.length === 1 ? "" : "s"} scheduled${amounts ? ` (${amounts})` : ""}` +
            (body.deletedCount ? ` · ${body.deletedCount} unbilled replaced` : "") +
            (kept.length ? ` · ${kept.length} already billed kept` : "") +
            ".",
        );
      }
      setProperty((current) =>
        current
          ? {
              ...current,
              installments: [...kept, ...created].sort((a, b) => a.sequence - b.sequence),
              installments_error: null,
            }
          : current,
      );
      onPhotoStatusChanged?.();
    } finally {
      setReschedulingInstallments(false);
    }
  }

  // Runs the daily process-installments cron logic now, for this
  // property only (Vercel crons never run on Preview deployments).
  // Server-side it invoices only rows already `scheduled` and due.
  async function processDueInstallments() {
    if (!propertyId) return;
    if (!window.confirm("Invoice this property's due Premier Tier installments now? A Stripe invoice will be created and emailed to the owner for each installment whose due date has passed. Future installments are not touched.")) return;
    setProcessingInstallments(true);
    setProcessMessage("");
    setProcessErrors([]);
    setError("");
    try {
      const res = await fetch(`/api/admin/properties/${propertyId}/process-installments`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        results?: { success: boolean; sequence?: number; amountCents?: number; error?: string; emailSent?: boolean }[];
        installments?: InstallmentRow[] | null;
      };
      if (!res.ok) {
        setError(body.error || `Process due installments failed (${res.status})`);
        return;
      }
      const results = body.results ?? [];
      const ok = results.filter((r) => r.success);
      const amounts = ok.map((r) => `#${r.sequence} ${formatCents(r.amountCents ?? 0)}`).join(", ");
      setProcessMessage(
        results.length === 0
          ? "No due installments to invoice."
          : `${ok.length} of ${results.length} installment${results.length === 1 ? "" : "s"} invoiced${amounts ? ` (${amounts})` : ""}.`,
      );
      setProcessErrors([
        ...results.filter((r) => !r.success).map((r) => `#${r.sequence}: ${r.error || "Unknown error"}`),
        ...ok
          .filter((r) => !r.emailSent)
          .map((r) => `#${r.sequence}: invoiced, but the app email to the owner was not sent (see server logs)`),
      ]);
      const installments = body.installments;
      if (installments) {
        setProperty((current) => (current ? { ...current, installments, installments_error: null } : current));
      }
      onPhotoStatusChanged?.();
    } finally {
      setProcessingInstallments(false);
    }
  }

  const hasDueInstallments =
    property != null &&
    property.uses_installments &&
    (property.installments ?? []).some((row) => row.status === "scheduled" && new Date(row.due_date).getTime() <= Date.now());

  return (
    <Dialog open={!!propertyId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-4xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{property?.title || property?.address || "Property Details"}</DialogTitle>
          <DialogDescription>
            {property ? [property.address, property.city, property.province].filter(Boolean).join(", ") : "Full property information"}
          </DialogDescription>
        </DialogHeader>
        {loading && <p className="text-sm text-muted-foreground">Loading property details...</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {property && (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <DetailSection title="Property">
                <KV k="Type" v={property.property_type || "—"} />
                <KV k="Bedrooms" v={String(property.bedrooms ?? "—")} />
                <KV k="Bathrooms" v={String(property.bathrooms ?? "—")} />
                <KV k="Area" v={property.area_sqft ? `${property.area_sqft} sqft` : "—"} />
                <KV k="Monthly rent" v={property.monthly_rent ? `$${Number(property.monthly_rent).toLocaleString()} CAD` : "—"} />
                <KV k="Tier" v={SERVICE_TIERS[property.service_tier || ""] || property.service_tier || "—"} />
                {property.elite_tier && <KV k="Elite tier" v={ELITE_TIERS[property.elite_tier] || property.elite_tier} />}
                <KV k="Available" v={property.is_available ? "Yes" : "No"} />
                {property.occupancy_status && <KV k="Occupancy" v={property.occupancy_status} />}
                {property.availability_date && <KV k="Available from" v={new Date(property.availability_date).toLocaleDateString("en-CA")} />}
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-muted-foreground min-w-[110px]">Tenant lease:</span>
                  {property.tenant_lease_signed_at ? (
                    <span className="text-xs font-medium text-green-700">
                      ✓ Signed {new Date(property.tenant_lease_signed_at).toLocaleDateString("en-CA")}
                    </span>
                  ) : (
                    <Button variant="outline" size="sm" disabled={signingLease} onClick={markTenantSignedLease}>
                      {signingLease ? "Marking…" : "Mark tenant signed lease"}
                    </Button>
                  )}
                </div>
                {property.balance_invoice_url && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground min-w-[110px]">Balance invoice:</span>
                    <a href={property.balance_invoice_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline inline-flex items-center gap-1">
                      {property.balance_invoice_status || "open"} <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
                {property.tenant_lease_signed_at && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground min-w-[110px]" />
                    <Button variant="outline" size="sm" disabled={regeneratingInvoice} onClick={regenerateBalanceInvoice}>
                      {regeneratingInvoice ? "Regenerating…" : "Resend / Regenerate balance invoice"}
                    </Button>
                    {invoiceMessage && <span className="text-xs text-green-700">{invoiceMessage}</span>}
                  </div>
                )}
                {property.uses_installments && (
                  <>
                    <div className="flex items-start gap-2 pt-1">
                      <span className="text-xs text-muted-foreground min-w-[110px]">Installments:</span>
                      {property.installments_error ? (
                        <span className="text-xs text-destructive">Could not load ({property.installments_error})</span>
                      ) : property.installments.length === 0 ? (
                        <span className="text-xs font-medium text-amber-700">None scheduled</span>
                      ) : (
                        <ul className="space-y-0.5 text-xs font-medium">
                          {property.installments.map((row) => (
                            <li key={row.sequence}>
                              #{row.sequence} {formatCents(row.amount_cents)} — due {new Date(row.due_date).toLocaleDateString("en-CA")} — {row.status}
                              {(row.status === "invoiced" || row.status === "paid") && row.hosted_invoice_url && (
                                <>
                                  {" "}
                                  <a href={row.hosted_invoice_url} target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">
                                    open <ExternalLink className="h-3 w-3" />
                                  </a>
                                </>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground min-w-[110px]" />
                      <Button variant="outline" size="sm" disabled={reschedulingInstallments} onClick={rescheduleInstallments}>
                        {reschedulingInstallments ? "Rescheduling…" : "Reschedule installments"}
                      </Button>
                      {installmentsMessage && <span className="text-xs text-green-700">{installmentsMessage}</span>}
                    </div>
                    {(hasDueInstallments || processMessage || processErrors.length > 0) && (
                      <div className="flex flex-wrap items-start gap-2">
                        <span className="text-xs text-muted-foreground min-w-[110px]" />
                        {hasDueInstallments && (
                          <Button variant="outline" size="sm" disabled={processingInstallments} onClick={processDueInstallments}>
                            {processingInstallments ? "Processing…" : "Process due installments"}
                          </Button>
                        )}
                        {processMessage && <span className="text-xs text-green-700">{processMessage}</span>}
                        {processErrors.length > 0 && (
                          <ul className="w-full space-y-0.5 text-xs text-destructive">
                            {processErrors.map((msg) => (
                              <li key={msg}>{msg}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </>
                )}
              </DetailSection>
              <DetailSection title="Owner">
                <KV k="Name" v={property.owner_name} />
                <KV k="Email" v={property.owner_email || "—"} />
                <KV k="Phone" v={property.owner_phone || "—"} />
                {property.postal_code && <KV k="Postal code" v={property.postal_code} />}
                {property.country && <KV k="Country" v={property.country} />}
              </DetailSection>
            </div>

            <DetailSection title="Zone Profile">
              <KV k="Parks nearby" v={yesNo(property.near_parks)} />
              <KV k="Churches nearby" v={yesNo(property.near_churches)} />
              <KV k="Bus stop nearby" v={yesNo(property.near_bus)} />
              <KV k="SkyTrain nearby" v={yesNo(property.near_skytrain)} />
              <KV k="SkyTrain lines" v={property.skytrain_lines.length ? property.skytrain_lines.join(", ") : "—"} />
              <KV k="Shopping mall nearby" v={yesNo(property.near_mall)} />
              <KV k="Social life nearby" v={property.social_life || "—"} />
              <KV k="Nearby supermarkets" v={property.nearby_supermarkets.length ? property.nearby_supermarkets.join(", ") : "—"} />
            </DetailSection>

            <DetailSection title="Features">
              <KV k="Amenities" v={property.amenities.length ? property.amenities.join(", ") : "—"} />
              <KV k="Common areas" v={property.common_areas.length ? property.common_areas.join(", ") : "—"} />
              <KV k="Pet friendly" v={yesNo(!!property.pet_friendly)} />
              <KV k="Smart home" v={yesNo(!!property.smart_home)} />
              <KV k="Dishwasher" v={yesNo(!!property.dishwasher)} />
            </DetailSection>

            {property.description && <DetailSection title="Description"><p className="text-sm whitespace-pre-wrap">{property.description}</p></DetailSection>}

            {property.service_tier && (
              <DetailSection title={`Plan: ${SERVICE_TIERS[property.service_tier] || property.service_tier}`}>
                {planDetails?.tagline && <p className="text-sm italic mb-2">{planDetails.tagline}</p>}
                {planDetails?.features?.length ? (
                  <ul className="space-y-1 text-xs">{planDetails.features.map((feature, index) => <li key={index}>• {feature}</li>)}</ul>
                ) : <p className="text-xs text-muted-foreground">No plan details available.</p>}
              </DetailSection>
            )}

            <DetailSection title={`Photos (${photos.length})`}>
              {photos.length === 0 ? (
                <p className="text-sm text-muted-foreground italic"><ImageIcon className="h-4 w-4 inline mr-1" />No photos uploaded for this property yet.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {photos.map((photo) => (
                    <div key={photo.id} className="rounded-md border overflow-hidden">
                      <div className="relative aspect-video bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photo.image_url} alt={photo.room_category || "Property photo"} className="object-cover w-full h-full" />
                        <Badge className="absolute top-2 left-2 text-xs">{photo.status}</Badge>
                      </div>
                      <div className="p-2 space-y-1">
                        <p className="text-xs text-muted-foreground">{photo.room_category || "—"}</p>
                        <div className="flex gap-1">
                          <Button variant={photo.status === "approved" ? "default" : "outline"} size="sm" onClick={() => setPhotoStatus(photo.id, "approved")} disabled={photoSavingId === photo.id} className="flex-1 text-xs">Approve</Button>
                          <Button variant={photo.status === "rejected" ? "default" : "outline"} size="sm" onClick={() => setPhotoStatus(photo.id, "rejected")} disabled={photoSavingId === photo.id} className="flex-1 text-xs">Reject</Button>
                          <a href={photo.image_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center rounded-md px-2" aria-label="Open image in new tab"><ExternalLink className="h-3.5 w-3.5" /></a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </DetailSection>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-md border bg-muted/30 p-3 space-y-2"><p className="text-sm font-semibold">{title}</p><div className="space-y-1">{children}</div></div>;
}

function KV({ k, v }: { k: string; v: string }) {
  return <div className="flex gap-2 text-xs"><span className="text-muted-foreground min-w-[110px]">{k}:</span><span className="font-medium">{v}</span></div>;
}

function formatCents(cents: number) {
  return `$${(cents / 100).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function yesNo(value: boolean) {
  return value ? "Yes" : "No";
}
