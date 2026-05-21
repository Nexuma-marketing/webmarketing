import { createClient } from "@/lib/supabase/server";
import { AdminConfirmBanner } from "@/components/admin/admin-confirm-banner";

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
  const isInternalRole = role === "admin" || role === "marketing" || role === "sales" || role === "support";

  return (
    <div className="space-y-4">
      {isInternalRole && !isAdmin && (
        <div className="rounded-lg border border-blue-300 bg-blue-50 p-3 text-sm text-blue-900">
          <p>
            Signed in as <code className="rounded bg-blue-100 px-1.5 py-0.5 font-mono">{role}</code>
            {email && (
              <> ({<code className="rounded bg-blue-100 px-1.5 py-0.5 font-mono">{email}</code>})</>
            )}
            . You have limited access — only the sections your role permits will accept saves. See the Internal Team page for the full permission matrix.
          </p>
        </div>
      )}
      {isAdmin ? (
        // Steve 5/15: positive confirmation banner. The May 15 client
        // message said: "nunca me dijiste o confirmaste con que correo
        // probar o cual email quedo de administrador" — they had been
        // testing without knowing whether their account was admin. The
        // negative warning below only fires for non-admins, so admins
        // saw nothing and remained uncertain. The banner now auto-
        // hides after 12s and remembers via sessionStorage that the
        // user has been confirmed this session, so it does not push
        // the section header down on every admin page navigation.
        <AdminConfirmBanner email={email} />
      ) : (
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
