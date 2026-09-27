# Exact Client Used For The Failing Query (verified code citation)

The failing query definitely uses `supabaseAdmin`, not the authenticated cookie-backed client.

In `src/app/api/admin/tenant-matches/route.ts`, lines 41–45 are exactly:

```ts
const { data: tenants, error: tenantsErr } = await supabaseAdmin
  .from("profiles")
  .select("id, full_name, email, role, phone, created_at")
  .in("role", TENANT_ROLES)
  .order("created_at", { ascending: false });
```

`TENANT_ROLES` is defined at line 23 as:

```ts
const TENANT_ROLES = ["inquilino", "inquilino_premium"];
```

Those statements produce the reported REST query selecting `id,full_name,email,role,phone,created_at` and filtering `role=in.(inquilino,inquilino_premium)`.

The route does also create an authenticated cookie-backed client at line 26, but that client is used only for `auth.getUser()` and the caller's own authorization lookup at lines 31–35:

```ts
const { data: callerProfile } = await supabase
  .from("profiles")
  .select("role")
  .eq("id", user.id)
  .single();
```

That is not the query shown in the failing Supabase log.

# Why supabaseAdmin Would Return 42501, If Applicable

`src/lib/supabase/admin.ts`, lines 3–6, constructs the client as follows:

```ts
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
```

The checked-in construction uses `SUPABASE_SERVICE_ROLE_KEY`, not the anon key.

The important distinction is that the PostgreSQL `service_role` bypasses row-level security, but bypassing RLS does not supply missing base table privileges. PostgreSQL can still reject `service_role` before RLS with `42501 permission denied for table profiles` when that role lacks table-level `SELECT` on `public.profiles`.

This repository has already encountered that exact distinction. `supabase/migration_v44_service_role_webhook_grants.sql` documents service-role `42501` failures and explicitly grants the required table privileges. Its grant list includes `payments`, `services`, `app_config`, `leads`, and `properties`. It does not include `profiles` or `tenant_preferences`.

Migration v45 grants `SELECT` on `public.profiles` to `authenticated`, not to `service_role`. It therefore fixes authenticated admin access but does not repair a missing base `SELECT` privilege for the service-role query used by Tenant Matches.

A missing or incorrect `SUPABASE_SERVICE_ROLE_KEY` in the Preview deployment is technically another way for `supabaseAdmin` not to act as `service_role`, because the TypeScript non-null assertion does not validate an environment variable at runtime. However, the evidence makes that less likely:

- The client construction is shared and has no Tenant Matches-specific variation.
- The working Stripe webhook imports the exact same exported singleton.
- Prior confirmed webhook database operations in this deployment show that the shared key can authenticate service-role operations.
- The checked-in migrations specifically show selective service-role grants for webhook tables while omitting `profiles`.

The strongest explanation is therefore a missing `service_role` table-level `SELECT` privilege on `public.profiles`, not a wrong client or wrong environment key.

The reported "External APIs: 3 GET requests" should not be interpreted as proof that all three bulk Tenant Matches queries ran. Before the route can reach the bulk queries, it calls Supabase for `auth.getUser()` and then reads the caller's profile role. The third request can be the failing bulk `profiles` query. Because the route returns immediately when that query reports an error, it cannot then execute the `tenant_preferences` or `properties` queries in the same invocation.

# Comparison With Working Stripe Webhook's supabaseAdmin Usage

There is no client-construction difference between Tenant Matches and the Stripe webhook:

- `src/app/api/admin/tenant-matches/route.ts` line 3 imports `supabaseAdmin` from `@/lib/supabase/admin`.
- `src/app/api/stripe/webhook/route.ts` line 3 imports the same named singleton from the same module.
- Neither route creates a separate service-role client locally or supplies different credentials.

The material difference is the tables and checked-in grants involved. Migration v44 explicitly grants the service role the webhook's required privileges, including `payments` operations and `SELECT` on `services`, `app_config`, and `properties`. It does not grant service-role `SELECT` on `profiles` or `tenant_preferences`, which Tenant Matches needs.

The webhook also reads `profiles` inside `loadEmailContext()` at lines 25–29, but that helper treats a failed or empty profile lookup as a non-fatal missing email context and returns `null`; its caller can skip email without blocking the payment workflow. Consequently, a webhook being operational does not by itself prove that its optional `profiles` lookup has table access. The webhook's confirmed successful writes do strongly support that the shared service-role key itself is valid.

# Unhandled Exception / 500 Error Cause

The database error is not an unhandled thrown exception in the checked-in route. There is no surrounding `try`/`catch`, but Supabase query failures normally resolve as `{ data, error }`. This specific error is inspected and deliberately converted into an HTTP 500 response at lines 46–50:

```ts
if (tenantsErr) {
  return NextResponse.json(
    { error: `tenants fetch failed: ${tenantsErr.message}` },
    { status: 500 },
  );
}
```

Thus Vercel records `GET 500` because the route explicitly returns status 500 after receiving `42501`. The absence of a top-level `try`/`catch` is not what causes this observed status.

The page then masks the server error as an empty data state. In `src/app/(dashboard)/admin/matches/page.tsx`, lines 87–90, a non-success response runs `setTenants([])` and returns without displaying the response error. All three displayed counts are derived from that empty array, producing the observed zeros.

Errors from the later `tenant_preferences` and `properties` queries are not captured at all because those calls destructure only `data`, not `error`. That is a separate diagnostic concern, but it is not the cause of this invocation: the route exits at the first `profiles` query failure.

# Root Cause Assessment

The exact failing cross-user tenant query uses the correctly constructed, shared `supabaseAdmin` service-role client. The previous verification was correct about which client executes it, but its claim that service-role access could never receive `42501` was incorrect because it conflated RLS bypass with base table privileges.

The most strongly supported root cause is:

1. Tenant Matches uses `service_role` to select from `public.profiles`.
2. The deployed role lacks table-level `SELECT` on `public.profiles`.
3. V45 grants that privilege only to `authenticated`, so it does not affect this service-role request.
4. PostgreSQL rejects the request with `42501` before RLS is relevant.
5. The route catches the returned Supabase error value and deliberately sends HTTP 500; the browser page converts that failed response into an empty tenant array and shows zero counts.

An incorrect Preview `SUPABASE_SERVICE_ROLE_KEY` remains possible in the abstract, but the identical shared client construction and confirmed service-role webhook operations make it materially less consistent with the checked-in and runtime evidence than the missing table grant.

No application code, migration, configuration, or existing report was modified, and no database operation was performed during this diagnostic.
