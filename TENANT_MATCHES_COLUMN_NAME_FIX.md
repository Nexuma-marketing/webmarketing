# Root Cause Confirmed (actual schema columns vs code's expected columns)

The failing query in `src/app/api/admin/tenant-matches/route.ts` selected `target_zones` from `public.tenant_preferences`. The confirmed live PostgreSQL error establishes that `tenant_preferences.target_zones` does not exist.

The actual multi-zone preference column is `preferred_zones`:

- `supabase/migration_v2_mvp.sql` adds `preferred_zones TEXT[] DEFAULT '{}'` to `tenant_preferences`.
- The current tenant form schema uses `preferred_zones`.
- The current save payload in `src/app/forms/inquilino/page.tsx` writes `preferred_zones: data.preferred_zones` on both insert and update.
- Repository-wide `target_zones` schema references belong to `promotions`, not `tenant_preferences`.

This workspace contains no Supabase URL/key, database connection string, `.env` file, `psql`, or Supabase CLI, so it was not possible to execute a new remote `information_schema.columns` query from this environment without obtaining credentials and connecting to the live database. No live database operation was attempted. The actual name is nevertheless verified consistently by the confirmed live missing-column result, the checked-in table migration, and the production form write path.

The zone/location-related columns established by the checked-in schema and write path are `preferred_city`, the legacy scalar `preferred_zone`, and the current multi-value `preferred_zones`. The Tenant Matches route needs the current `preferred_zones` array.

# All Mismatches Found And Fixed (not just target_zones, if more exist)

One missing-column mismatch was found:

- Incorrect database reference: `target_zones`
- Actual database column written by the tenant form: `preferred_zones`

Every other column in the same SELECT list was checked against the cumulative `tenant_preferences` definitions in the initial schema plus migrations v2, v3, v5, and v7. The budget fields (`min_budget`, `max_budget`), bedroom field (`bedrooms_needed`), location fields, form-detail fields, premium flag, and timestamps all have corresponding schema definitions. No second nonexistent-column mismatch was found.

`preferred_zone` remains in the SELECT because it is a real legacy scalar column defined by the initial schema. The current form does not populate it, but that makes it potentially null or stale—not an invalid column name. Removing it was outside the requested missing-column correction.

# Exact Fix Implemented

The `tenant_preferences` SELECT now uses PostgREST alias syntax:

```ts
target_zones:preferred_zones
```

This makes PostgREST read the real `preferred_zones` database column while returning it under the existing `target_zones` property expected later in this route and by the Tenant Matches page. That preserves the existing API response shape without modifying the page or database schema.

No matching-computation change was necessary. The existing `prefs.target_zones` reference now receives the aliased `preferred_zones` value.

# File Modified

`src/app/api/admin/tenant-matches/route.ts`

The only application-code change is the single SELECT-list replacement from `target_zones` to `target_zones:preferred_zones`.

# What Was Intentionally Not Changed

- No database schema, column, migration, grant, or RLS policy was changed.
- No table other than `tenant_preferences` is affected by the query correction.
- No application file other than the Tenant Matches route was modified.
- The Tenant Matches page and its `target_zones` response-field contract were not changed.
- The legacy `preferred_zone` selection was not removed.
- Query error handling and matching behavior were not changed.
- Nothing was committed, pushed, deployed, or applied to a database.

# Expected Result

The `tenant_preferences` request should no longer fail with PostgreSQL `42703` for `tenant_preferences.target_zones`. It should read the tenant's saved `preferred_zones` array, return it as `target_zones` in the route payload, and allow the existing preference record to populate `has_preferences`, the expanded preference details, and the matching computation instead of incorrectly showing “No preferences yet.”
