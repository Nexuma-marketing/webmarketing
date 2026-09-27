# Save Preferences Handler — Current Email Behavior (exists but broken, or never implemented)

Email sending is implemented, but broken on the server route that the Tenant Preferences form calls.

The Step 5 `Save Preferences` button in `src/app/forms/inquilino/page.tsx` submits through React Hook Form to `onSubmit`. That handler:

1. Gets the authenticated user.
2. Selects an existing `tenant_preferences` row and either updates it or inserts a new one.
3. Calls profiling and lead side effects.
4. Awaits a `POST` to `/api/tenant-submit-email` with the preference summary.
5. Redirects to `/dashboard`.

The same `onSubmit` function is used for both scenarios. The only branch is the database write (`UPDATE` for an existing preferences row, `INSERT` for a new row); both branches continue to the email request. The comments in the handler explicitly state the intent: “Send email to commercial + confirmation to tenant.”

The called route, `src/app/api/tenant-submit-email/route.ts`, also explicitly states its intent: “Send email when Tenant completes preferences form.” It creates two `resend.emails.send(...)` promises, one for the commercial recipient and one for the authenticated tenant, but attaches `.catch(...)` to each without `await`ing either promise. It then immediately returns `{ success: true }`.

Consequently, the browser successfully awaits only the route's early JSON response, not completion of the actual Resend calls. In a serverless deployment, the request can finish and the function can be frozen before either un-awaited send reaches Resend. Rejections are also only logged in the server runtime and never cause a non-success response to the browser. The client itself additionally catches fetch errors and continues to `/dashboard`, without checking `response.ok`, so it does not surface a route failure to the user.

The MVP specification in `guide-1.md`, section 1.7, lists “Tenant form submitted” as requiring both a client confirmation email and a commercial-team new-lead alert. This establishes that email is expected for the preferences submission path; it is not an unimplemented feature.

# Comparison With Working "Apply for Free" Email Flow

`src/components/tenant/matched-property-card.tsx` posts to `/api/apply-property`. That route uses the same Resend configuration pattern and sends to the commercial team plus the tenant, but handles delivery completion differently:

- It creates the send promises in an array.
- It awaits `Promise.allSettled(sends)` before returning a response.
- It logs fulfillment or failure for each recipient.
- It returns `emailSent` based on whether a send fulfilled.

The route includes a comment documenting the exact lifecycle issue: a serverless function can freeze after its response is returned, which kills fire-and-forget sends before the Resend HTTP request completes. `/api/tenant-submit-email` has the pre-fix fire-and-forget pattern that this working route explicitly avoids.

# Root Cause Assessment

The root cause is an existing but un-awaited Resend implementation in `/api/tenant-submit-email`, not a missing email feature and not two separate new-versus-existing tenant failures.

Both first-time registration and later preference updates use the same `onSubmit` handler and unconditionally invoke the same email route after their respective database write. Both therefore reach the same fire-and-forget serverless failure point. The confirmed working Apply for Free flow is strong corroboration that the general Resend configuration and sender setup can work; its awaited sends are the material implementation difference.

# Recommended Fix (describe only, do not implement)

Change only `/api/tenant-submit-email/route.ts` so it retains both `resend.emails.send(...)` promises and awaits them before returning, preferably with `Promise.allSettled` as used by `/api/apply-property`. Record per-recipient success or failure and return a meaningful delivery result. This prevents the serverless lifecycle from ending the invocation before the Resend requests complete.

Optionally, have the client inspect the email-route response and log or surface a non-success result. This is observability/error handling only; it is not necessary to establish the primary delivery fix. The preference persistence, new-versus-update branch, consent logic, profiling, lead creation, and email content/recipients do not need to change for this root cause.
