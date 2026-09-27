# Root Cause Confirmed

`/api/tenant-submit-email` started the commercial and tenant Resend requests without awaiting either one, then returned success immediately. A serverless invocation could therefore end before either email request completed.

# Exact Fix Implemented (await pattern matching apply-property)

The route now stores the commercial send and, when present, tenant-confirmation send in a `sends` promise array. It awaits `Promise.allSettled(sends)` before sending its HTTP response, logs fulfillment or failure for each recipient, and returns `{ success: true, emailSent: anySuccess }`, matching the working Apply for Free route's completion/result convention.

Email content, subjects, recipients, templates, and the conditional tenant-recipient behavior are unchanged.

# File Modified

- `src/app/api/tenant-submit-email/route.ts`

# What Was Intentionally Not Changed

- The Tenant Preferences form and its submit handler.
- Preference persistence, profiling, consent logging, and lead creation.
- `/api/apply-property`.
- Email templates, content, subjects, sender, and recipients.
- No commit, push, or deployment.

# Expected Result

The tenant-preferences email route will not respond until Resend has settled each required send. Both the commercial notification and tenant confirmation can complete before a serverless invocation finishes, and per-recipient delivery outcomes are logged.
