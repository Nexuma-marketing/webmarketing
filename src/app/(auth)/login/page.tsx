"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // Detect Supabase recovery session via hash fragment or existing session
  useEffect(() => {
    const supabase = createClient();
    // Listen for PASSWORD_RECOVERY event (triggered when hash fragment contains recovery token)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        router.push("/reset-password");
      }
    });
    return () => subscription.unsubscribe();
  }, [router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError("Invalid email or password");
      setLoading(false);
      return;
    }

    // Check role for redirect
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.user_metadata?.role === "admin") {
      router.push("/admin");
    } else {
      router.push("/dashboard");
    }
    router.refresh();
  }

  async function handleForgotPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("reset_email") as string;

    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/confirm?next=/reset-password`,
    });

    if (resetError) {
      setError(resetError.message);
    } else {
      setResetSent(true);
    }
    setLoading(false);
  }

  if (resetMode) {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Reset Password</CardTitle>
          <CardDescription>
            Enter your email and we&apos;ll send you a link to reset your password.
          </CardDescription>
        </CardHeader>
        {resetSent ? (
          <CardContent className="space-y-4">
            <div className="rounded-md bg-green-50 p-3 text-sm text-green-700">
              Password reset link sent! Please check your email inbox.
            </div>
            <Button variant="outline" className="w-full" onClick={() => { setResetMode(false); setResetSent(false); }}>
              Back to Sign In
            </Button>
          </CardContent>
        ) : (
          <form onSubmit={handleForgotPassword}>
            <CardContent className="space-y-4">
              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="reset_email">Email address</Label>
                <Input
                  id="reset_email"
                  name="reset_email"
                  type="email"
                  placeholder="email@example.com"
                  required
                />
              </div>
              <Button type="submit" className="w-full mt-2" disabled={loading}>
                {loading ? "Sending..." : "Send Reset Link"}
              </Button>
            </CardContent>
            <CardFooter className="justify-center pt-3 pb-4">
              <button
                type="button"
                className="text-sm text-primary underline"
                onClick={() => { setResetMode(false); setError(null); }}
              >
                Back to Sign In
              </button>
            </CardFooter>
          </form>
        )}
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Sign In</CardTitle>
        <CardDescription>
          Log in to your account to manage your services
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
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => { setResetMode(true); setError(null); }}
              >
                Forgot password?
              </button>
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="Your password"
              required
            />
          </div>

          {/* Steve 5/7: button kept inside CardContent so it sits flush
              under the password field. CardFooter's default border-t +
              muted background + p-4 created a visible gap that
              disconnected the button from the form. */}
          <Button type="submit" className="w-full mt-2" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </Button>
        </CardContent>
        <CardFooter className="justify-center pt-3 pb-4">
          <p className="text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="text-primary underline">
              Sign up here
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
