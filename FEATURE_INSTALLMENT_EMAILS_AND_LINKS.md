# Feature: app emails and invoice links for Premier installments

Billing amounts and calculations are unchanged. No SQL is needed, and no local
build, lint or install was run.

## 1. How the balance invoice flow sends its emails today

- **Function and template:** `sendBalanceInvoiceAvailableEmail` in `src/lib/email.ts`.
  It sends through Resend, via the internal `sendOne` helper.
- **Who calls it:** `generateBalanceInvoice` does **not** send the email itself.
  The two routes that call it send it afterwards, only when the invoice was
  created (`success` + `hosted_invoice_url`):
  - `POST /api/admin/properties/[id]/tenant-signed-lease`
  - `POST /api/admin/properties/[id]/balance-invoice` (regenerate)
- **Recipients:** a single Resend send:
  - `to` = the owner's email (`profiles.email` of `properties.owner_id`)
  - `bcc` = `commercialRecipients()`, the comma-separated commercial address
    list. The same BCC is used on all payment emails (`notifyCommercial: true`).
- **Stripe's email as well:** **yes**. `createAndSendStripeInvoice` always calls
  `stripe.invoices.sendInvoice`. The code comment and the email text itself say
  so: *"You'll also receive a separate invoice email directly from Stripe"*. In
  production, a balance customer therefore gets **two** emails: Stripe's and the
  app's.
- **Detail:** the balance email button goes to `/dashboard/payments`, not to the
  `hosted_invoice_url`.

## 2. What happens now when an installment is invoiced

`processDueInstallments` (`src/lib/premier-installments.ts`) is shared by the
cron and the admin button. **After** the row has been updated to `invoiced`, it
sends:

| Email | To | Content |
|---|---|---|
| `sendBalanceInvoiceAvailableEmail` with the new optional fields `installment` + `payUrl` | Owner (`to`) + commercial (`bcc`, same list as the balance email) | Subject "Installment N of M is now payable — address, city"; amount; due date of the Stripe invoice; "Pay installment N" button that goes **directly to the `hosted_invoice_url`** |
| Stripe hosted-invoice email (`sendInvoice`) | Owner | Unchanged. In test mode Stripe does not send it. |

- **M** is the count of `plan_installments` rows for the same property and
  `service_id`.
- **Balance flow unchanged:** without `installment`/`payUrl`, the template
  produces exactly the same subject, text and button as before.

**When it is NOT sent:**
- the atomic reservation failed or the row was skipped (`already_claimed`);
- Stripe threw an error;
- the update to `invoiced` failed.

In all three cases execution never reaches the email code.

**Email failure:**
- The email code is inside its own `try/catch`, after the row has already been
  marked `invoiced`. It cannot roll back or block the billing, and it cannot
  release the reservation, so the installment is never invoiced again.
- `sendOne` used to swallow errors and return `void`. It now returns `boolean`.
  The change is compatible: the other callers ignore the value.
- With that value we log:
  - `[premier-installments] Installment email sent`, or
  - `[premier-installments] Installment email NOT sent …`, when Resend failed or
    `RESEND_API_KEY` is missing. The Resend error itself is still logged as
    `payment email failed:`.
- The result carries `emailSent`. The modal shows a red line, "invoiced, but the
  app email to the owner was not sent", when it is `false`.

## 3. Decision: should the customer also get Stripe's email?

**Yes, keep both, same as the balance flow.** The balance flow was designed this
way on purpose ("in addition to — never instead of"), and the app's template
already warns that a separate email from Stripe will arrive.

Turning off `sendInvoice` would change `createAndSendStripeInvoice`, which the
balance flow also uses. The only difference is intentional: the installment
email's button goes straight to the Stripe invoice, while the balance email's
goes to Payment History.

If you later want just one email in production, the clean option is to stop
calling `sendInvoice` only for `kind: "plan_installment"`. That is a business
decision; I did not apply it.

## 4. "open" link in the admin modal

- `GET /api/admin/properties/[id]` and the response of the
  `process-installments` endpoint now include `hosted_invoice_url` for each
  installment.
- In `property-detail-modal.tsx`, each installment with status `invoiced` or
  `paid` that has a URL shows "open ↗". It uses the same style as the balance
  invoice link (`text-primary underline` + `ExternalLink`).
- Small limitation: right after **Reschedule installments**, the kept rows lose
  their link until the modal is reopened. The reschedule endpoint does not
  return `hosted_invoice_url`. I left it that way to avoid touching that flow.

## 5. Customer Payment History

**This already worked; I changed nothing.**

- `/dashboard/payments` reads `hosted_invoice_url` from `plan_installments`.
- `PropertyBalanceSummary`, the same component that shows "Pay remaining
  balance", shows a **"Pay now ↗"** button for every installment that is
  `invoiced` and has a URL.
- It relies on the `authenticated` SELECT grant (v66) plus the "Owners can view
  own plan_installments" RLS policy, and both exist.
- A `failed` installment shows a "Payment failed" badge with no link, even
  though the Stripe invoice usually stays open and payable. I did not change it.
  If you want, it is a one-line change in `property-balance-summary.tsx`.

## Files changed

- `src/lib/email.ts`
  - `sendOne` → `Promise<boolean>`.
  - `sendBalanceInvoiceAvailableEmail` gains the optional `installment` and
    `payUrl` and returns `boolean`.
- `src/lib/premier-installments.ts`: sends the email after the installment is
  invoiced, adds the `[premier-installments]` logs, and adds `emailSent` to the
  result.
- `src/app/api/admin/properties/[id]/route.ts`: `hosted_invoice_url` in the
  installments select.
- `src/app/api/admin/properties/[id]/process-installments/route.ts`: same.
- `src/components/admin/property-detail-modal.tsx`: "open" link per installment,
  and a warning when the email was not sent.

## What to test live

1. **Washington St (#1 is already invoiced):** open the modal and check that #1
   shows "open ↗" and opens the Stripe invoice.
   - The app email will **not** be resent for #1: it was invoiced before this
     change, and the email only goes out when an installment is invoiced.
   - To test the email, use the next installment or another property.
2. **Trigger the email:** move one installment into the past
   (`UPDATE plan_installments SET due_date = now() - interval '1 hour' WHERE id = '<id>';`)
   and press "Process due installments".
   - The message should not show the email warning.
   - The owner receives "Installment N of M is now payable".
   - The commercial address receives it as BCC.
   - The button opens the `hosted_invoice_url`.
3. **Check the email contents:** check N of M (#1 of 1 for property #1, x of 3
   for #2/#3), the amount without GST (same as the balance email), and the due
   date of the Stripe invoice.
4. **Vercel logs:** check that `[premier-installments] Installment email sent`
   appears.
5. **Customer Payment History:** the invoiced installment shows "Pay now"
   linking to Stripe.
6. **Balance regression test:** Regenerate balance invoice on a non-Premier
   property. The email should be identical to before ("Pay remaining balance" →
   Payment History).
7. **Optional, email failure:** on a Preview without `RESEND_API_KEY`, process
   an installment. Expected:
   - it is invoiced (`invoiced`, invoice in Stripe);
   - the modal shows the "email … not sent" warning;
   - the log says `Installment email NOT sent`;
   - a second click does not invoice it again (the button disappears because
     nothing is due anymore).
