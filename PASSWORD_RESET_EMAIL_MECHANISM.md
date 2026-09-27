# How Password Reset Emails Are Currently Sent (Supabase built-in vs custom/Resend)

The application uses **Supabase Auth's built-in password-recovery email flow**. It does not intercept the password-reset request and does not send the password-reset email through Resend or another application-owned email provider.

On the `/login` page, selecting **Forgot password?** displays an email form. Submitting that form invokes `handleForgotPassword`, which creates the browser Supabase client and calls:

```ts
await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: `${window.location.origin}/auth/confirm?next=/reset-password`,
});
```

That client call goes directly to Supabase Auth. There is no intervening application API route, webhook, `fetch` call, Resend helper, or custom email sender in this request path.

The configured redirect handles the recovery link after the recipient clicks it. `/auth/confirm` verifies the Supabase recovery OTP and redirects to `/reset-password`; the reset page then changes the authenticated user's password with `supabase.auth.updateUser({ password })`. These steps consume the recovery link and update the password, but they do not deliver the email.

A repository-wide search found Resend integration in `src/lib/email.ts` and several application API routes, but no Resend import or call is connected to `handleForgotPassword`, `resetPasswordForEmail`, the auth confirmation routes, or the reset-password page. Those Resend integrations handle other email categories such as contact notifications, payment messages, applications, and form submissions.

# Exact Code Location

- **Forgot-password UI and submit binding:** `src/app/(auth)/login/page.tsx`, lines 92-141. The form uses `onSubmit={handleForgotPassword}` at line 111. The **Forgot password?** control that enables this form is at lines 175-181.
- **Password-reset request:** `src/app/(auth)/login/page.tsx`, lines 71-90. The exact built-in Supabase call is at lines 79-82, with `resetPasswordForEmail` at line 80.
- **Browser Supabase client:** `src/lib/supabase/client.ts`, lines 1-7. It creates an `@supabase/ssr` browser client using `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Recovery-link confirmation:** `src/app/auth/confirm/route.ts`, lines 7-30. It calls `supabase.auth.verifyOtp` at lines 15-18 and sends successful recovery requests to `/reset-password` at lines 20-24.
- **New-password form:** `src/app/(auth)/reset-password/page.tsx`, lines 64-96 and 160-202. It completes the password change with `supabase.auth.updateUser({ password })` at lines 85-88.
- **Other compatible callback handlers present in the repository:** `src/app/api/auth/callback/route.ts` exchanges an auth code for a session at lines 10-35, and `src/app/api/auth/callback-recovery/route.ts` does the same for recovery at lines 9-40. Neither handler sends email or calls Resend. The current forgot-password request explicitly supplies `/auth/confirm?next=/reset-password` as its redirect target.
- **Unrelated custom Resend implementation:** `src/lib/email.ts` imports `Resend` at line 1 and sends contact/payment emails. Other Resend-using API routes exist, but none is referenced by the password-reset flow.

# What Controls Actual Delivery (Supabase Auth SMTP settings vs Resend API)

**Supabase Auth controls actual password-reset email delivery.** Because the application calls Supabase's built-in `resetPasswordForEmail`, Supabase generates and sends the recovery email using the email provider configured for the project's Auth service.

Accordingly, the relevant delivery configuration is in the **Supabase project's Auth email/SMTP settings**: its built-in/default email service or configured custom SMTP provider, together with the Auth email template and allowed redirect URL configuration. Delivery failures, sender identity, SMTP credentials, rate limits, and the recovery template for this flow are therefore controlled by Supabase Auth configuration rather than this application's Resend code.

`RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and the application's `resend.emails.send(...)` calls do **not** control the current password-reset email. Resend would affect this flow only if it were separately configured as Supabase Auth's SMTP provider in the Supabase dashboard; that external dashboard configuration is not represented or verifiable in this repository. Even in that configuration, Supabase Auth—not application-level Resend code—would initiate the recovery email.
