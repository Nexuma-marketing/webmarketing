# Exact Link Construction Code (verbatim quote)

There are **two different links**, in **two different emails**, sent by
the same route (`src/app/api/tenant-submit-email/route.ts`). Quoting both
verbatim, because distinguishing them is the crux of this investigation.

**Commercial email** (`src/app/api/tenant-submit-email/route.ts:70`, sent
to `recipientForCommercial`, the internal team):

```
    <strong>&#9888; This tenant has ${matchCount} matched propert${matchCount === 1 ? "y" : "ies"}</strong>${topMatchAddress ? ` — top match: ${topMatchAddress}` : ""} — review in <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://webmarketing-lyart.vercel.app"}/admin/matches">Tenant Matches</a>.
```

Literal href, character for character: **`${NEXT_PUBLIC_APP_URL}/admin/matches`**
(or the hardcoded fallback `https://webmarketing-lyart.vercel.app/admin/matches`
if that env var is unset). Anchor text is **"Tenant Matches"** — note: the
exact phrase **"Review Tenant Matches" does not appear anywhere in this
codebase**; it only appears in the surrounding sentence as "review in
Tenant Matches." I flag this because the task names that phrase as the
button text, and I want to be precise about what is and isn't literally
in the code.

**Tenant's own confirmation email** (`src/app/api/tenant-submit-email/route.ts:118`,
sent to `clientEmail` — the tenant's own address):

```
      <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://webmarketing-lyart.vercel.app"}/dashboard" style="display:inline-block;background:#0B38D9;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600">See my matched properties</a>
```

Literal href: **`${NEXT_PUBLIC_APP_URL}/dashboard`**. Anchor text: **"See
my matched properties"**.

I re-searched the entire `src/` tree for every other occurrence of
`/admin/matches`, `matched propert`, and `Tenant Matches` (case-insensitive)
to rule out a second, buggier copy of this email elsewhere (e.g. a cron job
or a separate template). There is exactly one commercial-email code path
and exactly one tenant-confirmation-email code path, both in this one file,
both quoted above in full. No other file constructs a link related to
tenant matches.

# Why /dashboard Was Reached Instead Of /admin/matches (root cause, not speculation)

The commercial email's link, as quoted above, is literally
`/admin/matches` in the source code today — **it is not a wrong-URL bug**.
I re-verified this by direct file read immediately before writing this
report; the string has not changed since the prior review.

Given that, and given the screenshot's confirmed facts (URL bar =
`/dashboard`, name shown = "Inquilino test", role shown = "Tenant"), there
are exactly two code-supported explanations. I can prove both are
*possible* from the code; I cannot determine from code alone which one
*actually happened* in the reproduction, because that depends on two facts
only the tester's browser holds: **which of the two links was clicked**,
and **which account's session cookie was active in that browser at that
moment**.

**Hypothesis A — the tenant's own confirmation-email link was clicked, not
the commercial one.**
`/dashboard` is not a bug destination for anything — it is the *correct,
by-design* target of the tenant's own confirmation email (line 118 above),
whose whole purpose is to send the tenant back to their own dashboard
("See my matched properties"). If the reproduction actually opened this
second email instead of the commercial one (plausible: both are sent from
the same route at the same moment, both are about "matches," and — per
`src/lib/email.ts:4` / `tenant-submit-email/route.ts:6` —
`COMMERCIAL_AREA_EMAIL` defaults to `alexsanabria33@hotmail.com` when
unset, i.e. the operator's own personal inbox, which raises the chance of
multiple test emails about the same event sitting side by side in one
inbox during QA), clicking it landing on `/dashboard` as "Inquilino test /
Tenant Dashboard" is **exactly the intended, correct behavior for that
link** — not a security failure.

**Hypothesis B — the commercial link was clicked, but the browser's active
session was the "Inquilino test" tenant account, not an internal account.**
`src/middleware.ts:59-71` gates every `/admin/*` request:

```ts
if (user && request.nextUrl.pathname.startsWith("/admin")) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const INTERNAL_ROLES = ["admin", "marketing", "sales", "support"];
  if (!profile?.role || !INTERNAL_ROLES.includes(profile.role)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }
}
```

If the session active in that browser belonged to a `profiles.role` of
`inquilino` (i.e. the "Inquilino test" account), clicking
`/admin/matches` would be silently 302-redirected by this exact code to
`/dashboard` — and `/dashboard` would then render **that same session's
own profile**, which is why "Inquilino test" / "Tenant Dashboard" is what
appeared. This is also not a bug in the sense of exposing someone else's
data — see next section — but it is a real UX gap: the redirect is silent
(no "access denied" messaging), so it's easy to read "I clicked an admin
link and ended up on a Tenant Dashboard" as "the link is broken / leaking
data," when what actually happened is "my own account isn't an admin
account, so I was bounced to my own dashboard."

Both explanations are fully consistent with every fact in the screenshot.
I am not able to pick between them from static code alone — that requires
knowing which literal email was opened and which account's cookies were
in that browser, which I don't have visibility into as part of a code
review.

# Does This Link Expose Tenant Data To An Unauthenticated Clicker (critical, answer with certainty)

**No — with certainty, from the code, this is not possible. A fully
logged-out browser cannot reach `/dashboard` or `/admin/matches` and see
any tenant data, under any circumstance.**

Proof, `src/middleware.ts:35-44`:

```ts
const isProtected =
  request.nextUrl.pathname.startsWith("/dashboard") ||
  request.nextUrl.pathname.startsWith("/admin") ||
  request.nextUrl.pathname === "/forms/propietario/add-property";

if (!user && isProtected) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}
```

This middleware is registered against both paths via its `matcher`
(`src/middleware.ts:78`: `["/dashboard/:path*", "/admin/:path*", ...]`),
so it runs unconditionally before either `/dashboard/page.tsx` or
`/admin/matches/page.tsx` executes. `user` here comes from
`supabase.auth.getUser()` (line 30), which — per Supabase's own SSR
client design — re-validates the session against the Supabase Auth server
on every call; it is not merely reading a client-supplied cookie value and
trusting it. A request with no valid session cookie, or an invalid/expired
one, gets `user === null` and is redirected to `/login` before any page
code, any database query, or any tenant data is touched.

There is no token, session ID, magic-link parameter, or any other
credential embedded in either link — I quoted both hrefs verbatim above;
neither contains a query string, hash, or any parameter at all beyond the
bare path. Neither link can "carry" or "grant" a session. Whatever session
renders after clicking is always and only the session already present in
that browser's own cookies at the time of the click — which itself
requires a prior, independent, real login.

Additionally, even in the redirect-to-`/dashboard` scenario (Hypothesis
B above), the profile rendered is fetched via
`.from("profiles").select("*").eq("id", user.id).single()`
(`src/app/(dashboard)/dashboard/page.tsx:54-58`) — scoped strictly to
`user.id` from that same server-validated session. There is no code path
by which `/dashboard` renders any `id` other than the currently
authenticated caller's own. The "Inquilino test" name and "Tenant" role
shown in the screenshot are proof that account's own session was active
in that browser — not evidence of a different tenant's data leaking to an
outside viewer.

# Corrected Security Assessment

Reconciling directly against the screenshot, as instructed:

- **The screenshot is accurate and reproducible** — I do not dispute the
  observation. `/dashboard` showing "Welcome, Inquilino test" / "Tenant
  Dashboard" is real, expected output of
  `src/app/(dashboard)/dashboard/page.tsx:248-252`
  (`Welcome, {profile.full_name}` / `{ROLE_LABELS[profile.role]} Dashboard`)
  for whichever session was active in that browser.
- **What it does not prove**: that the commercial email's link is
  misconfigured, that an unauthenticated person can reach it, or that a
  session/token is being passed through the link. All three are
  disproven by the code cited above with certainty.
- **What it does prove**: either (a) the link actually clicked was the
  tenant's own "See my matched properties" link, which is designed to go
  to `/dashboard` — working as intended, not a defect; or (b) the
  commercial "Tenant Matches" link was clicked while the browser's own
  session belonged to a non-internal-role account, and middleware
  correctly and silently redirected away from `/admin/*` to that
  account's own `/dashboard` — a real usability/clarity gap (no "access
  denied" signal), but not a data-exposure defect, since only that
  account's own data was ever shown.
- I am retracting the unqualified "no issue at all" framing of the prior
  report only insofar as it didn't anticipate this specific reproduction
  or call out the silent-redirect UX gap. The core finding stands and is
  now proven more rigorously: **there is no path in this code by which an
  unauthenticated user, or an authenticated user without permission, can
  view a different tenant's private data via this link.**

# Recommended Fix (describe only, do not implement)

To close the ambiguity and the UX gap identified above (not because a data
exposure was found):

1. **Disambiguate which link was actually clicked.** Check the exact
   email opened in the reproduction — subject line differs
   (`New ${tenantType} Registration — ...` for commercial vs.
   `Your ${tenantType} registration is confirmed — Nexuma` for the
   tenant's own) — and check what `profiles.role` is on file for whichever
   account was logged into that browser at the time. This closes the loop
   on Hypothesis A vs. B definitively; right now it cannot be determined
   from code alone.
2. **Set `COMMERCIAL_AREA_EMAIL` to a dedicated commercial mailbox** in
   every environment where testing happens, rather than relying on the
   `alexsanabria33@hotmail.com` fallback in
   `src/lib/email.ts:4` / `tenant-submit-email/route.ts:6`. This reduces
   the chance of the commercial notification and a customer-facing email
   landing in the same inbox during QA and being confused for one another
   (part of Hypothesis A).
3. **Make the `/admin/*` → `/dashboard` redirect in `src/middleware.ts:59-71`
   explicit instead of silent** — e.g. append a query parameter such as
   `/dashboard?denied=admin_only` (or a small flash/toast on arrival)
   so a non-internal-role user who follows an admin link sees a clear
   "You don't have access to that page" signal instead of silently
   landing on their own dashboard with no explanation. This directly
   addresses Hypothesis B's confusion without changing any access-control
   logic — the redirect destination and the underlying permission check
   would stay exactly as they are today.
4. No change is recommended to the commercial email's link itself
   (`/admin/matches`) — it is correct as written — nor to the middleware's
   authorization logic, nor to `/api/admin/tenant-matches`'s role check.
   None of the investigated code exposes tenant data to an unauthenticated
   or unauthorized viewer.
