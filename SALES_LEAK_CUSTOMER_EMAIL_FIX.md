# Root Cause

`/api/pymes-result-email` (the Sales Leak Diagnosis result route) already had code to send
**both** the customer results email and the commercial notification email — this was not a
missing-code case like the earlier tenant fix.

The bug was in how the customer send's outcome was handled:

```ts
await resend.emails.send({
  from: FROM_EMAIL,
  to: [recipientEmail],
  subject: `Your Sales Leak Diagnosis Results — ...`,
  html,
});
```

The Resend SDK's `emails.send()` does **not** throw on a delivery failure (unverified sender
domain, invalid/rejected recipient address, rate limiting, etc.) — it resolves normally with
`{ data: null, error: {...} }`. The route awaited the call but never inspected `result.error`,
so any failed customer send was silently treated as a success. Execution then continued straight
into the commercial email send, which used a fixed, already-verified address and reliably
succeeded. That is exactly the reported symptom: commercial always gets the email, the customer
sometimes/never does, with no error surfaced anywhere.

A second, smaller issue: the commercial send itself was fire-and-forget
(`resend.emails.send(...).catch(...)` without `await`), so the route could return its HTTP
response before that request even completed — the same class of bug fixed previously in
`tenant-submit-email` (`TENANT_SUBMIT_EMAIL_AWAIT_FIX.md`).

# Comparison With Working Client Acquisition Email

`/api/pymes-captacion-email` (the confirmed-working Client Acquisition confirmation email) already
contains a code comment documenting this exact failure class from a prior incident:

> "Previous version of this route used fire-and-forget `.catch(console.error)` for Resend sends,
> so any delivery failure was silenced ... Now we AWAIT both sends, capture any Resend error, and
> surface it to the API response."

Its pattern for each send:

```ts
const result = await resend.emails.send({ ... });
if (result.error) {
  console.error("... Resend error:", result.error);
  emailResults.customer = `error: ${result.error.message || result.error.name || "unknown"}`;
} else {
  emailResults.customer = `sent (id=${result.data?.id || "?"})`;
}
```

`pymes-result-email` had regressed to the same broken shape this comment warns about: awaiting
without checking `result.error` for the customer send, and not awaiting at all for the commercial
send. It never adopted the fix that `pymes-captacion-email` already proved.

# Fix Implemented

In `src/app/api/pymes-result-email/route.ts`:

1. Customer email send is now wrapped in a `try/catch` and its `result.error` is checked. A
   Resend-level delivery error or a thrown exception is now logged with detail and recorded in an
   `emailResults.customer` status field instead of being silently ignored.
2. Commercial email send is now `await`ed (previously fire-and-forget) and given the same
   `try/catch` + `result.error` check, recorded in `emailResults.commercial`.
3. The route's response now returns `{ success: true, emails: emailResults }` (matching the
   convention already used by `pymes-captacion-email`) so per-recipient delivery outcomes are
   visible in Network/Vercel logs instead of being invisible.

No email template, subject line, sender address, wording, plan-price mapping, score calculation,
or recipient logic was changed — only how each send's result is awaited, checked, and logged.

# Files Modified

- `src/app/api/pymes-result-email/route.ts`

# Expected Result

If the customer's results email fails to send (bad domain verification, invalid address, Resend
rate limit, etc.), that failure is now logged explicitly (`[pymes-result-email] customer email
Resend error: ...`) and reported in the JSON response, instead of being masked as a success. Once
the underlying Resend delivery issue (if any remains, e.g. domain verification) is confirmed clean
via those logs, the customer should reliably receive "Your Sales Leak Diagnosis" alongside the
commercial team's lead notification, matching the behavior already working for Client Acquisition.
