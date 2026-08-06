import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const INTERNAL_ROLES = ["admin", "marketing", "sales", "support"] as const;

/**
 * Server-side helper: verifies the current user is an admin.
 * Redirects to /dashboard if not. Call from server components / route handlers only.
 */
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    redirect("/dashboard");
  }

  return { user, supabase };
}

/**
 * Steve 6/11 (6-2.md #54): less-strict variant that lets any of the
 * four internal team roles in. Used for read-only dashboards where
 * Sales / Marketing / Support need to see the same KPIs the admin
 * sees (Alex's complaint that "el dashboard de marketing y el de
 * comercial no trae las metricas"). Mutation routes still call
 * requireAdmin() to keep writes locked down.
 */
export async function requireInternal() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !INTERNAL_ROLES.includes(profile.role as (typeof INTERNAL_ROLES)[number])) {
    redirect("/dashboard");
  }

  return { user, supabase, role: profile.role as string };
}
