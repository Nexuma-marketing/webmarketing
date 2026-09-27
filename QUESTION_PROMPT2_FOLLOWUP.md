# Follow-up Questions Before Implementation

Two blockers surfaced during codebase exploration (Phase 1 research, read-only)
before I could finalize an implementation plan for the 9-item payment-flow
brief. No code has been written or modified. This file documents both
questions in full so they can be answered async.

---

## Question 1 — What is the "Commercial dashboard"?

### Blocks
**Item 1** ("Build a new, explicit 'Tenant signed lease' action, scoped per
property, available to BOTH the Commercial dashboard and the Admin
dashboard").

### What I found
I ran an exhaustive search across the repo for anything resembling a
"Commercial" dashboard/route/role:

- `find -iname "*commercial*"` and `grep -ri commercial src/app` → no
  matches for any UI feature. Every "commercial" hit in the codebase is
  prose text (CASL consent wording, or comments referring to "the commercial
  team" as a group of staff — not a UI section).
- No `/commercial` route exists anywhere under `src/app`.
- Roles enumerated in `ROLE_LABELS` (`src/lib/constants.ts`) and
  `INTERNAL_ROLES` (`src/middleware.ts`, line 66):
  `admin`, `marketing`, `sales`, `support` (internal/staff roles) plus
  `propietario`, `propietario_preferido`, `inversionista`, `inquilino`,
  `inquilino_premium`, `pymes` (customer-facing roles). There is no
  `comercial`/`commercial` role.
- `src/middleware.ts` line 59-67 gates every route under `/admin/*` to
  `INTERNAL_ROLES = ["admin", "marketing", "sales", "support"]` — i.e.
  **marketing and sales staff already log into the same `/admin` dashboard**
  as `admin` users; there is no separate surface for them today.
- The existing property-level `is_available` toggle (the thing item 1 is
  replacing/decoupling) lives in `src/app/(dashboard)/admin/properties/page.tsx`,
  wired through `PATCH /api/admin/properties`, which is role-gated to
  `PROPERTY_WRITE_ROLES = ["admin", "marketing", "sales"]`
  (`src/app/api/admin/properties/route.ts` line 21) — so sales/marketing
  ("commercial" staff) already perform property actions from this exact
  admin page today.
- `src/components/admin/property-detail-modal.tsx` currently shows
  `is_available` read-only inside a per-property detail modal, with no
  action button — this is the closest existing "per-property action" UI
  surface in `/admin`.
- On the customer side, `src/app/(dashboard)/dashboard/properties/[id]/page.tsx`
  is the property OWNER's own detail page (357 lines), which already has an
  "Action buttons" section (line 116 comment) with at least one button —
  this is a plausible second surface if "Commercial dashboard" actually
  meant something owner/commercial-facing rather than staff-facing, though
  that reading seems less likely given the brief's phrasing ("scoped per
  property, available to BOTH the Commercial dashboard and the Admin
  dashboard" reads as two staff-facing surfaces).

### Why this matters
Item 1's spec explicitly names two distinct surfaces ("BOTH X and Y"). If
"Commercial dashboard" and "Admin dashboard" are actually the same physical
page (since sales/marketing/admin all already share `/admin`), then there's
nothing extra to build beyond adding the action to `/admin/properties` (or
the property-detail modal) once, role-gated to all four internal roles. But
if a genuinely separate "Commercial" surface is intended — even a stripped-down
one showing only properties relevant to sales/marketing without full admin
tooling — that's new routing/access-control work I'd be guessing at without
confirmation.

### Options considered

**Option A — It IS the existing `/admin` dashboard (recommended)**
- Read: "Commercial dashboard" is just how you refer to the admin dashboard
  when sales/marketing staff (the "commercial team") are using it, since
  that's literally who's logged in there day-to-day doing this kind of work.
- Implementation: add the "Tenant signed lease" action to
  `admin/properties/page.tsx` (table row and/or the property-detail modal),
  gated to `admin`/`marketing`/`sales` (mirroring `PROPERTY_WRITE_ROLES`).
  No new route, no new role, no new access-control code.
- Pros: Zero new surface to build/secure/maintain; reuses the exact RLS-safe
  `supabaseAdmin` write pattern already proven in the `is_available` PATCH
  handler; matches how sales/marketing already work with properties today.
- Cons: If you actually meant something narrower/different for sales
  (e.g. hiding admin-only fields, financial data, or other properties'
  details from sales reps), this doesn't address that — it's the full admin
  view for everyone in those three roles, same as today.

**Option B — Build a new, separate Commercial section**
- Read: There should be a distinct, purpose-built surface (e.g.
  `/admin/commercial` or a top-level `/commercial`) for sales/marketing,
  separate from the full admin properties table/tooling.
- Implementation: new route + page component, new nav entry, decide what
  subset of property/admin data it shows vs. hides, decide whether `admin`
  role also gets access to it or only uses the existing full admin view.
- Pros: Gives sales/marketing a purpose-built, less cluttered surface if
  that's actually wanted long-term.
- Cons: Meaningfully larger scope for a 1-line ask in the brief; introduces
  new routing/access-control surface area with no existing pattern to base
  it on; risks building the wrong thing without more detail on what should
  differ from the admin view.

---

## Question 2 — How to complete Item 0's live Stripe verification

### Blocks
**Item 0** ("verify — via Stripe's test Dashboard ... or add temporary
diagnostic logging ... whether it has ever actually successfully created
and sent a Stripe Invoice. Report what you find.")

### What I found
Full code-level trace of `generateBalanceInvoice` (`src/lib/balance-invoice.ts`,
223 lines) and its only two call sites is complete (see summary below), but
I have no way to independently confirm real-world Stripe behavior:

- No `.env.local` or any `.env*` file exists in this working directory
  (`ls -la .env*` returns nothing) — so I have no `STRIPE_SECRET_KEY`
  (test or live) available to query the Stripe API myself.
- The repo has no `.env.example` either; per `HANDOVER_MANUAL.md` §6, the
  required Stripe vars (`STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`,
  `STRIPE_WEBHOOK_SECRET`) live only in your deployed Vercel environment, not
  checked into the repo.
- `src/app/api/health/route.ts` (lines 95-123) exposes an existing
  `secretKeyMode` / `publishableKeyMode` / `keysMatch` check by inspecting
  key prefixes (`sk_live_`/`sk_test_`) — useful for confirming which Stripe
  mode is live without needing raw key values, but it doesn't list Invoice
  objects.

**Code-level findings so far (static analysis, not yet confirmed against real
Stripe data):**
- `generateBalanceInvoice` is called from exactly two places:
  1. `POST /api/admin/properties/[id]/balance-invoice` — a manual re-trigger
     endpoint (admin/marketing/sales only).
  2. `PATCH /api/admin/properties` — fires automatically when `is_available`
     flips to **`false`** (comment at line ~216: "toggling Available → false
     is Alex's signal that the tenant signed the lease").
- In the `PATCH` handler, the call is wrapped in try/catch and is
  **best-effort**: if it throws, the `is_available` write still succeeds and
  the error is swallowed into the JSON response body
  (`{ success: true, balance_invoice: balanceInvoice }`) — nothing renders
  that result anywhere in the admin UI today, so a real failure there would
  be silent to the admin user and invisible unless someone reads server logs.
  This alone could fully explain "no customer has ever received one of its
  emails" even if the function itself is written correctly.
- `generateBalanceInvoice` has its own idempotency guard: if
  `properties.balance_invoice_id` is already set and status isn't
  `paid`/`voided`, it returns `already_issued: true` and does nothing — so
  if it was ever triggered once and errored out after partially writing that
  column, retriggering would silently no-op instead of retrying.
- `STRIPE_GST_RATE_ID` (used for invoice tax) is read with a `|| null`
  fallback and the code comment itself warns "must match the Stripe key
  mode" — a test-mode tax rate ID used against a live key (or vice versa)
  would throw inside `stripe.invoices.create`, which is a plausible failure
  mode if this env var was copied between environments incorrectly.
- No other file in the codebase touches `stripe.invoices.*` — this is the
  only Invoice-creation code path that exists.

What I cannot determine from code alone: whether any real Stripe Invoice
object has ever actually been created in test mode, whether `is_available`
has ever actually been toggled to `false` by an admin/sales/marketing user in
practice (vs. only ever tested via mocked/staging data), and whether any
past attempt threw partway through (e.g. after the Stripe API calls but
before the Supabase persist step, or vice versa).

### Options considered

**Option A — Code audit + add diagnostic logging (recommended)**
- I add `[webhook-diag]`-style `console.log`/`console.error` bracketing
  around each Stripe API call and Supabase write inside
  `generateBalanceInvoice`, and around the `invoice.payment_succeeded` /
  `invoice.payment_failed` webhook branches that key off
  `metadata.kind === "plan_balance"` — matching the existing pattern already
  used in `checkout.session.completed`.
- I report the static-analysis findings above as the item-0 writeup, flag
  the silent-swallow risk in the `PATCH` handler as a likely root cause, and
  give you exact steps to confirm in Stripe's test Dashboard yourself
  (search Invoices for `metadata.kind:plan_balance`, or grep Vercel logs for
  `[webhook-diag]` after you toggle a test property's `is_available` to
  `false` once this ships).
- Pros: No credentials need to leave your control; keeps the verification
  fully within your existing "you handle deploys/testing" workflow (matches
  your instruction that you'll review everything and handle
  migrations/commits/deployment yourself); the logging is useful
  permanently, not just for this one-time check.
- Cons: I can't hand you a definitive "yes it fired N invoices" answer today
  — you'd need to either check the Stripe test Dashboard yourself right now,
  or wait until this ships with logging and trigger it once to get a
  first-hand confirmation.

**Option B — You provide a Stripe test secret key**
- You paste an `sk_test_...` key into a local, gitignored `.env.local` (or
  tell me it's already there and I re-check), and I write a one-off,
  read-only script (`stripe.invoices.list({ limit: 100 })`, optionally
  filtered by metadata) to directly query test-mode Stripe and report real
  historical data before writing anything else.
- Pros: Gives a definitive, immediate answer to "has this ever actually
  fired" without waiting for a future redeploy/trigger.
- Cons: Requires sharing a live-usable (albeit test-mode) secret key into
  this session/environment; test-mode keys can still create real Stripe
  objects (Customers, Invoices) and hit the same account, so it's not fully
  inert even though it's not live-mode money.

---

Please answer both above (e.g. "1A, 2A" or similar) and I'll fold the
answers into the implementation plan.
