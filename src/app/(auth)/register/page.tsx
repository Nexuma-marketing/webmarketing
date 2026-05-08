"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

export default function RegisterPage() {
  const router = useRouter();
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

    // Log Terms + Privacy acceptance with IP + UA. Non-blocking — if
    // the user already exists or the insert fails, we still proceed to
    // the form so onboarding is not stuck behind logging.
    const userId = signUpData.user?.id;
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
            <Label htmlFor="phone">Phone (optional)</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              placeholder="+1 514 000 0000"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">User type</Label>
            <Select name="role" required>
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

          {/* Steve 5/7: explicit Terms / Privacy acceptance, logged with
              IP + UA into consent_logs so /admin/legal can audit. */}
          <div className="space-y-3 rounded-md border p-3 bg-muted/30">
            <div className="flex items-start gap-2">
              <Checkbox
                id="accept_terms"
                checked={acceptTerms}
                onCheckedChange={(c) => setAcceptTerms(c === true)}
              />
              <Label htmlFor="accept_terms" className="text-sm font-normal leading-relaxed">
                I accept the{" "}
                <Link href="/legal/terms" target="_blank" className="text-primary underline">
                  Terms of Service
                </Link>
                . (Required)
              </Label>
            </div>
            <div className="flex items-start gap-2">
              <Checkbox
                id="accept_privacy"
                checked={acceptPrivacy}
                onCheckedChange={(c) => setAcceptPrivacy(c === true)}
              />
              <Label htmlFor="accept_privacy" className="text-sm font-normal leading-relaxed">
                I have read and accept the{" "}
                <Link href="/legal/privacy" target="_blank" className="text-primary underline">
                  Privacy Policy (PIPA / PIPEDA)
                </Link>
                . (Required)
              </Label>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating account..." : "Create Account"}
          </Button>
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
