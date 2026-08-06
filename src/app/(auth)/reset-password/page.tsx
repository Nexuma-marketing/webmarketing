"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function ResetPasswordPageWrapper() {
  return (
    <Suspense>
      <ResetPasswordPage />
    </Suspense>
  );
}

function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [ready, setReady] = useState(false);
  const [crossBrowserError, setCrossBrowserError] = useState(false);

  useEffect(() => {
    const code = searchParams.get("code");
    const supabase = createClient();

    if (code) {
      // Try PKCE code exchange (works only in same browser)
      supabase.auth.exchangeCodeForSession(code).then(({ error: exchangeError }) => {
        if (exchangeError) {
          // PKCE failed — likely opened in a different browser.
          // Show a helpful message instead of just erroring out.
          setCrossBrowserError(true);
        } else {
          setReady(true);
          window.history.replaceState({}, "", "/reset-password");
        }
      });
    } else {
      // No code param — check if user already has a valid session
      // (e.g. came from /auth/confirm token_hash flow)
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          setReady(true);
        } else {
          router.push("/login");
        }
      });
    }
  }, [searchParams, router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirm_password") as string;

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      setError(updateError.message);
    } else {
      setSuccess(true);
    }
    setLoading(false);
  }

  // Cross-browser error: user opened the link in a different browser
  if (crossBrowserError) {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Link Opened in Different Browser</CardTitle>
          <CardDescription>
            For security, you must open the reset link in the same browser
            where you requested it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-700">
            It looks like you opened this link from a different browser or
            email client. Please copy the link and paste it into the browser
            where you clicked &ldquo;Forgot password&rdquo;, or request a new
            reset link below.
          </div>
        </CardContent>
        <CardFooter>
          <Button className="w-full" onClick={() => router.push("/login")}>
            Request a New Reset Link
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (!ready) {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Verifying...</CardTitle>
          <CardDescription>Please wait while we verify your reset link.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (success) {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Password Updated</CardTitle>
          <CardDescription>
            Your password has been successfully changed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md bg-green-50 p-3 text-sm text-green-700">
            You can now sign in with your new password.
          </div>
        </CardContent>
        <CardFooter>
          <Button className="w-full" onClick={() => router.push("/login")}>
            Go to Sign In
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Set New Password</CardTitle>
        <CardDescription>
          Enter your new password below.
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
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="Minimum 6 characters"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm_password">Confirm new password</Label>
            <Input
              id="confirm_password"
              name="confirm_password"
              type="password"
              placeholder="Repeat your new password"
              required
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Updating..." : "Update Password"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
