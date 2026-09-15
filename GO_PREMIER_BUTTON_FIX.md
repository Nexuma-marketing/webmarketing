# Root Cause (why it did nothing)

The "Go Premier" button in the expanded Premier Tier `<details>` panel
([dashboard/services/page.tsx:727-772](<src/app/(dashboard)/dashboard/services/page.tsx#L727-L772>))
and the working "Get Support" button
([dashboard/services/page.tsx:679-724](<src/app/(dashboard)/dashboard/services/page.tsx#L679-L724>))
run through **byte-for-byte identical code**: both resolve a DB service
row via the same `PLAN_NAME_TO_DB_SERVICE` map + `servicesByDbName`
lookup, and both only render a real `<CheckoutButton>` when that row
exists and has `price > 0`:

```tsx
const dbName = PLAN_NAME_TO_DB_SERVICE[premierPlan.name];
const svc = dbName ? servicesByDbName[dbName] : undefined;
const upfrontPrice = svc ? Number(svc.price) || 0 : 0;
...
{svc && upfrontPrice > 0 ? (
  <CheckoutButton type="service" serviceId={svc.id} label={...} />
) : (
  <Link href="/dashboard/services#contact">{premierPlan.cta}</Link>
)}
```

When that guard fails, the button silently falls back to a plain
`<Link href="/dashboard/services#contact">` — a same-page anchor link
that performs no purchase action, which is exactly what "clicking it
does nothing" looks like to a customer.

Tracing the `'Plan: Owner Preferred — Premier Tier'` row through the
migration history confirms this guard was historically failing for
Premier specifically:

- **v12** seeds both `'Plan: Owner Preferred — Support Tier'` and
  `'...Premier Tier'` at `price = 0`.
- **v28** explicitly documents leaving *both* at `price = 0` "by
  design" (CFP-based pricing, no upfront Stripe charge at the time).
- **v34** ("No puedo comprar ningún plan, el enlace está roto") is the
  *only* migration that ever sets `price = 200` for these plans — and
  it does so for Support Tier and Premier Tier together, in a single
  `WHERE name IN (...)` statement.

No migration after v34 touches Premier Tier's price again. If v34 was
skipped, only partially applied, or Premier's row was later reset to
`price = 0` / `is_active = false` independently (e.g. via an admin
pricing edit), Support Tier keeps working while Premier silently loses
checkout capability — with no code difference between the two to
explain it. This class of "migration file exists in the repo but the
live DB state doesn't match it" is a recurring pattern already flagged
elsewhere in this repo (e.g. `WEBHOOK_DEPLOYED_VS_CHECKED_IN_DIAGNOSTIC.md`).

I do not have Supabase credentials in this environment to query the
live `services` table directly, so I could not confirm the exact
current value, but the front-end code gives no other way to explain
identical logic producing different outcomes for the two plans.

# Fix Implemented

No front-end changes were needed or made — the "Go Premier" wiring is
already the exact same `CheckoutButton` pattern as "Get Support," so
touching it would only risk duplicating/rebuilding what already works
(and the task explicitly asked not to rebuild it).

Added a new, idempotent migration,
**`supabase/migration_v56_premier_tier_checkout_price.sql`**, that
re-applies the same `price = 200` / `is_active = true` state v34
already established for Support Tier, scoped to *only* the Premier
Tier row:

```sql
UPDATE services
SET price = 200,
    is_active = true
WHERE name = 'Plan: Owner Preferred — Premier Tier';
```

This restores parity using the exact same $200 upfront-deposit
mechanism Support Tier already charges via Stripe (the percentage-based
balance/installments for both plans continue to be handled out-of-band,
unchanged). It does not touch the Support Tier row, and does not
change any displayed pricing text or plan terms — `OWNER_TIERS`
(`constants.ts`) and this row's `description` column are untouched, so
the 30%/28%-of-rent figures and the 50/30/20 installment schedule shown
to the customer remain exactly as they are today.

This migration was written but **not run** against the live database
(no Supabase credentials available in this environment) and **not
committed** — per the task instructions, an admin needs to execute it
via the Supabase SQL Editor, the same way v28/v31/v34 were applied.

# Files Modified

- [supabase/migration_v56_premier_tier_checkout_price.sql](supabase/migration_v56_premier_tier_checkout_price.sql) — new migration (not yet run).

No `.tsx`/`.ts` files were changed. Support Tier's button, Premier's
displayed pricing/terms, and Investor-related code are all untouched.

# Expected Result

Once `migration_v56_premier_tier_checkout_price.sql` is run:

- Recommended Services → expanding "Want to pay in installments? See
  Premier Tier details" → the "Go Premier" button renders as a real
  `CheckoutButton` (label: "Go Premier — Pay $200 CAD upfront"),
  identical in behavior to "Get Support."
- Clicking it calls the same `/api/stripe/checkout` route with
  `type: "service"` and the Premier Tier service's real `serviceId`,
  and redirects the customer to a live Stripe Checkout session for the
  same $200 upfront deposit mechanism Support Tier already uses.
- Support Tier's button, Premier's displayed terms/pricing text, and
  the Investor per-property portfolio breakdown are all unaffected.
- If the live `services` row was already correctly priced (i.e. the
  bug's true cause turns out to be something else, such as
  `is_active` having been toggled off via an admin action after v34),
  this migration is still safe and idempotent — it simply reasserts
  the same known-good state and changes nothing else.
