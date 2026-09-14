# Fix Implemented (match check + email content addition)

## Located flow

`src/app/api/tenant-submit-email/route.ts` — the only caller is
`src/app/forms/inquilino/page.tsx:459`, which POSTs here right after a
tenant submits/updates their preferences. This is the same route covered
by `TENANT_SUBMIT_EMAIL_AWAIT_FIX.md`; that fix (`await`-ing both sends
via `Promise.allSettled`) was not touched.

## Match check added

Before building the two emails, the route now runs a best-effort match
lookup using the request's own authenticated Supabase client (the same
client already used a few lines above to read the tenant's `profiles`
row):

```ts
let propQuery = supabase
  .from("properties")
  .select("address, city, monthly_rent")
  .eq("is_available", true);
if (maxBudgetNum) propQuery = propQuery.lte("monthly_rent", maxBudgetNum);
if (minBudgetNum) propQuery = propQuery.gte("monthly_rent", minBudgetNum);
if (bedroomsNum && bedroomsNum > 0) propQuery = propQuery.gte("bedrooms", bedroomsNum);
```

This deliberately reuses the **exact same filter predicate** as
`src/app/api/admin/tenant-matches/route.ts` (the query behind Admin's
"Tenant Matches" page): budget range with the same
`min_budget ?? floor(max_budget * 0.6)` fallback when `min_budget` isn't
set, plus a bedrooms floor — computed inline here, not imported, since the
admin route doesn't export it as a shared function and the task says not
to change the matching computation itself. Nothing in
`tenant-matches/route.ts` or `profiling.ts` was modified.

This was chosen over calling `matchPropertiesForTenant()` from
`src/lib/profiling.ts` (the tenant-facing "Matched Properties" logic used
on `/dashboard/services`) because that function applies additional
scoring/priority and excludes photo-less listings — it can legitimately
return a different count than what sales sees on `/admin/matches`. Since
the email tells commercial to "review in Tenant Matches," the count in
the email needs to agree with that page, not with the tenant's own view.

The lookup is wrapped in `try/catch`: a failure here is logged and
`matchCount` stays `0`, so it can never block either email from sending.

## Email content addition (commercial only)

When `matchCount > 0`, a highlighted line is appended after the existing
info table in the **commercial** email only:

> ⚠ **This tenant has 2 matched properties** — top match: 123 Main St —
> review in [Tenant Matches](/admin/matches).

- Singular/plural handled ("1 matched property" vs. "N matched
  properties").
- Top match address included when available (first result, sorted by
  `monthly_rent` ascending — same ordering as the admin route).
- Links to `/admin/matches` using the existing `NEXT_PUBLIC_APP_URL` env
  fallback pattern already used elsewhere in this file (e.g. the tenant
  confirmation email's dashboard link).
- When `matchCount === 0`, `matchStatusHtml` is an empty string — the
  email is byte-for-byte unchanged from before in that case, per the
  task's "no change needed" instruction.

The **tenant's own confirmation email** (the second `resend.emails.send`
call in this file) was not touched at all — same subject, same body, same
"See my matched properties" CTA as before.

# Files Modified

- `src/app/api/tenant-submit-email/route.ts` — added the best-effort match
  lookup and `matchStatusHtml`, inserted only into the commercial email's
  HTML. No other file was changed; `admin/tenant-matches/route.ts` and
  `lib/profiling.ts` (matching computation) are untouched.

# Expected Result

- When a tenant with existing matching properties submits/updates their
  preferences, the commercial notification email now shows a clear
  highlighted line with the match count (and top match address when
  available), linking to `/admin/matches`.
- When a tenant has no matches, the commercial email is unchanged from
  before this fix.
- The tenant's own confirmation email is identical to before in both
  cases.
- Property Owner, Investor, and PYME email flows (`owner-submit-email`,
  `pymes-*-email`, `apply-property`, `sendContactNotification`, the
  Stripe payment-lifecycle emails) are untouched.

## Not verified

No `node_modules` are installed in this environment, so I could not run
this route locally or trigger a real Resend send to visually confirm the
rendered HTML email. The added query mirrors an existing, working query
in this codebase (`admin/tenant-matches/route.ts`) verbatim in its filter
logic, and the whole block is wrapped in `try/catch` so a query error
degrades to "no match line shown" rather than breaking email delivery —
but a real end-to-end test (submit `/forms/inquilino` as a tenant with at
least one property in their budget/bedroom range, then check the
commercial inbox) is worth doing before merging.
