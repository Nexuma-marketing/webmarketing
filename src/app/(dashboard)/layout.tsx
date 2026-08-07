import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardHeader } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import type { UserRole } from "@/types/database";
import { buildBranding } from "@/lib/branding";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: profile }, { data: brandRows }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", user.id)
      .single(),
    supabase
      .from("site_content")
      .select("key, value")
      .eq("section", "branding"),
  ]);

  const metadataRole = user.user_metadata?.role as UserRole | undefined;
  const role = (profile?.role as UserRole | undefined) ?? metadataRole;

  if (!role) redirect("/");

  const userName = profile?.full_name || user.email || "User";
  const branding = buildBranding(brandRows);

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader
        userName={userName}
        role={role}
        brandName={branding.name}
      />
      <div className="flex flex-1">
        <Sidebar role={role} userName={userName} />
        <main className="flex-1 overflow-x-hidden p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
