# Root Causes Confirmed

Authenticated customers were missing base table-level privileges on customer-facing tables, causing PostgreSQL error `42501` (`permission denied for table ...`) before RLS could evaluate their valid row access.

Several admin policies also queried `profiles` directly. That query could re-enter RLS evaluation on `profiles` and cause PostgreSQL error `42P17` (`infinite recursion detected in policy for relation profiles`). The migration replaces only those direct role lookups with `SECURITY DEFINER` helpers while preserving the existing roles, commands, and row-access rules.

# Tables Fixed (grants added, per table, with exact privileges granted and why)

- `profiles`: `SELECT`, `INSERT`, `UPDATE` because customers have existing policies for their own profile.
- `properties`: `SELECT`, `INSERT`, `UPDATE`, `DELETE` because owners have existing policies for all four operations on their own properties.
- `property_images`: `SELECT`, `INSERT`, `UPDATE`, `DELETE` because owners have an existing `FOR ALL` policy limited to images belonging to their own properties.
- `pymes_captacion`: `SELECT`, `INSERT`, `UPDATE` because customers have existing policies for their own records.
- `pymes_diagnosis`: `SELECT`, `INSERT`, `UPDATE` because customers have existing policies for their own diagnosis.
- `pymes_plans`: `SELECT` only because customers may read active plans but may not modify plan definitions.
- `tenant_preferences`: `SELECT`, `INSERT`, `UPDATE` because tenants have existing policies for their own preferences.
- `consent_logs`: `SELECT`, `INSERT` because customers may read and create their own consent records; there is no customer update or delete policy.
- `forms_dynamic`: `SELECT` only because customers read active form definitions and do not edit them.
- `form_questions`: `SELECT` only because customers read active questions and do not edit them.
- `service_recommendations`: `SELECT` only because customers have an existing policy to read their own recommendations.
- `discovery_briefs`: no grant was repeated because migration v39 already supplies its exact `SELECT`, `INSERT`, and `UPDATE` privileges.

# Tables Fixed (recursion pattern corrected, per table, if applicable)

- `profiles`: the existing admin `SELECT` policy now uses the non-recursive admin helper.
- `properties`: the existing admin `FOR ALL` policy now uses the non-recursive admin helper.
- `property_images`: the existing admin `FOR ALL` policy now uses the non-recursive admin helper.
- `pymes_diagnosis`: the existing admin `SELECT` policy now uses the non-recursive admin helper.
- `pymes_plans`: the existing admin `FOR ALL` policy now uses the non-recursive admin helper.
- `tenant_preferences`: the existing admin `SELECT` policy now uses the non-recursive admin helper.
- `consent_logs`: both existing admin policies retain their original commands and now use the non-recursive admin helper.
- `forms_dynamic`: the existing public active-form `SELECT` and admin/marketing `FOR ALL` policies use a non-recursive helper that preserves both staff roles.
- `form_questions`: the existing public active-question `SELECT` and admin/marketing `FOR ALL` policies use a non-recursive helper that preserves both staff roles.
- `service_recommendations`: the existing admin `FOR ALL` policy now uses the non-recursive admin helper.
- `discovery_briefs`: no policy was changed because migration v38 already replaced its recursive admin lookup.
- `pymes_captacion`: no recursion correction was needed because it has no direct `profiles` admin subquery.

# Tables Excluded By Design (list the explicitly out-of-scope tables and confirm none were touched)

The explicitly out-of-scope tables `app_config`, `articles`, `email_logs`, `legal_documents`, `matching_rules`, `payments`, `promotions`, `services`, and `site_content` were not referenced or changed by the migration.

`leads` was also excluded because its existing policies allow only admin management and service-role insertion, with no direct customer policy.

# Tables Requiring Clarification (if any — with reason)

None. `leads`, `consent_logs`, and `service_recommendations` were unambiguous from their existing policies: `leads` is not directly customer-facing, while customers explicitly read or create their own rows in the other two tables.

# Migration File Created

`supabase/migration_v40_customer_tables_grants_and_recursion.sql`

This is one new, additive migration following migration v39. It was not applied to any database.

# What Was Intentionally Not Changed

No customer ownership condition, allowed role, or policy operation was expanded or reduced. No customer `DELETE` privilege was added except on `properties` and `property_images`, where existing owner policies explicitly allow it. No table privilege was granted to `anon`; the form helper retains executable access for `anon` only so the already-existing public active-form policies continue to work. Grants for `service_role` and `postgres` were not changed.

No application code, table, column, schema structure, existing migration, or out-of-scope table was changed. The existing discovery-brief migrations were not duplicated or edited.

# How To Apply This Migration (step-by-step, plain non-technical language, for the Supabase SQL Editor)

1. Open the project in the Supabase dashboard.
2. Choose **SQL Editor** from the left-hand menu.
3. Open `supabase/migration_v40_customer_tables_grants_and_recursion.sql` in this project and copy all of its contents.
4. In Supabase, create a new SQL query and paste the copied text into it.
5. Click **Run** once.
6. Wait for Supabase to report that the query completed successfully.
7. Test each customer type by signing in, completing its onboarding or diagnostic form, and opening its Dashboard.
8. Confirm that each customer can access only their own data and that an admin can still access all customer data.

# Expected Result

Property Owner, Tenant, Investor Owner, and Company/PYME customers can complete their customer-facing registration, onboarding, and diagnostic flows and reach their Dashboards without table-permission or profiles-recursion errors. RLS continues to limit customers to the rows already allowed by the existing policies. Admin access remains functional and unchanged, while commercial, marketing, admin-only, and internal tables remain untouched.
