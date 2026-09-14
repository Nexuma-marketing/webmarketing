import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";

// Steve — "Schedule a Consultation" fix, originally built for PYME, then
// generalized (not duplicated) so Tenant — and any future role — can
// reuse the exact same page/flow. This reuses the public Contact Us
// form's exact submit target (/api/contact) and email logic (see
// src/app/page.tsx#contact for the anonymous version), adapted for an
// already-authenticated customer — pre-filled from their profile but
// left editable, no "I am a..." role picker (the hidden role field now
// sends the authenticated user's actual `profiles.role` instead of a
// hardcoded "pymes"), and a pre-filled, editable subject. Entry points
// today: PYME's plan card (`?plan=<name>` — unchanged behavior/output,
// since a PYME user's real role is still "pymes") and Tenant's "Schedule
// a Free Consultation" button on /dashboard/services.
export default async function ScheduleConsultationPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; contact?: string }>;
}) {
  const params = await searchParams;
  // Steve — consultation subject-newline fix: `plan` comes from the URL
  // query string, which is not trusted input. A `%0A`/`%0D` in it (from a
  // hand-edited URL, browser history, or a copy-pasted link) would land
  // as a literal newline in the pre-filled subject below, and Resend
  // rejects any subject containing "\n" outright — which fails the send
  // for BOTH recipients, not just a display glitch. Collapse any
  // line-break characters before they ever reach the subject.
  const sanitizeForSubject = (value: string) => value.replace(/[\r\n]+/g, " ").trim();
  const planName = params.plan ? sanitizeForSubject(params.plan) : null;
  const contactStatus = params.contact;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone, role, is_premium_tenant")
    .eq("id", user.id)
    .single();

  const isTenantRole =
    profile?.role === "inquilino" || profile?.role === "inquilino_premium";

  // Steve — Tenant consultation-subject fix: when the tenant reached this
  // page without a `?plan=` (the PYME-only entry point), reference their
  // top matched property when one exists — reusing the exact same
  // matching logic already used on /dashboard/services and in the
  // commercial-email match-status line, so this subject line never
  // claims a match that doesn't actually appear there. Falls back to a
  // plain "Tenant"/"Premium Tenant" subject when there's no match yet.
  let tenantMatchAddress: string | null = null;
  if (isTenantRole && !planName) {
    const { matchPropertiesForTenant } = await import("@/lib/profiling");
    const matches = await matchPropertiesForTenant(user.id);
    tenantMatchAddress = (matches[0]?.address as string | undefined) || null;
  }

  const defaultSubject = sanitizeForSubject(
    planName
      ? `Consultation request — ${planName} plan`
      : isTenantRole
        ? tenantMatchAddress
          ? `Consultation request — interested in ${tenantMatchAddress}`
          : `Consultation request — ${profile?.is_premium_tenant ? "Premium Tenant" : "Tenant"}`
        : "Consultation request",
  );

  return (
    <div className="mx-auto max-w-xl space-y-6 p-4 py-8">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Schedule a Consultation</h1>
        <p className="text-sm text-muted-foreground">
          Our team will contact you to review your profile, answer questions,
          and finalize the best plan for your needs. No obligation.
        </p>
      </div>

      {contactStatus === "success" && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
          <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-green-600" />
          <p className="font-medium text-green-800">Message sent successfully!</p>
          <p className="mt-1 text-sm text-green-600">
            Our team will get back to you within 24 hours. A confirmation
            email has been sent to your inbox.
          </p>
        </div>
      )}
      {contactStatus === "email_pending" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-center">
          <p className="font-medium text-amber-800">Message recorded</p>
          <p className="mt-1 text-sm text-amber-700">
            We received your message and saved it. Our email confirmation
            is delayed — our team will still get back to you within 24
            hours.
          </p>
        </div>
      )}
      {contactStatus === "error" && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
          <p className="font-medium text-red-800">Something went wrong</p>
          <p className="mt-1 text-sm text-red-600">
            Please try again or email us directly.
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your details</CardTitle>
          <CardDescription>
            Pre-filled from your account — feel free to change anything before sending.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action="/api/contact" method="POST" className="space-y-4">
            {/* Already known: this entry point is only reachable from an
                already-authenticated dashboard, so we skip the "I am a..."
                picker shown on the public form and send the signed-in
                user's actual role directly (was hardcoded to "pymes"
                before this page was generalized for other roles — a PYME
                user's real role is still literally "pymes", so their
                behavior here is unchanged). */}
            <input type="hidden" name="role" value={profile?.role || ""} />
            <input type="hidden" name="redirect_to" value="/dashboard/consultation" />

            <div className="space-y-2">
              <Label htmlFor="consult_name">Full name</Label>
              <Input
                id="consult_name"
                name="name"
                type="text"
                required
                defaultValue={profile?.full_name || ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="consult_phone">Phone</Label>
              <Input
                id="consult_phone"
                name="phone"
                type="tel"
                required
                defaultValue={profile?.phone || ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="consult_email">Email</Label>
              <Input
                id="consult_email"
                name="email"
                type="email"
                required
                defaultValue={user.email || ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="consult_subject">Subject</Label>
              <textarea
                id="consult_subject"
                name="subject"
                required
                rows={4}
                defaultValue={defaultSubject}
                className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
            <Button type="submit" className="w-full">
              Send Message
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
