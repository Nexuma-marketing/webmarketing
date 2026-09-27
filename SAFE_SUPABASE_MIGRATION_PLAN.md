# Current Database State

The Supabase `public` schema is empty. Supabase-managed schemas exist, and `auth.users` already contains test identities. No existing migration backfills `public.profiles` from pre-existing `auth.users`; the signup trigger created by the base migration affects only future auth-user inserts.

The recovery must therefore preserve `auth.users`, build the public schema in dependency order, avoid purge/cleanup scripts, and separately account for the missing profile rows of existing users. New users created after the trigger is installed will receive profiles normally.

# Foundational Migration

1. `supabase/migration.sql`
   - **Why required:** Creates the foundational application schema.
   - **Creates/changes:** `profiles`, `properties`, `tenant_preferences`, `pymes_diagnosis`, `services`, `service_recommendations`, `leads`, and `payments`; RLS and base policies; `handle_new_user()` and `update_updated_at()`; auth/profile and timestamp triggers; storage-object policies; initial service rows.
   - **Dependency:** None beyond normal Supabase `auth` and `storage` schemas and `gen_random_uuid()` support.
   - **Existing auth-user safety:** Does not delete or update `auth.users`. Its trigger is not retroactive, so existing users still lack profiles.
   - **Important:** It does not create the `property-images` storage bucket. It is also not idempotent and should be run only once against the confirmed empty public schema.

# Required Safe Migration Sequence

The following is the minimum safe sequence for the current MVP. Each file is listed in execution order.

| Order | Migration | Why needed / principal objects | Depends on | Safe with existing `auth.users` |
|---:|---|---|---|---|
| 1 | `migration.sql` | Base tables, policies, auth/profile trigger, timestamp function/triggers, storage policies, initial services. | Supabase managed schemas | Yes; no auth-user mutation, but no backfill. |
| 2 | `migration_v2_mvp.sql` | Expands owner/tenant/PYMES schema and role constraints; creates `property_images`, `discovery_briefs`, `pymes_plans`, `consent_logs`, `email_logs`; adds indexes, policies, plans/services, and updates `handle_new_user()`. | Base tables/functions | Yes. Its service DELETE only replaces the base migration's freshly seeded USD rows; it does not touch auth users. |
| 3 | `migration_v3_forms.sql` | Adds current owner-property, tenant-preference, and discovery-brief form columns, including arrays and location/property details used by current Submit payloads. | v2 (`discovery_briefs`) and base property/tenant tables | Yes. |
| 4 | `migration_v4_captacion.sql` | Creates `pymes_captacion` and owner-scoped RLS for the Business Client Acquisition flow. | `auth.users` | Yes. |
| 5 | `migration_v5_fixes.sql` | Relaxes obsolete PYMES NOT NULL fields, adds missing tenant/property fields, and changes bathroom fields to numeric types required by current forms. | v2–v4/base tables | Yes on the fresh empty public data set. |
| 6 | `migration_v6_cfp_payback.sql` | Adds `properties.payback_months`, used by owner/investor profiling and dashboard displays. | Properties from base/v2 | Yes. |
| 7 | `migration_v7_milestone3.sql` | Creates `app_config`, `promotions`, `site_content`, and `legal_documents`; adds their RLS; adds dashboard count functions and tenant fields. | Profiles and tenant tables | Yes. |
| 8 | `migration_v8_stripe.sql` | Adds Stripe customer/installment fields and indexes required by current payment code. | Profiles/payments | Yes; no auth mutation. |
| 9 | `migration_v9_admin_suite.sql` | Adds `role_locked`, current internal-role constraint, service/promotions fields, `articles`, `matching_rules`, `forms_dynamic`, `form_questions`, their policies/seeds, and the current signup trigger function shape. | v7 plus base/v2 tables | Yes. It updates only public rows and replaces the trigger function for future signups. |
| 10 | `migration_v10_per_tier_features.sql` | Adds current service description/per-tier feature columns; seeds current form definitions/questions and plan/content configuration; adds app-config read policy. | v7 and v9 | Yes. |
| 11 | `migration_v11_steve_4_29_fixes.sql` | Supplies plan timing/features, legal/config/content seeds, business forms, plan services, and corrected consent/app-config policies expected by current admin/dashboard surfaces. | v7–v10 | Yes on a fresh schema; its lead updates cannot affect absent leads. |
| 12 | `migration_v12_steve_4_30_fixes.sql` | Establishes the corrected final form-question sets, legal/config/content values, plan-service rows, and public-read policies that supersede defective earlier seed states. | v7–v11 | Yes in this fresh recovery. It deliberately replaces seeded form questions, but is not a user/auth cleanup migration. Run once at this controlled point. |
| 13 | `migration_v16_to_v19_consolidated.sql` | Applies the final form-option synchronization, legal consent texts, expanded `consent_logs` constraint/policy, and Low Price service in one intended consolidated file. | v2 consent/services, v7 legal docs, v9/v12 forms | Yes. Use this file instead of the separate v16, v17, v18, and v19 files. |
| 14 | `migration_v21_form_options_alignment.sql` | Aligns admin-editable owner/tenant form options with the current public forms. | Consolidated v16–v19 and form tables | Yes. |
| 15 | `migration_v22_restore_stage1_hero.sql` | Aligns `site_content` with the approved current homepage state. | v7 site content | Yes. |
| 16 | `migration_v23_consent_text_cleanup.sql` | Restores production consent text and adds the missing tenant communications consent document. | v7 plus consolidated legal seeds | Yes. |
| 17 | `migration_v24_cities_backfill.sql` | Adds the complete current BC city options used by owner and tenant metadata overlays. | Form tables and synchronized questions | Yes. |
| 18 | `migration_v27_owner_consent_seed.sql` | Adds the three owner consents required by the current Legal Consents step: legal representation, liability limitation, and electronic signature. | `legal_documents` | Yes. |
| 19 | `migration_v28_plan_service_prices.sql` | Sets the safe current Basic owner upfront prices and clarifies Preferred plan descriptions. | Plan service rows from v11/v12/consolidated | Yes. No deletions. |
| 20 | `migration_v29_owner_form_missing_questions.sql` | Adds four current owner-form metadata questions missing from earlier seeds. | `forms_dynamic` and `form_questions` | Yes. |
| 21 | `migration_v30_payments_canceled_refunded.sql` | Adds canceled/refunded payment lifecycle support, timestamps, status constraint, and payment indexes used by current Stripe/admin flows. | Payments base/v8 | Yes on an empty payments table. |
| 22 | `migration_v31_milestone4_final_decisions.sql` | Applies approved current app-config, legal text, and service descriptions without test-account deletion. | v7–v30 seed/config objects | Yes. |
| 23 | `migration_v36_payments_user_id_set_null.sql` | Changes payment ownership to nullable `ON DELETE SET NULL`, preserving financial records if a profile is later removed. | Payments base | Yes; it does not delete profiles or auth users. |
| 24 | `migration_v37_property_balance_invoice.sql` | Adds current property balance-invoice tracking columns used by Stripe invoice/admin flows. | Properties | Yes. |
| 25 | `migration_v38_discovery_briefs_rls.sql` | Replaces only the recursive discovery-brief admin policy check with a security-definer admin predicate while retaining owner insert/select and admin `FOR ALL`. | v2 `discovery_briefs` and base `profiles` | Yes; no auth-user or row mutation. |

The `property-images` bucket must also exist in Supabase Storage and be configured as expected by the application. None of these migrations creates the bucket record; `migration.sql` only installs policies targeting that bucket ID.

# Excluded Migrations and Why

| Migration | Exclusion reason |
|---|---|
| `supabase/migrations/001_initial_schema.sql` | Alternative/overlapping initial schema. Do not run alongside root `migration.sql`. |
| `migration_v8_phase3_polish.sql` | Contains a hard-coded production-email admin promotion and creates a strict lead-transition trigger later removed by v35. Its necessary configuration is supplied by later safe migrations; applying it in recovery adds obsolete behavior. |
| `migration_v13_steve_5_2_fixes.sql` | Historical backfill for legacy NULL-role leads. A fresh public schema has no such leads. |
| `migration_v14_normalize_room_casing.sql` | Historical normalization only; there are no property-image rows in the empty public schema. |
| `migration_v15_clean_test_leads.sql` | Cleanup migration containing explicit lead deletion. Excluded. |
| `migration_v16_form_options_sync.sql` | Superseded by `migration_v16_to_v19_consolidated.sql`. Do not run both. |
| `migration_v17_legal_consent_texts.sql` | Included inside the consolidated v16–v19 migration. |
| `migration_v18_consent_log_expansion.sql` | Included inside the consolidated v16–v19 migration. |
| `migration_v19_low_price_plan.sql` | Included inside the consolidated v16–v19 migration. |
| `migration_v20_renormalize_room_categories.sql` | Historical data normalization; no property-image rows exist yet. |
| `migration_v25_consent_logs_backfill.sql` | Historical inferred-consent backfill. It is unnecessary for a fresh public schema and would manufacture consent rows for existing profiles if profiles were later backfilled. |
| `migration_v26_strip_empty_form_options.sql` | Historical cleanup of malformed option rows. The recovery sequence seeds corrected options directly. |
| `migration_v32_purge_test_accounts.sql` | Explicit destructive profile/test-account purge with cascading application-data deletion. |
| `migration_v33_purge_auth_users.sql` | Explicitly deletes existing `auth.users`; strictly prohibited. |
| `migration_v34_plan_prices_and_orphan_leads.sql` | Mixed migration: includes useful price updates but also explicitly deletes leads for a hard-coded email list, including existing test identities. Unsafe to run as a whole. v28 safely supplies Basic-plan prices; Preferred-plan pricing from v34 remains a noted gap below. |
| `migration_v35_relax_lead_status_transitions.sql` | Only removes the obsolete trigger from excluded `migration_v8_phase3_polish.sql`; unnecessary when v8 phase-polish is not applied. |
| `cleanup_test_data.sql` | Destructive cleanup utility, not a schema migration. |
| `diagnostic_*.sql` | Diagnostic scripts, not migrations; exclude from recovery execution. |

# Existing Auth Users Safety

None of the required migrations deletes or updates `auth.users`. The destructive v33 auth purge is explicitly excluded.

However, preserving auth identities is not the same as making them functional. The base `on_auth_user_created` trigger runs only for users created after installation. Existing test users will have no `profiles` rows, and no safe existing migration performs that backfill. Consequences include:

- Dashboard canonical profile reads return no row.
- Foreign keys from `discovery_briefs`, properties, consent logs, leads, payments, and preferences to `profiles` can reject writes.
- Existing users may authenticate successfully but fail profile-dependent flows.

Under the stated restriction against creating or changing migrations, the sequence cannot resolve that gap. Before treating an existing auth account as usable, its profile must be backfilled through a separately reviewed, non-destructive operation that preserves the same UUID and derives only valid current fields/roles. That operation is outside this report's authorized migration set. New signups after steps 1, 2, and 9 will use the installed/current trigger.

# Objects Required for Current MVP

- **Identity and roles:** `profiles`, expanded role constraint, `role_locked`, current `handle_new_user()` trigger function, profile RLS.
- **Owner onboarding:** `discovery_briefs` plus v3 arrays/fields; properties plus v2–v6 detail/tier/payback fields; v38 discovery RLS correction.
- **Property images:** `property_images`, indexes/RLS, storage-object policies, and the separately created `property-images` bucket.
- **Tenant flow:** expanded `tenant_preferences` columns and policies; property catalog/matching inputs.
- **Business flow:** expanded `pymes_diagnosis`, `pymes_plans`, and `pymes_captacion`.
- **Leads:** base `leads`, expanded role constraint, current statuses, and admin/API policies.
- **Legal consent:** `legal_documents`, `consent_logs`, expanded consent-type constraint, owner/tenant consent seeds, and consent policies.
- **Profiling/configuration:** property tier/CFP/payback fields, `app_config`, `matching_rules`, and form metadata.
- **Dashboard/admin:** `services`, `service_recommendations`, `promotions`, `site_content`, `articles`, dynamic forms/questions, count functions, and internal roles.
- **Payments:** base payments, Stripe identifiers/installment fields, canceled/refunded lifecycle, nullable retained ownership, and property balance-invoice fields.
- **Operational email logging:** `email_logs`; Resend itself remains environment/application configuration rather than a database object.

# Exact Execution Order

```text
1.  supabase/migration.sql
2.  supabase/migration_v2_mvp.sql
3.  supabase/migration_v3_forms.sql
4.  supabase/migration_v4_captacion.sql
5.  supabase/migration_v5_fixes.sql
6.  supabase/migration_v6_cfp_payback.sql
7.  supabase/migration_v7_milestone3.sql
8.  supabase/migration_v8_stripe.sql
9.  supabase/migration_v9_admin_suite.sql
10. supabase/migration_v10_per_tier_features.sql
11. supabase/migration_v11_steve_4_29_fixes.sql
12. supabase/migration_v12_steve_4_30_fixes.sql
13. supabase/migration_v16_to_v19_consolidated.sql
14. supabase/migration_v21_form_options_alignment.sql
15. supabase/migration_v22_restore_stage1_hero.sql
16. supabase/migration_v23_consent_text_cleanup.sql
17. supabase/migration_v24_cities_backfill.sql
18. supabase/migration_v27_owner_consent_seed.sql
19. supabase/migration_v28_plan_service_prices.sql
20. supabase/migration_v29_owner_form_missing_questions.sql
21. supabase/migration_v30_payments_canceled_refunded.sql
22. supabase/migration_v31_milestone4_final_decisions.sql
23. supabase/migration_v36_payments_user_id_set_null.sql
24. supabase/migration_v37_property_balance_invoice.sql
25. supabase/migration_v38_discovery_briefs_rls.sql
```

Do not insert excluded files into this order merely to close numeric gaps.

# Remaining Risks

1. **Existing auth users lack profiles.** This is the largest blocker. No allowed existing migration safely backfills them.
2. **Storage bucket is not created by SQL.** Property image uploads fail until `property-images` exists with the intended public/private configuration.
3. **Base profile/admin RLS recursion remains outside v38.** v38 fixes only `discovery_briefs` admin evaluation. Other policies still query `profiles` and may exhibit the same recursion. This plan does not change other-table RLS because the current approved migration set contains no general safe correction.
4. **v34 is intentionally excluded.** Its Preferred owner plan price updates are bundled with destructive lead deletion. Applying v28 leaves Preferred plan rows at their v28-defined zero-price behavior; producing the later v34 price state requires a future separately reviewed non-destructive migration, which this task prohibited creating.
5. **v12 and the consolidated v16–v19 file replace seeded form rows.** They are safe in the stated empty-schema recovery order but should not be rerun casually after admins begin editing production form metadata.
6. **Migration scripts are not globally transactional or uniformly idempotent.** Each step should be executed and verified individually; do not continue after a failed step.
7. **Policy names on `storage.objects` may already exist independently of `public`.** Because `public` being empty does not prove Storage policies are absent, inspect Storage policies before executing the base script.
8. **No SQL was executed by this analysis.** The plan is based on repository dependencies and destructive-statement review; actual Supabase state should be checked between steps.
