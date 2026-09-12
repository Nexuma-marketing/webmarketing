# Root Cause (exact source of the newline character)

The `defaultSubject` template literal in `src/app/(dashboard)/dashboard/consultation/page.tsx` (`Consultation request — ${planName} plan`) is itself a clean, single-line string as written — there's no embedded `\n` in the source template literal. The injection point is one level up: **`planName` is built directly from `params.plan`, an unsanitized URL query-string value** ([page.tsx:26-29](<src/app/(dashboard)/dashboard/consultation/page.tsx#L26-L29>) before this fix):

```ts
const params = await searchParams;
const planName = params.plan || null;   // <- straight from the URL, untrusted
```

Under the normal click path, `PymesPlanCard` builds this URL as `/dashboard/consultation?plan=${encodeURIComponent(planDetails.name)}`, and `planDetails.name` is always a clean literal ("Rescue"/"Growth"/"Scale") — so the button itself never produces a bad value. But the page has no guard against the query string carrying something else: a hand-edited URL, a stale bookmark/browser-history entry, or a copy-pasted link containing a `%0A` (or raw) line-break decodes straight through Next.js's query-string parsing into `params.plan` as a literal `\n` character, which then flows unmodified into `defaultSubject` and, from there, into the `subject` field posted to `/api/contact`. Resend's API validates `subject` server-side and rejects the whole send with a `422 validation_error` the instant it contains `"\n"` — and since both the commercial and customer emails in `sendContactNotification()` share that one `subject` value, the 422 kills the send for **both** recipients at once, exactly matching the observed "neither email arrived" symptom (not a delivery/rate-limit problem — the request to Resend never succeeds in the first place).

# Fix Implemented (sanitization at source + defensive sanitization in sendContactNotification)

**At the source** — [page.tsx:26-34, 49-51](<src/app/(dashboard)/dashboard/consultation/page.tsx#L26-L51>):

```ts
const sanitizeForSubject = (value: string) => value.replace(/[\r\n]+/g, " ").trim();
const planName = params.plan ? sanitizeForSubject(params.plan) : null;
...
const defaultSubject = sanitizeForSubject(
  planName ? `Consultation request — ${planName} plan` : "Consultation request",
);
```

`planName` is sanitized where it enters the page (closest to the untrusted input), and the fully-assembled `defaultSubject` is sanitized again as a second, redundant pass — belt-and-suspenders, since the second call is a no-op if the first already cleaned things up, but guarantees the final string handed to the `<textarea>` can never carry a line break regardless of how it was assembled.

**Defensively, inside `sendContactNotification()`** — [src/lib/email.ts:37-57](src/lib/email.ts#L37-L57), per the task's explicit ask that this be a safety net for *any* caller, not just this one page:

```ts
export async function sendContactNotification({
  name, email, phone,
  subject: rawSubject,
}: { ... }): Promise<{ ok: boolean; reason?: string }> {
  emailMetrics.attempts += 1;

  const subject = rawSubject.replace(/[\r\n]+/g, " ").trim();
  ...
```

Every downstream use of `subject` — the commercial email's `subject: \`New Contact Form: ${subject}\``, its HTML table row, and the customer email's HTML body — now reads this sanitized local variable, not the raw caller-supplied string. This means the public/anonymous Contact Us form (which already sends a clean subject and needed no change) gets the same protection automatically, and any future caller of `sendContactNotification()` — not just this consultation page — is covered even if it forgets to sanitize its own input.

The `Promise.allSettled`-based error-detection structure from the prior fix (`CONSULTATION_COMMERCIAL_EMAIL_FIX.md`) was not touched — it's exactly what correctly surfaced this real 422 error in the first place, and it stays in place to catch any *other* future validation failure the same way.

# Verified For Both Sales Leak and Client Acquisition

As with the previous two fixes in this flow, "Schedule a Consultation" is a single shared component (`PymesPlanCard`) feeding a single page (`/dashboard/consultation`) and a single function (`sendContactNotification`) — there is no separate code path per plan origin. `getPymesPlanForUser()` resolves the customer's plan from either `pymes_diagnosis` (Sales Leak Diagnosis) or `pymes_captacion` (Client Acquisition) and hands `PymesPlanCard` the same `PymesPlanDetails` shape either way; the `plan` query param and the subsequent sanitization apply identically regardless of which table produced the plan. Since the fix sits in the two places both entry points funnel through (`page.tsx`'s subject construction and `email.ts`'s send function), it protects both without any plan-source-specific logic.

# Files Modified

- `src/app/(dashboard)/dashboard/consultation/page.tsx` — added `sanitizeForSubject()` and applied it to `planName` and to the final `defaultSubject`.
- `src/lib/email.ts` — `sendContactNotification()` now sanitizes its `subject` parameter (renamed the destructured field to `rawSubject`, derives a cleaned local `subject`) before using it in either email.

No other files changed. The anonymous Contact Us form, the `Promise.allSettled` structure, and the Property Owner/Investor/Tenant flows were not touched. No commit, push, or deploy performed.

# Expected Result

A `plan` value containing a line break — whether from the normal button click (which never produces one), a manually edited URL, or any other source — can no longer reach Resend as part of the email subject; it's collapsed to a space before the `<textarea>` is even rendered, and stripped again as a last resort inside `sendContactNotification()` regardless of caller. The 422 `validation_error` this specific case was hitting can no longer occur from this cause, so both the commercial notification and the customer confirmation should send successfully again for the "Schedule a Consultation" flow, for a plan sourced from either Sales Leak Diagnosis or Client Acquisition. If Vercel logs still show a 422 (or any other) failure after this, it would point to a different, not-yet-seen validation issue rather than this one — the `Promise.allSettled` + per-email error logging from the prior fix remains in place to surface it.
