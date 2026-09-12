# Exact Error Captured (from code/logs, not the generic user-facing message)

**I do not have access to Vercel's dashboard or Function logs from this environment/session** — I cannot fetch, tail, or query them, and I have not fabricated a captured stack trace below. What I can do accurately is show exactly what the current code (from `CONSULTATION_COMMERCIAL_EMAIL_FIX.md`) will have logged, deterministically, based on which branch executed — so you can go straight to the right log lines in Vercel instead of scanning everything.

The full path for this flow is: `src/app/(dashboard)/dashboard/consultation/page.tsx` → plain `<form action="/api/contact" method="POST">` → `src/app/api/contact/route.ts:81` (`sendContactNotification(...)`) → `src/lib/email.ts:37-136`.

Inside `sendContactNotification()`, there are exactly three places an error is logged, and the "neither email arrived" symptom narrows it to one of two of them:

1. **`src/lib/email.ts:130-134`** (outer `catch`) — fires only if something throws *before or during* `Promise.allSettled(...)` itself resolves (e.g. a synchronous validation error constructing one of the `resend.emails.send(...)` calls, or the `Resend` client itself throwing). Logs:
   ```
   console.error("sendContactNotification failed:", err);
   ```
   and sets `emailMetrics.lastError = err.message`, returns `{ ok: false, reason: "send_failed" }`. **This is the branch most consistent with "neither email sent"** — a synchronous throw while building the array literal `[resend.emails.send(...), resend.emails.send(...)]` aborts before either send is dispatched (see the array-evaluation-order note below), so the outer catch is the only one that would ever fire without either per-email log line also appearing.

2. **`src/lib/email.ts:112-114`** — commercial-specific failure: `console.error("sendContactNotification: commercial email failed:", reason)`, where `reason` is either the rejected promise's `.reason` or the fulfilled result's `.value.error` (Resend's own error object, e.g. `{ name, message }`).

3. **`src/lib/email.ts:116-118`** — same, for the customer email: `console.error("sendContactNotification: customer email failed:", reason)`.

If both #2 and #3 fired but #1 did not, that means `Promise.allSettled` itself completed and both sends were individually attempted and individually rejected — a different (and more informative) situation than #1. **Which of these three actually printed is the single most important thing to check in the Vercel log for this request** — please pull the log lines matching `sendContactNotification` for the timestamp of this test and report which of the three appeared (and, for #2/#3, the actual `reason` object logged, which will contain Resend's real error `name`/`message`, e.g. domain-verification vs. rate-limit vs. invalid-recipient).

I also cannot query the running `/api/health` endpoint (mentioned in the `emailMetrics` comment at `email.ts:12-14`) from here — hitting that endpoint right after reproducing the failure would return `lastError` and `attempts`/`failed`/`succeeded` counters, which would also disambiguate #1 vs. #2/#3 without needing raw logs.

# Comparison With Working Anonymous Contact Us Flow

Re-confirmed, same conclusion as the prior investigation: the anonymous form (`src/app/page.tsx`) and the authenticated consultation page (`src/app/(dashboard)/dashboard/consultation/page.tsx`) still submit to the identical route with the identical field set, and `sendContactNotification()` is still the single, only implementation both call — there is no auth-specific branch anywhere in `route.ts` or `email.ts`. That part of the prior report still holds.

**What changed since the prior report is the code inside `sendContactNotification()` itself — and that change is common to both flows, not specific to the authenticated one.** So a difference in outcome between "anonymous still works" and "consultation now fails completely" can't be explained by a code-path difference; it has to come from either (a) something about the two flows' actual field *values* triggering different Resend-side behavior, or (b) something about *when/how* the two flows are being tested relative to a shared external constraint (API quota, rate limit, account status) that the anonymous flow simply hasn't been re-tested against under the same conditions since the fix landed.

One concrete, mechanical difference the fix itself introduced, worth checking directly against Resend's account limits: the two sends used to happen **sequentially** — the second (`customer`) `resend.emails.send()` call only started after the first (`commercial`) call's full network round-trip had already completed. Now, `Promise.allSettled([send1, send2])` evaluates the array eagerly: both `resend.emails.send(...)` calls are invoked back-to-back in the same tick, so both outbound HTTP requests to Resend's API are now in flight **concurrently** instead of spaced apart in time. If the Resend account on this project is on a plan/key with a strict requests-per-second (or concurrent-request) limit, two simultaneous calls are more likely to trip it than two calls naturally spaced apart by a network round-trip — which would show up as a `429`/rate-limit `error` on one or both of the `Promise.allSettled` results (branch #2/#3 above), not as a thrown exception.

# Was This A Regression From The Prior Fix, Or Pre-Existing

Most likely **both**, and I want to be precise about which part is which rather than picking one:

- **Pre-existing:** whatever made the *commercial* email fail before this fix was already present in the account/config before I touched anything — my change didn't create a delivery problem, it made an already-silent one visible (which is exactly why the UI now correctly shows "email delayed" instead of falsely showing "success"). That underlying cause (misconfigured sender domain, unverified domain, wrong/limited API key, or an account-level restriction) has not been identified yet because it was never surfaced until now.

- **Possible regression introduced by the fix:** switching from two sequential `await`s to `Promise.allSettled([...])` changed *when* the two Resend API calls happen relative to each other — from spaced-apart to simultaneous. If the account is on a tight rate limit, this concurrency change could be why a previously-partial failure (one send silently failing) became a total failure (both sends now failing, e.g. both hitting a rate limit together, or one tripping a limit that then also blocks the other within the same burst window). This is a genuine, mechanical side effect of the fix, not present in the pre-fix code, and is the most plausible reason the failure mode got strictly worse right after that specific change rather than at some unrelated time.

I can't confirm which of these (or both) is actually happening without the log line identified in section 1 — a `429`/rate-limit-shaped `reason` in the #2/#3 branches would confirm the concurrency theory; a domain-verification or invalid-`from`-address error appearing in *both* #2 and #3 (or in #1, if it throws synchronously) would confirm this was always going to fail for both recipients once actually checked, independent of concurrency.

# Recommended Fix (describe only, do not implement)

1. **First, get the real error** — pull the Vercel log lines identified above (or hit `/api/health` right after reproducing) and read the actual Resend error `name`/`message`. Everything past this point depends on which failure mode it turns out to be.
2. **If it's a rate limit / concurrency issue:** stop firing both `resend.emails.send()` calls in the same instant. Either revert to awaiting them one at a time (but each in its *own* try/catch, not one shared block, so a failure in one still can't skip the other — unlike the pre-fix code), or keep `Promise.allSettled` but stagger the two calls with a small delay (e.g. `await sleep(300)` between building the two entries), or check whether the Resend SDK exposes/needs built-in retry/backoff configuration for this account's plan.
3. **If it's a sender-domain/account-configuration issue** (e.g. `nexuma.ca` not verified in Resend, or the API key is a test/sandbox key that restricts recipients or the `from` address): this isn't a code fix at all — it needs the domain verified (or `FROM_EMAIL` pointed at Resend's own verified test sender) and/or the API key/plan corrected in the Vercel environment variables. No amount of retry logic in `email.ts` will fix a rejected sender domain.
4. Either way, keep the `Promise.allSettled` + `.error`-checking structure from the prior fix — it's what made this diagnosable at all. The remaining work is identifying *which* of the two causes above is real, not walking back the error-detection fix.
