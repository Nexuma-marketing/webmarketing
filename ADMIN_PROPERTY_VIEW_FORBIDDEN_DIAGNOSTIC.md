# Forbidden Response Conditions (exact code)

The Properties **View** button sets a property ID in `src/app/(dashboard)/admin/properties/page.tsx`. `PropertyDetailModal` then fetches `GET /api/admin/properties/${propertyId}` from `src/components/admin/property-detail-modal.tsx`.

The focused endpoint is `src/app/api/admin/properties/[id]/route.ts`. It has exactly one path that returns HTTP 403:

```ts
const { data: callerProfile } = await supabase
  .from("profiles")
  .select("role")
  .eq("id", user.id)
  .single();
if (!callerProfile?.role || !INTERNAL_ROLES.includes(callerProfile.role)) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

`INTERNAL_ROLES` is `admin`, `marketing`, `sales`, and `support`. Therefore, a 403 means the request did authenticate a user, but that request's profile lookup either returned no usable profile/role (including a query error, because the error is not handled separately) or returned a role outside that internal-role list. The route returns 401, not 403, when `auth.getUser()` returns no user. A missing property returns 404 (or 500 for a different property query failure), not 403.

# Session/Cookie Freshness Check

Every request to the detail endpoint creates a cookie-context Supabase server client, calls `supabase.auth.getUser()`, and then re-reads `profiles.role` from the database. The endpoint is explicitly `force-dynamic`; it does not cache a role or property result.

This does make the authorization outcome depend on the auth cookies sent with that individual request, but it is not a special detail-endpoint implementation. The Properties list endpoint (`/api/admin/properties`), Images, Payments, Leads, Tenant Matches, and other admin APIs use the same `createClient()` → `auth.getUser()` → `profiles.role` pattern and the same allowed internal roles.

The application middleware also creates a Supabase server client and can write refreshed cookies, but its matcher covers `/dashboard/*`, `/admin/*`, login/register, and one form route. It does **not** cover `/api/*`. The detail API therefore authenticates directly from the cookies it receives; it does not first pass through the middleware's refresh path. This is also true of the compared admin API routes, so no route-specific freshness mismatch was found.

An expired or invalid cookie is expected to produce the route's 401 path. A 403 instead indicates that a valid user was resolved but its role lookup did not authorize that user. The endpoint does not distinguish a failed/missing profile lookup from a genuinely non-internal role, which makes the displayed 403 less diagnostic than it could be.

# Multiple-Tab/Session Conflict Assessment

Multiple ordinary tabs logged in as the **same** account do not create independent Supabase browser sessions; they share the same origin-scoped auth cookies/storage. More importantly, signing into a tenant account in another regular tab of the same browser profile/origin replaces the shared session used by the already-open Admin tab. The Admin page can continue to display its already-loaded table, but a later View click issues a fresh API request with the tenant account's current cookie. That request has a valid user whose `profiles.role` is not internal, and the detail route correctly returns 403.

This exactly fits the reported sequence: a stale-looking Admin tab, a tenant test in another regular tab, a fresh detail fetch failing with Forbidden, then a new Admin login restoring the shared session and resolving the failure. The condition is not a true independent-session conflict—two different accounts cannot remain isolated in normal tabs for the same site. It would not occur if the tenant test was done in an isolated browser profile, a different browser, or a private/incognito window with separate storage.

If the other tab did not sign in as a different account in the same browser storage context, the repository alone cannot prove a token-refresh race. No unique code path or role check in this endpoint supports that explanation, and server/request logs would be needed to distinguish it from an intermittent failed profile query.

# Root Cause Assessment

The strongest code-supported explanation is shared browser authentication state being replaced by the unrelated tenant login. The detail endpoint correctly revalidates the identity and role on click; it does not trust the currently rendered Admin UI. With the tenant session now in the shared cookie jar, its internal-role check returns 403.

There is no evidence of a detail-endpoint-only authorization bug: the same authentication and role-query pattern is used by the Properties list and other admin APIs. There is, however, an observability weakness: a profile lookup error or missing row is collapsed into the identical Forbidden response, so it cannot be differentiated from an actual tenant/owner session based on the current response alone.

# Recommended Fix (describe only, do not implement)

For testing and operations, keep simultaneous Admin and tenant sessions isolated by using separate browser profiles, separate browsers, or an incognito/private window for one account. Do not use two regular tabs on the same site to test different accounts.

For diagnostics and resilience, adjust the shared/admin authorization pattern to handle a profile-query error distinctly, log the authenticated user ID and resolved role server-side (without logging tokens), and return an appropriate error for a missing/failed profile lookup rather than treating all cases as 403. The client can also treat a 401/403 from a fresh modal request as a session-state change and prompt the operator to refresh or sign in again. These changes would improve visibility; they should not weaken the route's current per-request role validation.
