# Valid Role Values (schema-confirmed)

The role column is `public.profiles.role`.

In the active sequential migration path, `supabase/migration.sql:9-17` creates `profiles.role` as `TEXT NOT NULL`. `supabase/migration_v9_admin_suite.sql:23-32` drops the earlier `profiles_role_check` constraint and recreates it as:

```sql
CONSTRAINT profiles_role_check CHECK (role IN (
  'propietario', 'propietario_preferido', 'inversionista',
  'inquilino', 'inquilino_premium',
  'pymes',
  'admin', 'marketing', 'sales', 'support'
))
```

Thus the schema-confirmed internal role values are exactly:

- `admin`
- `marketing`
- `sales`
- `support`

“Commercial” is the business label; the stored database value is **`sales`**, not `commercial`.

The repository also contains an older alternate baseline at `supabase/migrations/001_initial_schema.sql`, which defines a `user_role` enum without the later internal roles. The later application migration explicitly expands `profiles_role_check` for internal users, and the runtime code consistently recognizes the four values above. The SQL below assumes the deployed schema includes `migration_v9_admin_suite.sql`, as required by the checked-in internal-team functionality.

# Exact SQL To Assign Admin Role (by email)

First create the user in **Supabase Dashboard > Authentication > Users > Add user**. Then replace only the placeholder email and run this manually in the Supabase SQL Editor:

```sql
UPDATE public.profiles AS p
SET role = 'admin',
    role_locked = true,
    updated_at = now()
FROM auth.users AS u
WHERE p.id = u.id
  AND lower(u.email) = lower('admin-test@example.com')
RETURNING p.id, p.email, p.full_name, p.role, p.role_locked;
```

The `UPDATE ... FROM auth.users` form ties the profile to the Authentication user by UUID while allowing the operator to identify the account by email. `RETURNING` provides an immediate verification row. If it returns zero rows, stop: either the email does not match or the Authentication user did not receive a `profiles` row. Do not insert an unrelated profile or update a different account to compensate.

# Exact SQL To Assign Sales/Commercial Role (by email)

First create the user in **Supabase Dashboard > Authentication > Users > Add user**. Then replace only the placeholder email and run:

```sql
UPDATE public.profiles AS p
SET role = 'sales',
    role_locked = true,
    updated_at = now()
FROM auth.users AS u
WHERE p.id = u.id
  AND lower(u.email) = lower('sales-test@example.com')
RETURNING p.id, p.email, p.full_name, p.role, p.role_locked;
```

Again, “Commercial” maps to `sales`. A zero-row result means the intended profile was not found and should be investigated rather than broadening the `WHERE` clause.

# Other Required Fields (if any)

No additional profile field must be changed for the internal dashboard/sidebar to recognize either role.

- `role` is the field used for authorization and navigation. Middleware selects only `profiles.role` when allowing internal users into `/admin/*` (`src/middleware.ts:59-70`). The dashboard layout selects `full_name, role`, and sidebar items are filtered by the resulting role (`src/app/(dashboard)/layout.tsx:20-48`; `src/components/layout/sidebar.tsx:282-330`).
- `role_locked` is not required to render the dashboard, but it should be set to `true` for a manually assigned internal role. The internal-user creation API does the same (`src/app/api/admin/create-internal-user/route.ts:58-72`), and profiling code respects this flag when deciding whether a role may be changed (`src/lib/profiling.ts:313-332`). Both SQL statements above set it safely.
- `full_name` is `NOT NULL` in the schema (`supabase/migration.sql:12`). The `handle_new_user` trigger creates it from Auth metadata and falls back to an empty string (`supabase/migration_v9_admin_suite.sql:220-239`). A non-empty name is therefore not required for navigation: the dashboard displays `profile.full_name || user.email || "User"` (`src/app/(dashboard)/layout.tsx:37`). Setting a useful name is desirable for display and team lists, but not necessary for access.
- `email` is also `NOT NULL` and is populated by the Auth-user trigger. The role-assignment statements deliberately join on the authoritative `auth.users.id` rather than trusting only the duplicated profile email.
- There is no `is_active` column on `profiles` in the checked-in schema. No such flag is checked for internal dashboard access.

# Login Behavior Per Role (reminder)

The checked-in behavior has a metadata/profile inconsistency that matters specifically for accounts created manually in the Supabase dashboard:

- The login submit handler redirects directly to `/admin` **only when** `user.user_metadata.role === "admin"` (`src/app/(auth)/login/page.tsx:59-67`). It does not query `profiles.role` for this initial destination.
- All other cases—including `sales`, `marketing`, `support`, and an admin whose Auth metadata does not contain `role: "admin"`—are initially redirected to `/dashboard`.
- Once the dashboard renders, it prefers `profiles.role` over Auth metadata (`src/app/(dashboard)/layout.tsx:20-37`). The sidebar therefore exposes the permitted `/admin` navigation for `admin`, `marketing`, `sales`, and `support` (`src/components/layout/sidebar.tsx:97-123`), and middleware permits all four roles into `/admin/*` (`src/middleware.ts:59-70`).

Consequently, under the exact setup described here—create the Authentication user in the dashboard, then update only `profiles`—the safe expectation is:

| Profile role | Initial login destination | Internal navigation afterward |
|---|---|---|
| `admin` | `/dashboard` unless Auth user metadata separately already contains `role: "admin"`; otherwise `/admin` | Sidebar includes Admin Dashboard and all admin items |
| `sales` | `/dashboard` | Sidebar includes Admin Dashboard and the sales-permitted admin items |
| `marketing` | `/dashboard` | Sidebar includes Admin Dashboard and the marketing-permitted admin items |
| `support` | `/dashboard` | Sidebar includes Admin Dashboard and the support-permitted admin items |

This report does not propose or execute any update to `auth.users` metadata. After assigning the profile role, log out and log back in for a clean manual QA session, then use **Admin Dashboard** in the sidebar if the account initially lands on `/dashboard`.
