# Logging Added

All diagnostic statements use the `[webhook-diag]` prefix and are limited to the `checkout.session.completed` case.

- On case entry, the log captures the Stripe event type, Checkout Session ID, and complete session metadata object.
- Immediately before the `payments` insert, the log captures the exact payload passed to the existing insert.
- Immediately after the `payments` insert, the log captures the Supabase response's `data` and `error` properties.
- Immediately before the Founders-counter service lookup, the log captures the service ID being queried. Immediately afterward, it captures the returned service data and error.
- Immediately before the Founders-counter `app_config` select, the log identifies the read. Immediately afterward, it captures the current stored value and select error.
- Immediately before the Founders-counter `app_config` update, the log captures the current value and new value. Immediately afterward, it captures those values along with the update response data and error.
- At the end of the case, immediately before `break`, the log confirms that the `checkout.session.completed` case completed successfully.

# File Modified

- `src/app/api/stripe/webhook/route.ts`
- `WEBHOOK_DIAGNOSTIC_LOGGING_ADDED.md` (this requested report)

# What Was Intentionally Not Changed

No business logic, conditions, insert payloads, update payloads, or control flow were changed. No error handling or early returns were added. No other webhook event case was modified. No database, RLS, grants, or other application files were touched. Nothing was committed, pushed, or deployed.

# Reminder: This Logging Is Temporary

The `[webhook-diag]` logging should be removed in a follow-up task after the root cause is confirmed and fixed. It remains active now for the next real Stripe test.

# Expected Result

The next `checkout.session.completed` invocation should produce a searchable sequence of `[webhook-diag]` entries in Vercel logs showing whether execution reaches the payment insert and Founders-counter operations, the exact values involved, and any Supabase errors returned without altering the webhook's existing behavior.
