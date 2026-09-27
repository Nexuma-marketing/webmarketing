# Link Destination (exact URL/route)

The link lives in the commercial notification email built in
`src/app/api/tenant-submit-email/route.ts:70`:

```html
… — review in <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://webmarketing-lyart.vercel.app"}/admin/matches">Tenant Matches</a>.
```

Exact target path: **`/admin/matches`** — the Admin/Sales "Tenant
Matches" review page (`src/app/(dashboard)/admin/matches/page.tsx`), the
one already registered in the sidebar for internal roles
(`src/components/layout/sidebar.tsx:178-179`, label "Tenant Matches",
`href: "/admin/matches"`).

There is no route in this codebase that would route this link to
`/dashboard` or any tenant-specific authenticated page — `/admin/matches`
is a hardcoded, literal string in the email template, not a computed or
per-tenant URL, and it never embeds the tenant's `id`, a token, or any
credential. It does not and cannot "log in as the tenant" or carry the
tenant's session — it is a plain link to a fixed admin route.

# Access Control Confirmed (authentication required or not)

Two independent, server-side layers gate this route — an unauthenticated
person (e.g. someone who merely intercepts the email) gets **zero** tenant
data at any point:

**1. `src/middleware.ts` (runs before any page code, matcher includes
`/admin/:path*`, lines 35-71):**
- No session at all → redirected to `/login` before the route renders
  (lines 40-44). No admin UI, no data, nothing rendered.
- Session exists but `profiles.role` is **not** one of
  `["admin", "marketing", "sales", "support"]` → redirected to
  `/dashboard` (lines 59-71), never reaching `/admin/matches` at all.
- Only a session whose own `profiles.role` is admin/marketing/sales/support
  is allowed to reach the `/admin/matches` route in the first place.

**2. `src/app/api/admin/tenant-matches/route.ts` (the data API the page
calls client-side, lines 25-38):**
- The page (`admin/matches/page.tsx:89`) fetches
  `GET /api/admin/tenant-matches` client-side, which independently
  re-checks `supabase.auth.getUser()` and the caller's `profiles.role`
  against the same `READ_ROLES = ["admin","marketing","sales","support"]`
  list, returning `401`/`403` otherwise. So even if someone found a way to
  render the page shell, the tenant data itself requires a second,
  independent server-side role check to load.

So: **no**, an unauthenticated person cannot access any tenant data via
this link, with or without clicking it — they're bounced to `/login`
before any admin/tenant content is ever sent to the browser.

# Is This The Tenant's Own Dashboard Or The Admin Review Page

Confirmed by reading the actual page component
(`src/app/(dashboard)/admin/matches/page.tsx`): this is unambiguously the
**Admin/Sales aggregate review page**, not a tenant's personal dashboard:

- Title: "Tenant Matches" (line 141), subtitle "Which tenants matched
  which available properties…" — plural, aggregate framing.
- Three summary stat cards: "With matches" / "No matches yet" / "Missing
  preferences" counted across **all** tenants (lines 134-166).
- A search box to filter across all tenants by name/email/phone
  (lines 168-176).
- A list (`TenantWithMatches[]`) of every tenant in the system with their
  matched properties, fetched in bulk from `/api/admin/tenant-matches`.

This is structurally nothing like the tenant-facing `/dashboard/services`
page (which shows one signed-in tenant's own matched properties). It is
the same page Sales already uses today via the sidebar "Tenant Matches"
link — the email link and the sidebar link go to the identical URL.

**Most likely explanation for what was observed:** the browser/account
used to click the link was not actually authenticated with an
admin/marketing/sales/support role at that moment. Per
`src/middleware.ts:59-71`, any authenticated user whose own `profiles.role`
is *not* one of those four is silently redirected to **`/dashboard`** —
their own dashboard, rendered according to their own role. If the account
open in that browser at the time (e.g. a stale login session, a shared
test account, or a commercial-team login whose `profiles.role` wasn't
actually set to `admin`/`sales`/etc. — a misconfiguration this exact
codebase has hit before, see `admin/layout.tsx`'s comment about "Alex test
account had role 'propietario'") happens to carry a tenant-type role,
`/dashboard` would render as a **Tenant dashboard for that logged-in
account** — which would look exactly like "the tenant's own dashboard
content" to someone who expected to land on the admin Tenant Matches page.
This is not the target tenant's account or session being exposed; it
would be the clicking user's *own* account showing its own role's
dashboard, because their session doesn't have an internal role. I cannot
confirm this from code alone — it depends on which account/browser
session was active at click time — but it fits every fact in the code
exactly, and no other path in this codebase reaches a tenant's dashboard
from this link.

# Security Assessment (real issue or expected behavior)

**No security/privacy vulnerability found in the routing, link, or access
control code.** Specifically:
- The link target is a fixed, non-parameterized, non-tokenized URL —
  there is no impersonation mechanism, no session-carrying query string,
  no way for it to "become" a tenant's session.
- Unauthenticated access is fully blocked at the middleware layer before
  any page or data renders.
- Non-internal authenticated roles are redirected away from `/admin/*`
  entirely, at the middleware layer.
- The underlying data API independently re-verifies the caller's role
  server-side before returning any tenant record.
- The destination page is the correct, purpose-built Admin/Sales
  aggregate review page — not a tenant's dashboard, and not reachable by
  a tenant's session.

**Recommended next step (verification, not a code fix):** confirm what
`profiles.role` value is set on the account/browser session that was used
when this link was clicked. If it is not exactly `admin`, `marketing`,
`sales`, or `support`, that's a role-configuration issue on that specific
account (fixable with a `profiles.role` update, same class of fix as prior
role-mismatch reports in this repo), not a code defect in the link, the
route, or the access-control logic itself. No code changes are recommended
from this review — this task was diagnostic only, per instructions, and no
files were modified.
