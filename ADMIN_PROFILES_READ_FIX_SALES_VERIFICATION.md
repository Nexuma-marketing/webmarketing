# Sales Role Flow Traced (exact files/calls, supabaseAdmin vs authenticated client)

The complete checked-in sales flow is:

1. `src/middleware.ts` protects `/admin/*`. It creates a cookie-backed authenticated Supabase client, obtains the signed-in user with `supabase.auth.getUser()`, and reads only that user's own profile role with `.from("profiles").select("role").eq("id", user.id).single()`. A `sales` role passes the internal-role check. This authenticated query does not read any other user's profile.
2. `src/app/(dashboard)/layout.tsx` creates the same kind of authenticated server client. It reads only the caller's own `full_name` and `role` using `.eq("id", user.id)`, then passes that role to `Sidebar`. It also reads branding rows from `site_content`; this is general dashboard layout data, not Tenant Matches data, and its authenticated read access is already handled by the existing site-content grant and RLS migrations.
3. `src/components/layout/sidebar.tsx` receives the resolved role as a prop. Its `Tenant Matches` item points to `/admin/matches` and explicitly includes `sales` in `roles: ["admin", "marketing", "sales", "support"]`. The sidebar does not query `profiles` or any matching-data table to render the item. Its browser Supabase client import is used for session/logout behavior, not Tenant Matches data loading.
4. `src/app/(dashboard)/admin/layout.tsx` uses an authenticated server client to read only the signed-in user's own `role` with `.eq("id", user.id)`. It recognizes `sales` as an internal role and renders the limited-access banner. It does not read other profile rows.
5. `src/app/(dashboard)/admin/matches/page.tsx` does not create or use a Supabase client. Its only data request is browser `fetch("/api/admin/tenant-matches", { cache: "no-store" })`.
6. `src/app/api/admin/tenant-matches/route.ts` first uses the cookie-backed authenticated server client for authentication and authorization. After `supabase.auth.getUser()`, it reads only the caller's own `profiles.role` using `.eq("id", user.id).single()`. Its `READ_ROLES` includes `sales`.
7. After authorization, every cross-user data query for the page uses `supabaseAdmin`, which is constructed with `SUPABASE_SERVICE_ROLE_KEY` in `src/lib/supabase/admin.ts`:
   - All tenant profile rows: `supabaseAdmin.from("profiles")...in("role", ["inquilino", "inquilino_premium"])`.
   - Tenant form data: `supabaseAdmin.from("tenant_preferences")...in("user_id", tenantIds)`.
   - Available property data: `supabaseAdmin.from("properties")...eq("is_available", true)`.
8. The route computes matches in server-side JavaScript and returns one JSON payload. Expanding, searching, and filtering tenant cards afterward are client-side operations over that payload and issue no additional database requests.

Therefore, authenticated-client access within this flow is limited to the sales user's own profile plus existing general layout data. All access to other users' profiles and all related Tenant Matches records consistently goes through `supabaseAdmin`.

# Was A Change Needed (yes/no, with reasoning)

No RLS change was needed for `sales`.

The authenticated `profiles` reads in the flow all constrain the query to `id = auth.uid()`. The existing, unchanged customer self-read policy already permits a sales user to read that user's own profile. Sales does not directly query tenant profile rows through the authenticated database role.

Granting sales the same read-all profile policy as admin would therefore exceed the access needed by the checked-in Tenant Matches implementation. The bulk tenant-profile query, tenant-preferences query, and properties query all execute through the service-role client after the route verifies that the caller has an allowed internal role.

The sidebar currently exposes Tenant Matches not only to `admin` and `sales`, but also to `marketing` and `support`; the route's `READ_ROLES` matches those four roles. This does not require direct authenticated read-all access for any of those non-admin roles because they follow the same own-profile authorization plus service-role data-fetch path.

# Migration File Updated (if applicable)

No update was made to `supabase/migration_v45_admin_profiles_read.sql`.

V45 remains correctly scoped to:

- Restore the table-level `SELECT` privilege required for authenticated requests to reach `profiles` RLS.
- Preserve existing self-read behavior for authenticated users, including sales.
- Provide safe read-all row access only when `public.is_customer_data_admin()` confirms the caller is an admin.
- Remove the unsafe historical admin read-policy variant without changing other `profiles` policies.

# Expected Result For Both Admin and Sales

An admin can directly read all required `profiles` rows through authenticated RLS after v45 is applied, without the table-level `42501` failure or the unsafe recursive admin policy.

A sales user can enter `/admin/matches`, pass middleware and route authorization by reading only their own profile, and receive the complete Tenant Matches payload. Other users' profiles, tenant preferences, and available properties are fetched inside the authorized API route through `supabaseAdmin`, so sales does not need direct read-all RLS access.

No migration was applied, committed, pushed, or deployed as part of this verification.
