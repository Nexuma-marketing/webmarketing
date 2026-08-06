"use client";

import { useEffect, useState } from "react";

// Steve 5/15: client asked the "✓ Signed in as admin" confirmation
// banner to appear briefly when arriving at /admin/* and then go
// away after 10–15 seconds so the section header stops getting
// pushed down on every page. We render the banner with state +
// a 12s timer, and remember in sessionStorage that the user has
// already been confirmed this session — once dismissed it does
// not reappear on subsequent admin page navigations.
//
// The negative ("you are NOT admin") banner is handled in the
// parent server component and is intentionally NOT auto-hidden,
// since it surfaces a real bug the user needs to act on.

interface Props {
  email: string | null;
}

const SHOWN_FLAG_PREFIX = "admin-confirm-shown:";
const AUTO_HIDE_MS = 12_000;
const FADE_MS = 600;

export function AdminConfirmBanner({ email }: Props) {
  // Start in a "checking storage" state so SSR + first client paint
  // don't briefly flash the banner before sessionStorage is consulted.
  const [phase, setPhase] = useState<"checking" | "visible" | "fading" | "hidden">(
    "checking",
  );

  useEffect(() => {
    const key = SHOWN_FLAG_PREFIX + (email ?? "anon");
    const alreadyShown = sessionStorage.getItem(key) === "1";
    if (alreadyShown) {
      setPhase("hidden");
      return;
    }

    setPhase("visible");
    const fadeTimer = setTimeout(() => setPhase("fading"), AUTO_HIDE_MS);
    const hideTimer = setTimeout(() => {
      setPhase("hidden");
      sessionStorage.setItem(key, "1");
    }, AUTO_HIDE_MS + FADE_MS);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, [email]);

  if (phase === "checking" || phase === "hidden") return null;

  return (
    <div
      role="status"
      className={`flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800 transition-opacity duration-500 ${
        phase === "fading" ? "opacity-0" : "opacity-100"
      }`}
    >
      <span className="font-semibold">✓ Signed in as admin</span>
      {email && (
        <code className="rounded bg-green-100 px-1.5 py-0.5 font-mono text-[11px]">
          {email}
        </code>
      )}
      <span className="text-green-700/70">
        — saves to this section will write to the database.
      </span>
    </div>
  );
}
