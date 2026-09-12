# Root Cause (difference between anonymous and authenticated flow)

**There is no code-level difference between the two flows that could explain this.** Both the public Contact Us form (`src/app/page.tsx`) and the new authenticated consultation page (`src/app/(dashboard)/dashboard/consultation/page.tsx`) submit the same plain `<form action="/api/contact" method="POST">` with the same field names (`name`, `phone`, `email`, `subject`, `role`) to the exact same route, which calls the exact same `sendContactNotification()` in `src/lib/email.ts` with an identical parameter shape. I checked specifically for:
- **Middleware interference:** `src/middleware.ts`'s `matcher` is `["/dashboard/:path*", "/admin/:path*", "/forms/propietario/add-property", "/login", "/register"]` — `/api/contact` is not in it, so the route runs identically for authenticated and anonymous requests; there's no auth-based branching anywhere in the request path.
- **Role-based email branching:** `role` only feeds the `leads.insert()` call in `route.ts`; `sendContactNotification()` never receives or reads `role` at all, so the hidden `role=pymes` field added by the new page cannot affect which emails send.
- **A second/duplicate implementation:** there is exactly one `sendContactNotification` definition and one call site (`route.ts:81`) — no alternate code path for authenticated callers.

Given that, the "commercial-only-fails-when-authenticated" framing doesn't hold up against the code as written. What I did find, tracing `sendContactNotification()` itself, is a **real, pre-existing bug that both flows share equally**, which fits the symptom described and is the kind of bug most likely to be intermittent/hard to pin to one entry point:

```ts
// before:
await resend.emails.send({ /* 1. commercial */ });   // sequential, same try block
await resend.emails.send({ /* 2. customer   */ });   // never reached if the line above throws
```

Two problems:
1. **Sequential, dependent sends in one `try`:** if the first (commercial) call throws, the second (customer) call is skipped entirely — the two are not actually independent despite reading like two separate steps.
2. **Resend's SDK doesn't throw for most API-level failures.** `resend.emails.send()` (this project pins `resend@^6.11.0`) resolves to `{ data, error }` — an unverified sender domain, a sandbox/test-mode recipient restriction, or a rejected address all come back as a resolved `error` field, not a thrown exception. The old code never inspected `.error` on either call, so a send that silently failed at the Resend API level was still counted as a success and `emailMetrics.succeeded` incremented, `{ ok: true }` returned, and the caller told "email sent."

This is exactly the "fire-and-forget/one-email-only" failure class named in the task, and it's also the one function in this codebase that had **not** been brought in line with the `Promise.allSettled` pattern already used for the four other multi-recipient email flows (`pymes-schedule-rescue`, `apply-property`, `owner-submit-email`, `tenant-submit-email` — all in `src/app/api/*/route.ts`, all send their commercial + customer emails as an array through `Promise.allSettled`).

# Fix Implemented

`src/lib/email.ts` — `sendContactNotification()` rewritten to match the codebase's own established pattern:

```ts
const [commercialResult, customerResult] = await Promise.allSettled([
  resend.emails.send({ /* 1. commercial */ }),
  resend.emails.send({ /* 2. customer   */ }),
]);

const commercialOk = commercialResult.status === "fulfilled" && !commercialResult.value.error;
const customerOk = customerResult.status === "fulfilled" && !customerResult.value.error;
```

- Both sends are now issued together and resolve independently — one failing (thrown or returned-as-`.error`) can no longer suppress or skip the other.
- Each result is checked for **both** a rejected promise **and** a non-null `.error` field, so a silently-failed Resend API call is no longer misreported as a success.
- Failures are logged per-recipient (`"sendContactNotification: commercial email failed:"` / `"...customer email failed:"`) so a partial failure is now visible in server logs and `emailMetrics`, instead of being invisible.
- The function's return contract is unchanged (`{ ok: boolean; reason?: string }`), and `ok` is still `true` only when both sends genuinely succeed — so `route.ts`'s existing `success` vs. `email_pending` redirect logic needed no changes, and a submission where both emails already worked (the normal case for the public form) behaves identically to before.

No changes were made to `route.ts`'s field handling, to the pre-fill/editable-fields/subject logic from the prior task, or to the public Contact Us form's markup/behavior — the fix is entirely inside the one shared function both flows already called.

# Verified For Both Sales Leak Diagnosis and Client Acquisition

The "Schedule a Consultation" button lives in one shared component, `PymesPlanCard` ([src/components/dashboard/pymes-plan-card.tsx](src/components/dashboard/pymes-plan-card.tsx)), rendered wherever `getPymesPlanForUser()` ([src/lib/pymes-plan-display.ts](src/lib/pymes-plan-display.ts)) returns a plan — and that helper already checks **both** `pymes_diagnosis` (Sales Leak) and `pymes_captacion` (Client Acquisition), returning whichever is more recent. Neither the button, the `/dashboard/consultation` page, nor `sendContactNotification()` branch on which table the plan came from — `planDetails.name` is looked up from the same `PYMES_PLANS` constant either way. Since the email fix lives inside the one function both entry points call identically, and neither entry point does anything Sales-Leak- or Client-Acquisition-specific downstream of `getPymesPlanForUser()`, the fix applies uniformly regardless of which flow produced the customer's recommended plan — there was no separate code path to fix or re-verify per flow.

# Files Modified

- `src/lib/email.ts` — `sendContactNotification()` refactored to send commercial + customer emails independently via `Promise.allSettled`, and to check each result's `.error` field rather than relying solely on whether the call threw.

No other files changed. `src/app/api/contact/route.ts`, `src/app/(dashboard)/dashboard/consultation/page.tsx`, `src/components/dashboard/pymes-plan-card.tsx`, and `src/app/page.tsx` (public form) are untouched by this pass. No commit, push, or deploy performed.

# Expected Result

Both the commercial-team notification and the customer confirmation are now sent as two independent attempts every time `/api/contact` is hit — from the public homepage form, from the new authenticated `/dashboard/consultation` page, and regardless of whether the customer's plan came from Sales Leak Diagnosis or Client Acquisition. If one of the two ever fails (thrown error or a Resend-reported `.error`), the other is no longer silently skipped, the failure is now logged and reflected in `emailMetrics`/`reason`, and the caller gets an accurate `ok`/`email_pending` signal instead of a false "success." Since I could not find any code path where authenticated vs. anonymous actually diverged, if the reported one-email-only symptom persists after this fix, the next step would be checking the Resend dashboard/logs for the actual `.error` payload now being surfaced (e.g. domain verification or sandbox-mode recipient restrictions), since that's now visible instead of swallowed.
