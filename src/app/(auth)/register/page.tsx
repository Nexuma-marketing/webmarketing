"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { UserRole } from "@/types/database";
import { logConsents } from "@/lib/consent-log";

const ROLE_LABELS: Record<string, string> = {
  propietario: "Property Owner / Investor",
  inquilino: "Tenant",
  pymes: "Business Owner (SMB)",
};

// Steve 6/2 (6-2.md #20): Next.js 16 requires useSearchParams() to be
// wrapped in a <Suspense> boundary on any page that may be prerendered,
// otherwise the build fails with "useSearchParams should be wrapped in
// a suspense boundary at page /register". The inner content component
// reads the param; the exported page wraps it in Suspense.
function RegisterPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Steve 5/27 Milestone 4 (#4b): when landing page hero buttons link
  // to /register?role=propietario or ?role=pymes, pre-select the user
  // type so the visitor doesn't have to pick it again.
  const preselectedRole = searchParams.get("role") || "";
  // Steve 6/8 (6-2.md #31): phone is now REQUIRED for propietario and
  // pymes roles — the commercial team uses these contact numbers to
  // follow up on high-value leads. We track the currently-selected role
  // in state so the Phone label / required attribute / placeholder
  // update live as the visitor changes the dropdown.
  const [selectedRole, setSelectedRole] = useState<string>(preselectedRole);
  const phoneRequired = selectedRole === "propietario" || selectedRole === "pymes";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Steve 5/7: PIPA/PIPEDA + Terms acceptance was never logged to
  // consent_logs at signup, so /admin/legal Logs only ever showed
  // people who later submitted a profile form. Add explicit checkboxes
  // here and route them through logConsents (with IP + UA) so admin
  // sees a record for every account ever created.
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;
    const fullName = formData.get("fullName") as string;
    const phone = formData.get("phone") as string;
    const role = formData.get("role") as UserRole;

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    if (!role) {
      setError("Please select a user type");
      setLoading(false);
      return;
    }

    // Steve 6/8 (6-2.md #31): phone is required for the two roles the
    // commercial team needs to call back (property owners + business
    // owners). Tenants stay optional.
    if ((role === "propietario" || role === "pymes") && (!phone || phone.trim().length < 7)) {
      setError("Phone number is required for property owners and business owners (so our team can follow up).");
      setLoading(false);
      return;
    }

    if (!acceptTerms || !acceptPrivacy) {
      setError("You must accept the Terms of Service and Privacy Policy to continue.");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role,
          phone,
        },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    if (!signUpData.session?.user) {
      setError("Your account was created, but an authenticated session was not established. Please try again.");
      setLoading(false);
      return;
    }

    const {
      data: { user: authenticatedUser },
      error: authenticatedUserError,
    } = await supabase.auth.getUser();

    if (authenticatedUserError || !authenticatedUser) {
      setError("Your account was created, but your session could not be verified. Please try again.");
      setLoading(false);
      return;
    }

    if (authenticatedUser.user_metadata?.role !== role) {
      setError("Your account was created, but your selected profile type could not be saved. Please try again.");
      setLoading(false);
      return;
    }

    // Log Terms + Privacy acceptance with IP + UA. Non-blocking — if
    // the user already exists or the insert fails, we still proceed to
    // the form so onboarding is not stuck behind logging.
    const userId = authenticatedUser.id;
    if (userId) {
      logConsents(userId, [
        { type: "terms_of_service", granted: true },
        { type: "privacy_policy", granted: true },
      ]).catch((err) => console.error("Signup consent log failed:", err));
    }

    // Redirect to the corresponding form based on role
    const formRoutes: Record<string, string> = {
      propietario: "/forms/propietario",
      inquilino: "/forms/inquilino",
      pymes: "/forms/pymes",
    };
    router.push(formRoutes[role] || "/dashboard");
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Create Account</CardTitle>
        <CardDescription>
          Sign up to access our marketing services
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              name="fullName"
              placeholder="John Smith"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="email@example.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">
              Phone{phoneRequired ? <span className="ml-1 text-red-500">*</span> : <span className="ml-1 text-muted-foreground">(optional)</span>}
            </Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              placeholder="+1 514 000 0000"
              required={phoneRequired}
            />
            {phoneRequired && (
              <p className="text-xs text-muted-foreground">
                Required for property owners and business owners — our commercial team uses this to follow up with you.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">User type</Label>
            <Select
              name="role"
              required
              value={selectedRole || undefined}
              onValueChange={(v) => v && setSelectedRole(v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select your profile" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ROLE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="Minimum 6 characters"
              minLength={6}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              placeholder="Repeat your password"
              minLength={6}
              required
            />
          </div>

          {/* Steve 5/7: Terms / Privacy acceptance, logged with IP + UA
              into consent_logs. Layout split into checkbox row + small
              Read link below so the inline <Link> can no longer wrap
              awkwardly between text fragments. */}
          <div className="space-y-3 rounded-md border p-3 bg-muted/30">
            <div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="accept_terms"
                  checked={acceptTerms}
                  onCheckedChange={(c) => setAcceptTerms(c === true)}
                />
                <Label htmlFor="accept_terms" className="text-sm font-normal">
                  I accept the Terms of Service
                  <span className="ml-1 text-xs text-destructive">*</span>
                </Label>
              </div>
              <Link
                href="/legal/terms"
                target="_blank"
                className="ml-6 mt-0.5 inline-block text-xs text-primary hover:underline"
              >
                Read full document →
              </Link>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="accept_privacy"
                  checked={acceptPrivacy}
                  onCheckedChange={(c) => setAcceptPrivacy(c === true)}
                />
                <Label htmlFor="accept_privacy" className="text-sm font-normal">
                  I accept the Privacy Policy (PIPA / PIPEDA)
                  <span className="ml-1 text-xs text-destructive">*</span>
                </Label>
              </div>
              <Link
                href="/legal/privacy"
                target="_blank"
                className="ml-6 mt-0.5 inline-block text-xs text-primary hover:underline"
              >
                Read full document →
              </Link>
            </div>

            <p className="text-xs text-muted-foreground border-t pt-2">
              <span className="text-destructive">*</span> Required to create your account.
            </p>
          </div>

          {/* Steve 5/7: Button kept inside CardContent so it sits flush
              under the consent box. The default CardFooter has its own
              border-t + muted background + 16px padding which created a
              visible "second area" gap that disconnected the button
              from the action it's confirming. */}
          <Button type="submit" className="w-full mt-2" disabled={loading}>
            {loading ? "Creating account..." : "Create Account"}
          </Button>
        </CardContent>
        <CardFooter className="justify-center pt-3 pb-4">
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-primary underline">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterPageContent />
    </Suspense>
  );
}
