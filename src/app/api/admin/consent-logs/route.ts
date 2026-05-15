import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Steve 5/15: client-side approach to render consent logs with user
// names kept returning "Unknown" for every row. We tried:
//   1. PostgREST embedded join `profiles:user_id(...)` — broken.
//   2. Two-query manual join via the anon client — somehow still no
//      profiles request fired in the browser network panel.
// Whichever quirk was at play (RLS recursion on profiles + the
// consent_logs select, anon-key column visibility, etc.), the most
// reliable answer is to do this server-side with the service role
// key, which bypasses RLS entirely. Then there is exactly one source
// of truth and exactly one HTTP request from the browser.

export const dynamic = "force-dynamic";

export async function GET() {
  // 1. Authenticate the request: the caller must be an admin user.
  //    We do NOT trust the request to identify themselves — we read
  //    the cookie session via the anon client + RLS-aware profile
  //    lookup before we ever touch the service role client.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (callerProfile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 2. Fetch consent_logs + profiles via service role to bypass RLS.
  const { data: consentRows, error: consentErr } = await supabaseAdmin
    .from("consent_logs")
    .select(
      "id, user_id, consent_type, granted, granted_at, ip_address, user_agent",
    )
    .order("granted_at", { ascending: false })
    .limit(500);
  if (consentErr) {
    return NextResponse.json(
      { error: `consent_logs fetch failed: ${consentErr.message}` },
      { status: 500 },
    );
  }

  const rows = consentRows ?? [];
  const userIds = Array.from(
    new Set(
      rows
        .map((r) => r.user_id as string | null)
        .filter((v): v is string => !!v),
    ),
  );

  let profileMap: Record<string, { full_name: string | null; email: string | null }> = {};
  if (userIds.length > 0) {
    const { data: profilesData, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds);
    if (profileErr) {
      return NextResponse.json(
        { error: `profiles fetch failed: ${profileErr.message}` },
        { status: 500 },
      );
    }
    profileMap = Object.fromEntries(
      (profilesData ?? []).map((p) => [
        p.id as string,
        { full_name: p.full_name as string | null, email: p.email as string | null },
      ]),
    );
  }

  const result = rows.map((c) => {
    const prof = c.user_id ? profileMap[c.user_id as string] : undefined;
    return {
      id: c.id as string,
      user_id: (c.user_id as string | null) ?? null,
      user_name: prof?.full_name || "Unknown",
      user_email: prof?.email || "",
      consent_type: c.consent_type as string,
      granted: c.granted as boolean,
      granted_at: c.granted_at as string,
      ip_address: (c.ip_address as string | null) ?? null,
      user_agent: (c.user_agent as string | null) ?? null,
    };
  });

  return NextResponse.json({
    consents: result,
    debug: {
      total: rows.length,
      uniqueUserIds: userIds.length,
      profilesFetched: Object.keys(profileMap).length,
    },
  });
}
