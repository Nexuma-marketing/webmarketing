import { createClient } from "@/lib/supabase/server";

// Steve 5/13: defensive guard for the admin section. The May 8-13 docx
// thread repeatedly reported "admin edits aren't reflected on the
// website" — root cause was an Alex test account that had role
// 'propietario' (not 'admin'), so Postgres RLS silently denied every
// admin UPDATE and the UI showed "Saved successfully". Sidebar already
// hides admin links from non-admins, but a non-admin who navigates
// directly to /admin/* (typed URL, bookmark) still rendered the page
// and could click Save into the void.
//
// This layout fetches the caller's role server-side. If it isn't
// 'admin', we render a loud red banner above the page so the operator
// knows in advance that any write will fail. We deliberately do NOT
// block the page — Tony still wants to be able to inspect admin UI
// while logged in as a non-admin role for QA — but the warning is
// impossible to miss.

export const dynamic = "force-dynamic";

export default async function AdminSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let role: string | null = null;
  let email: string | null = null;
  if (user) {
    email = user.email ?? null;
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    role = (profile?.role as string | null) ?? null;
  }

  const isAdmin = role === "admin";

  return (
    <div className="space-y-4">
      {!isAdmin && (
        <div
          role="alert"
          className="rounded-lg border-2 border-red-500 bg-red-50 p-4 text-sm text-red-900"
        >
          <p className="font-bold text-base mb-1">⚠ You are not signed in as an admin.</p>
          <p>
            Your current role is{" "}
            <code className="rounded bg-red-100 px-1.5 py-0.5 font-mono">
              {role ?? "(no profile)"}
            </code>
            {email && (
              <>
                {" "}
                ({<code className="rounded bg-red-100 px-1.5 py-0.5 font-mono">{email}</code>})
              </>
            )}
            . Postgres RLS will silently deny every save you attempt — buttons will
            appear to succeed but the database will not change.
          </p>
          <p className="mt-2">
            Fix: have a developer run, in Supabase SQL Editor:{" "}
            <code className="rounded bg-red-100 px-1.5 py-0.5 font-mono whitespace-nowrap">
              UPDATE profiles SET role = &apos;admin&apos; WHERE id = (SELECT id FROM auth.users WHERE email = &apos;
              {email ?? "your@email.com"}&apos;);
            </code>{" "}
            then log out and log back in to refresh your session token.
          </p>
        </div>
      )}
      {children}
    </div>
  );
}
