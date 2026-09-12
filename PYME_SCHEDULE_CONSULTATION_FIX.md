# Fix Implemented (pre-fill logic, fields kept editable)

**The button:** `PymesPlanCard`'s "Schedule a Consultation" link ([src/components/dashboard/pymes-plan-card.tsx:87-92](src/components/dashboard/pymes-plan-card.tsx#L87-L92)) pointed to `/dashboard/services#contact` — an anchor to a "Ready to Get Started?" card that itself only links out to `/#contact` (the real public form). That's a dead-end two-hop with no pre-fill, which reads as "does nothing" from a customer's perspective. It now points to:

```tsx
href={`/dashboard/consultation?plan=${encodeURIComponent(planDetails.name)}`}
```

**New page:** [src/app/(dashboard)/dashboard/consultation/page.tsx](<src/app/(dashboard)/dashboard/consultation/page.tsx>) (new file) — a server component, authenticated (redirects to `/login` if no session, same pattern as `/dashboard/services`). It:
- Loads the current user's `profiles.full_name` / `profiles.phone` and `auth` `email`, and renders them as `defaultValue` on ordinary `<Input>` fields — **pre-filled, not disabled or read-only**, so the customer can still edit them for this specific meeting.
- **Skips the "I am a..." role dropdown entirely.** Instead of asking again, a hidden `<input type="hidden" name="role" value="pymes" />` is submitted — the same `role` field the public form already reads, just supplied without a visible picker.
- Pre-fills **Subject** with `Consultation request — {planName} plan` (built from the `?plan=` query param carrying `planDetails.name`, e.g. "Rescue"/"Growth"/"Scale" — the customer's actual plan, not a hardcoded string) inside an ordinary editable `<textarea defaultValue=...>`, identical in kind to the public form's subject field — the customer can freely add or rewrite it.
- Shows the same success/`email_pending`/error banners as the public contact section, driven by the same `?contact=` status values the API route already produces.

# Confirmation Existing Contact Us Email Logic Reused (no duplication)

The new page's `<form action="/api/contact" method="POST">` posts to the exact same route as the public form ([src/app/api/contact/route.ts](src/app/api/contact/route.ts)) — same field names (`name`, `phone`, `email`, `subject`, `role`), same lead insert, same `sendContactNotification()` email call. **Nothing about the lead-saving or email-sending logic was touched.**

One small, backward-compatible addition was needed: the route always redirected to `/?contact=...` (hardcoded to the public homepage), which would silently kick an already-logged-in dashboard customer out to the marketing site after submitting — a real break in the authenticated context, even though the email itself sends correctly either way. Fixed by reading an **optional** `redirect_to` field ([route.ts:31-47](src/app/api/contact/route.ts#L31-L47)):

```ts
let redirectTo = "/";
...
const requestedRedirect = (formData.get("redirect_to") as string | null) || "";
if (requestedRedirect.startsWith("/dashboard")) redirectTo = requestedRedirect;
...
return NextResponse.redirect(new URL(`${redirectTo}?contact=${status}`, request.url), 303);
```

The public contact form (`src/app/page.tsx`) never sends this field, so `redirectTo` stays `"/"` for it — **byte-for-byte the same redirect behavior as before** for anonymous visitors. Only the new authenticated form sends `redirect_to=/dashboard/consultation`, and the value is restricted to paths starting with `/dashboard` so this can't be turned into an open redirect. The lead insert and `sendContactNotification()` call are otherwise completely unmodified and untouched by this change.

# Files Modified

- `src/components/dashboard/pymes-plan-card.tsx` — "Schedule a Consultation" link now points to `/dashboard/consultation?plan=...` instead of the dead-end services anchor. (One shared component, so this fixes both places it's used — see below.)
- `src/app/api/contact/route.ts` — added the optional, path-restricted `redirect_to` field described above; no other logic changed.
- `src/app/(dashboard)/dashboard/consultation/page.tsx` — **new file**: the authenticated, pre-filled consultation form described above.

# What Was Intentionally Not Changed (the other working consultation button)

- The **"Schedule a Free Consultation"** button at the bottom of `/dashboard/services` ([services/page.tsx:1163-1169](<src/app/(dashboard)/dashboard/services/page.tsx#L1163-L1169>)), linking to `/#contact`, is untouched — confirmed working, out of scope per the task.
- The public, anonymous Contact Us form on the homepage (`src/app/page.tsx`) is untouched in markup and behavior; the one shared route it posts to (`/api/contact`) behaves identically for it since it never sends `redirect_to`.
- The "Start Now"/`CheckoutButton` half of `PymesPlanCard` (the payment button next to "Schedule a Consultation") was not touched — only the consultation link.
- Property Owner, Investor, and Tenant flows were not touched — the new page and the route change are additive and PYME-specific (`role` is hardcoded to `"pymes"` only inside the new page; the route's redirect change is inert for every other caller).

# Expected Result

Clicking "Schedule a Consultation" on a PYME customer's recommended-plan card — on both the Dashboard home page and `/dashboard/services` (same shared `PymesPlanCard` component) — now takes them to a dedicated, authenticated consultation page with their name, phone, and email already filled in from their account (still editable), no role question to answer again, and a subject line already naming their actual plan (e.g. "Consultation request — Growth plan", editable). Submitting sends through the exact same lead-insert and email-notification code the public Contact Us form already uses, and the customer lands back on `/dashboard/consultation` with a success confirmation instead of being redirected out to the public marketing homepage.
