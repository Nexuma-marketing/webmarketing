# Dashboard Architecture (one shared file per role vs. separate files — list every route file and which roles use it)

The `(dashboard)` directory is a Next.js route group: its name does not appear in the URL. Its shared layout, `src/app/(dashboard)/layout.tsx`, wraps both the customer `/dashboard/*` tree and the internal `/admin/*` tree. The layout requires only an authenticated user, reads the profile role, and renders the common header/sidebar; it does not restrict the child route by role (`src/app/(dashboard)/layout.tsx:8-50`).

There are two distinct top-level dashboard pages:

- `src/app/(dashboard)/dashboard/page.tsx` serves `/dashboard`. It is one shared customer-dashboard implementation with conditional sections for Property Owner (`propietario`, `propietario_preferido`), Investor Owner (`inversionista`), Tenant (`inquilino`, `inquilino_premium`), and Company/PYME (`pymes`) at lines 41-49 and 70-115. It has no admin/commercial/marketing route guard. Any authenticated role can technically request `/dashboard` because middleware protects it only from unauthenticated users (`src/middleware.ts:35-43`). The sidebar exposes the `/dashboard` link only to the six customer roles (`src/components/layout/sidebar.tsx:44-65`).
- `src/app/(dashboard)/admin/page.tsx` serves `/admin` for internal roles. It calls `requireInternal()` at lines 16-23; that helper accepts `admin`, `marketing`, `sales`, and `support` (`src/lib/admin-server.ts:4,39-57`). “Commercial” is represented in code by the `sales` role. This page retrieves platform-wide totals, including lead count and recent leads, through `supabaseAdmin`/service role at `src/app/(dashboard)/admin/page.tsx:32-67`. This is the actual internal metrics dashboard.

Authentication/routing is not completely symmetrical: normal password login sends only metadata role `admin` directly to `/admin`; every other role, including `marketing`, `sales`, and `support`, is initially sent to `/dashboard` (`src/app/(auth)/login/page.tsx:59-67`). Once rendered, the shared sidebar gives all four internal roles an `/admin` link (`src/components/layout/sidebar.tsx:97-123`). Middleware allows those four internal roles under `/admin/*` and redirects customer roles back to `/dashboard` (`src/middleware.ts:53-71`).

Customer route files and intended sidebar roles are:

- `src/app/(dashboard)/dashboard/page.tsx` → `/dashboard`: all six customer roles.
- `src/app/(dashboard)/dashboard/properties/page.tsx` and `src/app/(dashboard)/dashboard/properties/[id]/page.tsx` → property list/detail: Property Owner, Preferred Property Owner, Investor Owner.
- `src/app/(dashboard)/dashboard/images/page.tsx` → image gallery: Property Owner, Preferred Property Owner, Investor Owner.
- `src/app/(dashboard)/dashboard/services/page.tsx` → recommended services: all six customer roles, with owner/tenant/PYME sections selected inside the page.
- `src/app/(dashboard)/dashboard/payments/page.tsx` and `src/app/(dashboard)/dashboard/payments/success/page.tsx` → payment history/success: Property Owner, Preferred Property Owner, Investor Owner, and PYME.
- `src/app/(dashboard)/dashboard/profile/page.tsx` → customer profile: all six customer roles.

Those role assignments come from `src/components/layout/sidebar.tsx:44-95`. They control navigation visibility, not direct URL authorization; middleware applies only an authentication check to `/dashboard/*` (`src/middleware.ts:35-43`).

Internal route files are separate under `/admin/*`. Middleware admits `admin`, `marketing`, `sales`, and `support` to that route tree (`src/middleware.ts:59-71`), while sidebar visibility expresses the intended per-page role split (`src/components/layout/sidebar.tsx:97-240`):

- All four internal roles: `admin/page.tsx`, `admin/users/page.tsx`, `admin/leads/page.tsx`, `admin/matches/page.tsx`, `admin/businesses/page.tsx`, and `admin/export/page.tsx`.
- Admin and Sales: `admin/properties/page.tsx`, `admin/reports/page.tsx`, and `admin/reassign/page.tsx`.
- Admin and Marketing: `admin/services/page.tsx`, `admin/plans/page.tsx`, `admin/forms/page.tsx`, `admin/matching/page.tsx`, `admin/pricing/page.tsx`, `admin/content/page.tsx`, and `admin/articles/page.tsx`.
- Admin, Marketing, and Sales: `admin/images/page.tsx`.
- Admin only: `admin/payments/page.tsx`, `admin/team/page.tsx`, and `admin/legal/page.tsx`.
- `src/app/(dashboard)/admin/layout.tsx` wraps all `/admin/*` pages and displays role-status banners (`lines 22-107`); `src/app/(dashboard)/admin/team/layout.tsx` adds the team subsection layout.

The finer internal-role list above is sidebar/UI intent. The common `/admin/*` middleware check admits all four internal roles, so individual pages and APIs must enforce any narrower permissions themselves.

# Active Leads Card: Render Condition (exact role/permission check, or "none" if unconditional)

There is **no role or permission check** around the Active Leads card. Its only render condition is `leadCount > 0` at `src/app/(dashboard)/dashboard/page.tsx:230`. If true, the page renders the “Active Leads” card and displays `leadCount` at lines 231-240.

This condition is independent of `isOwnerRole`, `isTenantRole`, and `isPymesRole`. Therefore the source code does not intentionally hide the card from Property Owners specifically. It hides the card from anyone whose resolved count is zero, null, or unavailable.

The screenshot showing no card is consistent with the code: when the `leads` request is denied, Supabase returns no usable count; line 122 evaluates `lCount || 0`, making `leadCount` zero, and the `leadCount > 0` condition is false. The code does not inspect or display the query error.

# Active Leads Query: Execution Condition (does it run for every role or only some — this is the key finding)

The count query executes **unconditionally for every authenticated user who loads `/dashboard`**. It is at `src/app/(dashboard)/dashboard/page.tsx:117-122`, after the owner-, tenant-, and PYME-specific query blocks have closed and before rendering begins. There is no enclosing role check.

The comment says “Lead count (if user is an owner/pymes)” at line 117, but the implementation does not contain that condition. It performs `SELECT` with an exact head count on `leads`, filtered by `user_id = current user`, for Property Owners, Investor Owners, Tenants, PYMEs, and any internal role that reaches `/dashboard`.

This explains how a Property Owner can execute a forbidden `leads` query without seeing the card. The missing card does not show that the query was skipped; it shows only that `leadCount > 0` was not satisfied after the query result was reduced to zero.

Internal lead reporting is separately implemented at `/admin`: `src/app/(dashboard)/admin/page.tsx:42-67` unconditionally fetches platform-wide lead count, lead-status RPC totals, and recent leads after `requireInternal()`. Those reads use `supabaseAdmin`, not the customer session. The admin page renders the total-leads KPI later in that file. Thus internal lead metrics do not depend on the customer `/dashboard` query.

# Other Admin/Commercial/Marketing-Only Data Found in the Same File (if any)

No other admin/commercial/marketing-only database data was found in `src/app/(dashboard)/dashboard/page.tsx`.

Its other queries are customer-facing: own `profiles` (`lines 25-29`), own owner `properties` behind `isOwnerRole` (`lines 70-76`), tenant matches behind `isTenantRole` (`lines 95-100`), own latest `pymes_diagnosis` behind `isPymesRole` (`lines 102-115`), and active `services` for all customers (`lines 124-128`). The `leads` read is the only commercial/internal-domain query mixed into this customer page.

The separate `src/app/(dashboard)/admin/page.tsx` intentionally contains internal-only platform metrics for profiles, properties, leads, payments, role counts, lead-status counts, recent leads, recent users, and recent payments (`lines 32-67`). Those do not execute when a customer loads `/dashboard`.

# Recommended Next Step (describe only, do not implement — e.g. "move the leadCount query behind the same role check already used for the card" or "no change needed because X")

Remove both the customer-session `leads` count query and its Active Leads card from `src/app/(dashboard)/dashboard/page.tsx`, because internal lead metrics already live on the separately guarded `/admin` dashboard and the customer query crosses the intended commercial-data boundary. Removing both together avoids leaving either a forbidden query or unreachable customer UI.

Separately review the login redirect so `marketing`, `sales` (Commercial), and `support` go directly to `/admin` rather than briefly landing on `/dashboard`; this is a routing consistency issue identified by the architecture trace, not a change made in this diagnostic.
