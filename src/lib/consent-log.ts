"use client";

import { createClient } from "@/lib/supabase/client";

// Steve 5/4 #7: every checkbox the user ticks on a registration form
// must produce a consent_logs row. The DB CHECK accepts both bare
// types ("data_processing") and prefixed types ("consent_data_processing")
// after migration v18 — we stick to the bare form here so the
// /admin/legal page groups records consistently.
const PREFIX_RE = /^consent_/;

export interface ConsentEntry {
  type: string;
  granted: boolean;
}

/**
 * Insert a batch of consent_logs rows for the authenticated user.
 * No-ops silently on errors so a missing log never blocks form submit.
 * Captures the user's IP via a best-effort fetch to a CIDR-safe
 * resolver and the navigator.userAgent string when available.
 */
export async function logConsents(userId: string, entries: ConsentEntry[]) {
  if (!userId || entries.length === 0) return;

  const supabase = createClient();
  const userAgent =
    typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null;

  // Best-effort IP fetch. ipify returns a JSON { ip: "..." } and is
  // CORS-friendly. Failures fall back to null — never block submit.
  let ip: string | null = null;
  try {
    const res = await fetch("https://api.ipify.org?format=json", {
      cache: "no-store",
    });
    if (res.ok) {
      const j = await res.json();
      if (typeof j.ip === "string" && j.ip.length < 64) ip = j.ip;
    }
  } catch {
    /* ignore */
  }

  const rows = entries.map((e) => ({
    user_id: userId,
    consent_type: e.type.replace(PREFIX_RE, ""),
    granted: e.granted,
    ip_address: ip,
    user_agent: userAgent,
  }));

  await supabase.from("consent_logs").insert(rows);
}
