"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield } from "lucide-react";
import type { Profile } from "@/types/database";
import { logConsents } from "@/lib/consent-log";
import { ROLE_LABELS } from "@/lib/constants";

interface ConsentState {
  data_processing: boolean;
  image_usage: boolean;
  marketing: boolean;
  third_party: boolean;
}

const CONSENT_DESCRIPTIONS: Record<keyof ConsentState, { label: string; description: string }> = {
  data_processing: {
    label: "Data Processing",
    description: "Allow us to process your personal data for service delivery (required).",
  },
  image_usage: {
    label: "Image Usage",
    description: "Allow us to use uploaded property images in marketing materials.",
  },
  marketing: {
    label: "Marketing Communications",
    description: "Receive promotional emails and marketing updates.",
  },
  third_party: {
    label: "Third-Party Sharing",
    description: "Allow sharing relevant data with trusted partners.",
  },
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingConsent, setSavingConsent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [consents, setConsents] = useState<ConsentState>({
    data_processing: false,
    image_usage: false,
    marketing: false,
    third_party: false,
  });

  const supabase = createClient();

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      setProfile(data);

      // Load latest consents
      const { data: consentLogs } = await supabase
        .from("consent_logs")
        .select("consent_type, granted")
        .eq("user_id", user.id)
        .order("granted_at", { ascending: false });

      if (consentLogs) {
        const latest: Partial<ConsentState> = {};
        for (const log of consentLogs) {
          const key = log.consent_type as keyof ConsentState;
          if (!(key in latest)) {
            latest[key] = log.granted;
          }
        }
        setConsents((prev) => ({ ...prev, ...latest }));
      }

      setLoading(false);
    }
    loadProfile();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!profile) return;

    setSaving(true);
    setMessage(null);

    const formData = new FormData(e.currentTarget);

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: formData.get("full_name") as string,
        phone: (formData.get("phone") as string) || null,
      })
      .eq("id", profile.id);

    if (error) {
      setMessage("Failed to update profile. Please try again.");
    } else {
      setMessage("Profile updated successfully.");
      setProfile({
        ...profile,
        full_name: formData.get("full_name") as string,
        phone: (formData.get("phone") as string) || null,
      });
    }
    setSaving(false);
  }

  async function handleConsentChange(type: keyof ConsentState, granted: boolean) {
    if (!profile) return;

    setSavingConsent(true);
    setConsents((prev) => ({ ...prev, [type]: granted }));

    // Steve 5/6: route through logConsents so the toggle write also
    // captures ip_address + user_agent. /admin/legal renders the IP
    // column so Steve can audit who granted what and from where.
    await logConsents(profile.id, [{ type, granted }]).catch((err) =>
      console.error("Consent toggle log failed:", err),
    );

    setSavingConsent(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading profile...</p>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">My Profile</h1>
        <p className="text-muted-foreground">
          Manage your personal information and privacy settings
        </p>
      </div>

      {/* Personal Information */}
      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
          <CardDescription>Update your contact details</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {message && (
              <div
                className={`rounded-md p-3 text-sm ${
                  message.includes("Failed")
                    ? "bg-destructive/10 text-destructive"
                    : "bg-green-100 text-green-800"
                }`}
              >
                {message}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input id="email" value={profile.email} disabled />
              <p className="text-xs text-muted-foreground">
                Email cannot be changed
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Account type</Label>
              <div className="flex items-center gap-2">
                <Badge>{ROLE_LABELS[profile.role] || profile.role}</Badge>
                {profile.is_premium_tenant && (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                    Premium Tenant
                  </Badge>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="full_name">Full name</Label>
              <Input
                id="full_name"
                name="full_name"
                defaultValue={profile.full_name}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone number</Label>
              <Input
                id="phone"
                name="phone"
                defaultValue={profile.phone || ""}
                placeholder="+1 514 000 0000"
              />
            </div>
            <div className="text-sm text-muted-foreground">
              Member since:{" "}
              {new Date(profile.created_at).toLocaleDateString("en-CA", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </div>
          </CardContent>
          <div className="flex justify-end px-6 pb-6">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </Card>

      {/* Consent Management */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Privacy & Consent</CardTitle>
          </div>
          <CardDescription>
            Manage how we use your data. Changes take effect immediately.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {(Object.keys(CONSENT_DESCRIPTIONS) as (keyof ConsentState)[]).map((type) => {
            const desc = CONSENT_DESCRIPTIONS[type];
            return (
              <div key={type} className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <Label className="text-base">{desc.label}</Label>
                  <p className="text-sm text-muted-foreground">
                    {desc.description}
                  </p>
                </div>
                <Switch
                  checked={consents[type]}
                  onCheckedChange={(checked) => handleConsentChange(type, checked)}
                  disabled={savingConsent || type === "data_processing"}
                />
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground border-t pt-4">
            Data processing consent is required and cannot be revoked while using our services.
            For questions about your data rights under PIPEDA/GDPR, contact privacy@nexuma.ca
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
