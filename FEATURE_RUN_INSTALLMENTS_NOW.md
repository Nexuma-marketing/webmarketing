# Feature: "Process due installments" (admin button)

Lets an admin run the Premier Tier installment cron's logic now, for a
single property. This is needed because Vercel's scheduled cron only runs
on Production deployments, and all our deploys are Preview.

No SQL migration is needed. No local build, lint or install was run, as requested.

## Files changed

| File | Change |
|---|---|
| `src/lib/premier-installments.ts` | New `processDueInstallments({ propertyId? })`. It holds the cron's loop, moved as-is, plus the atomic claim described below. |
| `src/app/api/cron/process-installments/route.ts` | The CRON_SECRET auth and the start/finish logs stay. The route now calls `processDueInstallments()` with no filter. |
| `src/app/api/admin/properties/[id]/process-installments/route.ts` | **New.** `POST`, open to the roles `admin`/`marketing`/`sales`, the same set as Reschedule and Regenerate. It calls `processDueInstallments({ propertyId })` and returns `{ processed, results, installments }`. |
| `src/components/admin/property-detail-modal.tsx` | New "Process due installments" button below "Reschedule installments", with a confirm dialog. After a run it shows "N of M installments invoiced (#seq $amount, …)", one red line per error, and refreshes the installment list. |

The button appears only when `uses_installments` is true **and** at least
one installment has `status === 'scheduled'` and `due_date <= now`. The
browser computes this. The server decides again on its own, so if the
browser clock is off, the worst case is the message "No due installments
to invoice."

## How installments are selected (same rules as the cron)

```ts
plan_installments
  .eq("status", "scheduled")
  .lte("due_date", now)            // already due; never future installments
  [.eq("property_id", propertyId)] // admin button only
```

- **No "tenant signed lease" check.** The cron and the new function never
  read `tenant_lease_signed_at`. The schedule runs from the upfront payment
  date, which is when `schedulePremierInstallments` and
  `reschedulePremierInstallments` set the `due_date` values.
- To note: the cron does **not** re-check whether the property is still on
  Premier Tier. It invoices any `scheduled` row that is due. I did not
  change this, to keep the cron's behaviour the same.
- The admin button only invoices rows of the property it was clicked on.
  Other properties and other owners are never touched, even when they
  belong to the same owner.

## Duplicate invoicing (idempotency)

**There was a real risk before this change.** The cron read the
`scheduled` rows, called Stripe, and only then wrote `invoiced`. Two runs
at nearly the same time could both read the row as `scheduled`, so the
cron plus the button, or a double click, would produce **two Stripe
invoices**.

**The fix is an atomic claim.** It needs no schema change. Before calling
Stripe, each row is claimed like this:

```sql
UPDATE plan_installments
SET stripe_invoice_id = 'claiming:<uuid>', updated_at = now()
WHERE id = $1 AND status = 'scheduled' AND stripe_invoice_id IS NULL
RETURNING id;
```

- Postgres applies this UPDATE to only one run. The other run gets 0 rows
  back and skips the installment with `skipped: "already_claimed"`. The
  modal shows that as "#n: Already being invoiced by another run".
- I used `stripe_invoice_id` as the marker because the `status` CHECK
  constraint only allows `scheduled/invoiced/paid/failed/voided`. Adding a
  `processing` status would have needed SQL. No code reads
  `stripe_invoice_id` from `plan_installments` for display; I checked the
  dashboard, payments, services, the summary and the webhook.
- Side benefit: `reschedulePremierInstallments` already deletes only rows
  where `stripe_invoice_id IS NULL`. A Reschedule click can therefore never
  delete a row while that row is being invoiced.

## What happens if Stripe fails partway

| Case | Result |
|---|---|
| The customer lookup or Stripe throws before an invoice is returned | The claim is released (`stripe_invoice_id = NULL`, matched on our own token). The row stays a plain `scheduled` row with no invoice and is retried on the next run. **It is never marked `invoiced` without a real invoice.** |
| The invoice was created and sent, but the `invoiced` UPDATE fails | The `claiming:` marker is **kept** so the row is never invoiced a second time. A `[premier-installments] CRITICAL … fix row manually` log records the `invoiceId`. |
| Known leftover risk, present before this change | `createAndSendStripeInvoice` can throw **after** `finalizeInvoice`, for example if `sendInvoice` fails. A finalized invoice then exists in Stripe but the error does not carry its id, so the claim is released and the next run creates a second invoice. Closing this needs a Stripe lookup by `metadata.installment_id` before creating, which goes beyond a minimal change. If it happens, check Stripe before retrying. |
| The function is killed by `maxDuration` (60s) mid-Stripe | The row stays `scheduled` with `claiming:…` and will not be retried automatically. Use the SQL below. |

## Stripe customer, Bill-to and email

- The `ensureStripeCustomer` call is unchanged and matches the current
  signature: `{ ownerId, email, name, existingId, billingProperty }`.
- The name and email come from the property owner's `profiles` row
  (`properties.owner_id`). The address comes from the property. On every
  run the Stripe customer is updated from the database, so the Bill-to is
  the real owner.
- The customer email is sent by `createAndSendStripeInvoice` through
  Stripe's own `stripe.invoices.sendInvoice`. This is the same function
  with the same metadata (`kind: "plan_installment"`, `installment_id`, …)
  whether the cron or the button triggers it. The `payment_succeeded` and
  `payment_failed` webhooks therefore handle the invoice the same way.

## Logs

- The code moved from the cron **already logged under
  `[balance-invoice-diag]`, not `[premier-installments]`**. I kept those
  lines word for word so the cron's logs do not change.
- New log lines use `[premier-installments]`:
  - "Due installments selected" (with `propertyId` or `"all"`)
  - "already claimed … skipping"
  - "failed to release installment claim"
  - "invoice sent but row update failed"
  - the admin route's "requested" and "finished" lines

  To follow a run end to end, filter by both prefixes.
- Small change in the cron's response: each entry in `results` now also
  carries `sequence`, `amountCents`, `invoiceId`, `hostedInvoiceUrl` and
  `skipped`. These fields are only added; none were removed.

## SQL (optional, diagnostic only)

No migration is needed: `service_role` can already UPDATE
`plan_installments` (migration v66).

```sql
-- Rows left mid-claim (function killed, or row update failed after the invoice was sent)
SELECT id, property_id, sequence, due_date, amount_cents, stripe_invoice_id, updated_at
FROM plan_installments
WHERE stripe_invoice_id LIKE 'claiming:%';

-- Release one ONLY after confirming in Stripe that no invoice exists for it
-- (Stripe search: metadata['installment_id']:'<id>')
UPDATE plan_installments SET stripe_invoice_id = NULL, updated_at = now()
WHERE id = '<id>' AND status = 'scheduled' AND stripe_invoice_id LIKE 'claiming:%';
```

## What to test live (Preview)

1. **Set up a due installment.** On a Premier property with a schedule,
   move one installment into the past:
   `UPDATE plan_installments SET due_date = now() - interval '1 hour' WHERE id = '<id>';`
   Use Stripe test mode on Preview if possible.
2. Open the property in the admin and check that "Process due installments"
   appears. Check that it does **not** appear on a property whose
   installments are all in the future or already invoiced or paid.
3. Click it. Expected result:
   - The message reads "1 of 1 installment invoiced (#n $X)".
   - The list shows `invoiced`.
   - The `[balance-invoice-diag]` and `[premier-installments]` logs are
     present in Vercel.
4. In Stripe, check the invoice:
   - The amount equals `amount_cents`, plus GST.
   - The customer's name and email are the owner's, and the address is the
     property's.
   - The metadata has `kind=plan_installment` and the correct
     `installment_id`.
   - The email reached the owner.
5. Check that only due rows are invoiced: the property's other, future
   installments remain `scheduled` and untouched.
6. Check scoping: another property, from the same owner or a different
   one, that also has a due installment is **not** invoiced.
7. **Concurrency test.** Put another row in the past, then fire two POSTs
   at the same time from the devtools console:
   `await Promise.all([1,2].map(() => fetch('/api/admin/properties/<id>/process-installments',{method:'POST'}).then(r=>r.json())))`.
   Exactly one response should be `success: true`, the other should be
   `already_claimed`, and Stripe should hold a single invoice.
8. **Roles.** A `support` user, or an owner, gets a 403.
9. **Payment.** Pay the invoice in test mode. The webhook should set the
   row to `paid` and insert a `payment` of type `plan_installment`.
10. **Optional failure test.** Use an owner without an email, or a test
    property without `owner_id`. Expected result:
    - The modal shows the error.
    - The row stays `scheduled` with `stripe_invoice_id` NULL.
    - The `claiming:%` query returns nothing.
