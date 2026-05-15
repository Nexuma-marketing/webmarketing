"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { DataTable } from "@/components/dashboard/data-table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Download, Scale, Shield } from "lucide-react";
import { generateCSV, formatDateTime } from "@/lib/admin";
import type { ColumnDef } from "@tanstack/react-table";

interface ConsentRow {
  id: string;
  user_name: string;
  user_email: string;
  consent_type: string;
  granted: boolean;
  granted_at: string;
  ip_address: string | null;
  user_agent: string | null;
}

interface LegalDoc {
  id: string;
  type: string;
  content: string;
  version: string;
  updated_at: string;
}

// Steve 5/6: filter options used to be a hardcoded short list
// (data_processing / image_usage / marketing / third_party) so the
// dropdown surfaced choices that did not exist in the data — selecting
// "image_usage" returned 0 results when no propietario had toggled it,
// and the inquilino-flow types (screening, references, communications,
// truthfulness) were missing from the dropdown entirely. We now keep
// the labels for pretty-printing only and derive the dropdown from the
// actual consent_logs rows present in the table.
const CONSENT_TYPE_LABELS: Record<string, string> = {
  data_processing: "Data Processing",
  image_usage: "Image Usage",
  marketing: "Marketing",
  third_party: "Third-Party",
  screening: "Screening",
  references: "References",
  communications: "Communications (CASL)",
  truthfulness: "Truthfulness",
  legal_representation: "Legal Representation",
  liability_limitation: "Liability Limitation",
  electronic_signature: "Electronic Signature",
  privacy_policy: "Privacy Policy",
  terms_of_service: "Terms of Service",
  cookie_policy: "Cookie Policy",
};

function prettyConsentLabel(value: string): string {
  // Try the raw key first, then the prefix-stripped key (handles
  // legal_documents rows like "consent_legal_representation" by
  // resolving to the "legal_representation" entry above).
  if (CONSENT_TYPE_LABELS[value]) return CONSENT_TYPE_LABELS[value];
  const stripped = value.replace(/^consent_/, "");
  if (CONSENT_TYPE_LABELS[stripped]) return CONSENT_TYPE_LABELS[stripped];
  return stripped
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function AdminLegalPage() {
  const [consents, setConsents] = useState<ConsentRow[]>([]);
  const [legalDocs, setLegalDocs] = useState<LegalDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDoc, setEditDoc] = useState<LegalDoc | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const supabase = createClient();

  const load = useCallback(async () => {
    // Steve 5/15: the embedded join syntax
    //   profiles:user_id(full_name, email)
    // returned null for every row in the Consent Logs table — the User
    // column showed "Unknown" for all entries. The PostgREST alias
    // disambiguation hint clashed with the auto-detected FK + RLS
    // recursion on the profiles "Admins can view all" policy. Switch
    // to a deterministic two-query manual join: fetch consent_logs
    // with user_id, then look up all unique user_ids against profiles
    // in a second query, and merge in JS. Reliable regardless of
    // PostgREST version, FK constraint naming, or policy quirks.
    const [{ data: consentData }, { data: docData }] = await Promise.all([
      supabase
        .from("consent_logs")
        .select("id, user_id, consent_type, granted, granted_at, ip_address, user_agent")
        .order("granted_at", { ascending: false })
        .limit(500),
      supabase
        .from("legal_documents")
        .select("*")
        .order("type"),
    ]);

    const rows =
      (consentData as Array<{
        id: string;
        user_id: string | null;
        consent_type: string;
        granted: boolean;
        granted_at: string;
        ip_address: string | null;
        user_agent: string | null;
      }> | null) ?? [];

    const userIds = Array.from(
      new Set(rows.map((r) => r.user_id).filter((v): v is string => !!v)),
    );

    let profileMap: Record<string, { full_name: string | null; email: string | null }> = {};
    if (userIds.length > 0) {
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);
      profileMap = Object.fromEntries(
        ((profilesData as Array<{ id: string; full_name: string | null; email: string | null }> | null) ?? []).map(
          (p) => [p.id, { full_name: p.full_name, email: p.email }],
        ),
      );
    }

    const mappedConsents: ConsentRow[] = rows.map((c) => {
      const prof = c.user_id ? profileMap[c.user_id] : undefined;
      return {
        id: c.id,
        user_name: prof?.full_name || "Unknown",
        user_email: prof?.email || "",
        consent_type: c.consent_type,
        granted: c.granted,
        granted_at: c.granted_at,
        ip_address: c.ip_address,
        user_agent: c.user_agent,
      };
    });

    setConsents(mappedConsents);
    setLegalDocs((docData as LegalDoc[]) || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  function handleExportConsents() {
    if (consents.length === 0) return;

    const csv = generateCSV(
      consents as unknown as Record<string, unknown>[],
      [
        { key: "user_name", label: "User Name" },
        { key: "user_email", label: "Email" },
        { key: "consent_type", label: "Consent Type" },
        { key: "granted", label: "Granted" },
        { key: "granted_at", label: "Date" },
        { key: "ip_address", label: "IP Address" },
        { key: "user_agent", label: "User Agent" },
      ]
    );

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "consent_logs_export.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function saveLegalDoc() {
    if (!editDoc) return;
    setSaving(true);
    setSaveMessage(null);

    // Steve 5/11: previous flow trusted Supabase to surface RLS denials
    // as an `error`. Postgres RLS-blocked UPDATEs return no error and
    // affect 0 rows, so admin saw "Saved successfully" while the DB
    // never changed — explaining "admin edits aren't reflected on the
    // website". We now (1) request the row back from the upsert,
    // (2) compare what the DB returned to what we sent, and (3) raise a
    // loud red error if they don't match.
    const expectedContent = editDoc.content;
    const expectedVersion = editDoc.version;
    const { data: returned, error } = await supabase
      .from("legal_documents")
      .upsert(
        {
          id: editDoc.id,
          type: editDoc.type,
          content: expectedContent,
          version: expectedVersion,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      )
      .select("id, content, version, updated_at");

    setSaving(false);
    if (error) {
      setSaveMessage(`Error: ${error.message}`);
      return;
    }

    // Empty `returned` array = RLS silently blocked the write.
    if (!returned || returned.length === 0) {
      setSaveMessage(
        "Error: Save reported success but the database did not change. " +
        "Most likely cause: your account is missing the admin role. " +
        "Run in Supabase: SELECT role FROM profiles WHERE id = auth.uid(); " +
        "— this must return 'admin'.",
      );
      return;
    }

    // Defensive: the row came back but the content does not match what
    // we sent. Should never happen unless a trigger rewrote the row.
    const row = returned[0] as { content: string; version: string };
    if (row.content !== expectedContent || row.version !== expectedVersion) {
      setSaveMessage(
        "Error: Save returned a row but its content does not match what you submitted. " +
        "A database trigger may be overwriting your changes. Contact the developer.",
      );
      return;
    }

    setEditDoc(null);
    setSaveMessage(`Saved & verified — DB updated at ${new Date().toLocaleTimeString()}.`);
    setTimeout(() => setSaveMessage(null), 6000);
    load();
  }

  const consentColumns: ColumnDef<ConsentRow>[] = [
    {
      accessorKey: "user_name",
      header: "User",
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.getValue("user_name")}</p>
          <p className="text-xs text-muted-foreground">{row.original.user_email}</p>
        </div>
      ),
    },
    {
      accessorKey: "consent_type",
      header: "Type",
      cell: ({ row }) => (
        <Badge variant="outline">
          {prettyConsentLabel(row.getValue("consent_type") as string)}
        </Badge>
      ),
      filterFn: "equals",
    },
    {
      accessorKey: "granted",
      header: "Status",
      cell: ({ row }) =>
        row.getValue("granted") ? (
          <Badge className="bg-green-50 text-green-700">Granted</Badge>
        ) : (
          <Badge className="bg-red-50 text-red-700">Revoked</Badge>
        ),
    },
    {
      accessorKey: "granted_at",
      header: "Date",
      cell: ({ row }) => formatDateTime(row.getValue("granted_at")),
    },
    {
      accessorKey: "ip_address",
      header: "IP",
      cell: ({ row }) => (
        <span className="font-mono text-xs">
          {(row.getValue("ip_address") as string | null) || "—"}
        </span>
      ),
    },
  ];

  // Steve 5/6: derive filter options from the actual consent_logs in
  // the DB so the dropdown never offers a value that returns 0 rows.
  const consentTypeOptions = Array.from(
    new Set(consents.map((c) => c.consent_type)),
  )
    .filter(Boolean)
    .sort()
    .map((value) => ({ value, label: prettyConsentLabel(value) }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">Legal & Compliance</h1>
        <p className="text-muted-foreground">
          GDPR/PIPEDA compliance tracking, consent logs, and legal documents
        </p>
      </div>

      {/* Consent Logs */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Consent Logs
            </CardTitle>
            <CardDescription>User consent activity</CardDescription>
          </div>
          <Button variant="outline" onClick={handleExportConsents} disabled={consents.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={consentColumns}
            data={consents}
            loading={loading}
            searchKey="user_name"
            searchPlaceholder="Search by user..."
            filters={[
              {
                key: "consent_type",
                label: "Type",
                options: consentTypeOptions,
              },
            ]}
            pageSize={10}
          />
        </CardContent>
      </Card>

      {/* Legal Documents */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5" />
            Legal Documents
          </CardTitle>
          <CardDescription>
            Privacy policy, terms of service, and other legal texts
          </CardDescription>
        </CardHeader>
        <CardContent>
          {legalDocs.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground text-center">
              No legal documents configured yet. Create a &quot;legal_documents&quot; table to manage them.
            </p>
          ) : (
            <div className="space-y-4">
              {legalDocs.map((doc) => (
                <Card key={doc.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base capitalize">
                        {prettyConsentLabel(doc.type)}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">v{doc.version}</Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditDoc({ ...doc })}
                        >
                          Edit
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {doc.content}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Steve 5/7: prior toast was 4s at bottom-right and easy to miss
          while the eye was still on the modal. Move to top-center, bump
          font size, and add a checkmark so the save confirmation is
          unmistakable. Auto-dismiss bumped to 6s in saveLegalDoc(). */}
      {saveMessage && (
        <div
          className={`fixed left-1/2 top-6 z-50 -translate-x-1/2 rounded-lg border px-6 py-4 text-base font-medium shadow-2xl ${
            saveMessage.startsWith("Error")
              ? "bg-red-50 border-red-200 text-red-800"
              : "bg-green-50 border-green-300 text-green-800"
          }`}
          role="status"
          aria-live="polite"
        >
          <span className="mr-2">
            {saveMessage.startsWith("Error") ? "⚠" : "✓"}
          </span>
          {saveMessage}
        </div>
      )}

      <Dialog open={!!editDoc} onOpenChange={(o) => !o && setEditDoc(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="capitalize">
              Editing: {editDoc ? prettyConsentLabel(editDoc.type) : ""}
            </DialogTitle>
            <DialogDescription>
              Update the document content and bump the version when meaningful changes are made.
            </DialogDescription>
          </DialogHeader>
          {editDoc && (
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Version</Label>
                <Input
                  className="w-32"
                  value={editDoc.version}
                  onChange={(e) => setEditDoc({ ...editDoc, version: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Content (HTML or plain text)</Label>
                <Textarea
                  value={editDoc.content}
                  onChange={(e) => setEditDoc({ ...editDoc, content: e.target.value })}
                  rows={16}
                  className="font-mono text-sm"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDoc(null)}>
              Cancel
            </Button>
            <Button onClick={saveLegalDoc} disabled={saving}>
              {saving ? "Saving..." : "Save Document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
