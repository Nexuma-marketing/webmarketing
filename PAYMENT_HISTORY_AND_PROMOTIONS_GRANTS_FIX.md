# Payment History empty + Admin Promotion create failure — root cause & fix

Migration created for manual review: **`supabase/migration_v61_payments_promotions_grants.sql`**
(not applied — no migration was run against any database as part of this investigation).

---

## BUG 1 — Payment History shows "No payments yet" after a successful payment

### Root cause

`src/app/(dashboard)/dashboard/payments/page.tsx` reads the `payments` table with the
**cookie-context** ("authenticated" role) Supabase client:

```ts
const supabase = await createClient(); // authenticated, RLS-scoped
const { data: payments, error: paymentsError } = await supabase
  .from("payments")
  .select(`*, services:service_id (name), pymes_plans:pymes_plan_id (name)`)
  .eq("user_id", user.id)
  .order("created_at", { ascending: false });

if (paymentsError) {
  console.error("[payments-page] Failed to load payments", paymentsError);
}
```

This relies on the existing RLS policy `"Users can view own payments"`
(`auth.uid() = user_id`, added in `migration_v8_stripe.sql`). RLS alone is **not** sufficient —
Postgres checks the base table `GRANT` first, before RLS is even evaluated. No migration in this
repo has ever granted `authenticated` `SELECT` on `payments`:

- `migration_v40_customer_tables_grants_and_recursion.sql` did a deliberate, comprehensive sweep
  granting `authenticated` `SELECT`/`INSERT`/`UPDATE` on every other customer-owned table
  (`profiles`, `properties`, `pymes_captacion`, `pymes_diagnosis`, `tenant_preferences`, etc.) —
  its own header comment lists every table it covers, and `payments` is not one of them.
- `migration_v41_additional_customer_read_grants_and_recursion.sql` added `authenticated SELECT`
  on `services` and `pymes_plans` — the two tables embedded in the Payment History query — but
  again never touched `payments` itself.
- No later migration (through v60) adds it either.

So when a customer opens `/dashboard/payments`, the query fails with Postgres error `42501`
("permission denied for table payments"). The page only `console.error`s that failure — it never
surfaces it to the UI — so `payments` ends up `undefined`/`null` and the page renders the exact
same empty state as a customer with zero transactions: `$0 Total Paid`, `0 Transactions`,
`0 Pending`, "No payments yet". This happens **regardless of whether the underlying row was
successfully inserted by the webhook** — it is a pure read-side permission gap.

Because the query has no plan-specific or role-specific branching (it only filters by
`user_id`), this reproduces identically for every plan and every role — it is not specific to
Low Price or Founders.

### Why this wasn't caught by the service_role grants work (v44/v46)

`migration_v44_service_role_webhook_grants.sql` already granted `service_role`
`SELECT`/`INSERT`/`UPDATE` on `payments` — that fixes the **webhook's write path**, run under the
service-role key. It says nothing about the **customer's read path**, which runs under the
`authenticated` role via the cookie-context client. These are two separate Postgres roles with
independently-tracked grants; fixing one does not fix the other. That's the same class of bug as
v44/v46, just on the other side of the read/write boundary.

### Scope tested / traced vs. not verifiable from this sandbox

| Role | Plan | Checkout type | Traced insert path | Traced read path |
|---|---|---|---|---|
| Property Owner | Low Price | `service` (checkout-button.tsx → `/api/stripe/checkout`) | ✅ webhook `checkout.session.completed` → `payments.insert` w/ `service_id` | ✅ same universal query — affected |
| Property Owner | Founders Package | `service` | ✅ same path | ✅ affected |
| Property Owner | Support Tier | `service` | ✅ same path | ✅ affected |
| Property Owner | Premier Tier | `service` | ✅ same path (see `migration_v56_premier_tier_checkout_price.sql`) | ✅ affected |
| Investor | Essentials / Signature / Luxury | `service` + `propertyId` (Elite tiers) | ✅ same path, `property_id` attribution | ✅ affected |
| Investor | Below Portfolio Minimum | `service` + `propertyId` | ✅ same path (amount computed from rent, not `services.price`) | ✅ affected |
| PYME | Rescue / Growth / Scale | `pymes_upfront` | ✅ webhook → `payments.insert` w/ `pymes_plan_id` | ✅ affected |

All 11 plans across all 3 roles funnel through exactly two checkout types
(`CheckoutButton type="service" | "pymes_upfront"`, `src/components/checkout/checkout-button.tsx`)
and exactly one webhook insert path per type, and are all read back by the same single query in
`dashboard/payments/page.tsx`. There is no per-plan or per-role branch anywhere in that query, so
I'm confident the missing `authenticated SELECT` grant is a single shared root cause covering all
of them — not something that needs to be independently re-derived per plan.

**What I could not verify from this sandbox (no database credentials/connection available here):**
- The actual current grants on the live database (i.e., confirming `authenticated` really lacks
  `SELECT` on `payments` today, as opposed to some out-of-repo dashboard change). The evidence
  above is strong (the pattern is 100% consistent across every other table in this codebase, and
  the symptom matches exactly), but it's inferred from migration history, not a live
  `information_schema` query.
- Whether `migration_v44_service_role_webhook_grants.sql` (which fixes the webhook's own insert
  permission) was ever actually applied to the database. It exists in the working tree but is
  **untracked in git** (`git status` shows it as `??`, along with v42, v43, v45, v46, v47, v51,
  v53, v54) — i.e., not committed, which raises the possibility some of these fix-migrations were
  written but never run. If v44 was never applied, the webhook's `payments.insert` would *also*
  be failing (silently before, loudly via the `[webhook-diag] CRITICAL` `console.error` added
  since) — in which case there would be no row to read in the first place, on top of the
  read-permission bug documented above. I cannot confirm actual row existence for the reproduced
  Low Price / Founders payments without DB or Vercel log access from here.
- Recommend checking Vercel function logs for `[webhook-diag] CRITICAL: payments insert failed`
  around the two reproduced payment timestamps to settle whether the insert side is also broken.

### Fix

`migration_v61_payments_promotions_grants.sql` adds:
```sql
GRANT SELECT ON TABLE public.payments TO authenticated;
```
This is read-only and additive — the existing `"Users can view own payments"` /
`"Admins can view all payments"` RLS policies continue to restrict *which* rows each customer can
see; the grant only unblocks the base table check that was silently rejecting the query before RLS
ever ran.

---

## BUG 2 — Admin can't create a Promotion ("permission denied for table promotions")

### Root cause

`src/app/api/admin/promotions/route.ts` (GET/POST/PUT/DELETE) uses the **service-role** client
(`supabaseAdmin`) for every operation, by design — the route's own header comment explains why:
a previous incident (2026-06-08, "POR CREER" promo) found that cookie-context admin UPDATEs on
`promotions` returned no Postgres error but silently applied nothing, because RLS blocked the
write without surfacing an error. Switching to `supabaseAdmin` was the fix for that silent no-op.

However, `service_role` was never granted **any** privilege on `promotions`:
- `migration_v43_legal_documents_promotions_grants.sql` granted `authenticated SELECT` on
  `promotions` (for the customer-facing banners) and added an admin-only `FOR ALL` RLS policy —
  it never touches `service_role`.
- No other migration (through v60) grants `service_role` anything on `promotions`.

So switching the admin route to `supabaseAdmin` traded one failure mode for another: instead of a
silent no-op, `INSERT`/`UPDATE`/`DELETE` now fail loudly with Postgres `42501`
("permission denied for table promotions"), surfaced by the route as
`{ error: error.message }` → the UI's "Save failed: permission denied for table promotions".

### Additional related finding (same root cause, wider blast radius)

The same missing `service_role` grant also affects `GET` on this route (admin promotions list)
and the two customer-facing promo banners, both of which already read `promotions` via
`service_role` for the same "RLS blocks reads" reason:
- `src/components/dashboard/active-promotions-banner.tsx`
- `src/components/public/public-promotions-banner.tsx`

Both banners do `const { data } = await supabase.from("promotions")...` with **no error check**,
so a permission-denied read fails silently and renders nothing. Because no promotion could ever
be created (Bug 2), this symptom hasn't been directly observed yet, but it will resurface as soon
as a promotion exists unless `service_role` also gets `SELECT` — which is why the task's request
to "verify SELECT is granted so existing promotions display correctly" is not a formality here:
without it, a promotion could be created (once INSERT is granted) but would still never appear
anywhere.

### Fix

`migration_v61_payments_promotions_grants.sql` adds:
```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.promotions TO service_role;
```
`DELETE` is included because `/api/admin/promotions/route.ts`'s `DELETE` handler also uses
`supabaseAdmin.from("promotions").delete()`.

### Not verifiable from this sandbox
Same caveat as Bug 1: no DB connection here, so this is inferred from the complete absence of any
`service_role` grant statement on `promotions` anywhere in `supabase/*.sql`, matched against the
exact error message reported ("permission denied for table promotions"), which is the verbatim
Postgres 42501 message for precisely this condition.

---

## Migration file

`supabase/migration_v61_payments_promotions_grants.sql` — next available version after the
highest existing file (`migration_v60_pymes_growth_scale_features.sql`). Follows the same
idempotent pre-check / `DO $migration$` conditional-grant / post-check pattern established by
`migration_v44_service_role_webhook_grants.sql`: it only issues a `GRANT` for a
(grantee, table, privilege) triple that `information_schema.role_table_grants` shows is currently
absent, so re-running it is a no-op if some grants already exist.

**Not applied.** Per instructions, no migration was run against any database — this file is for
your review and manual application.

**Not committed / pushed.** No git commit or push was made as part of this work.
