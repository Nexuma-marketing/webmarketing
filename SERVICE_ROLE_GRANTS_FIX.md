# Root Cause Confirmed

Live Vercel diagnostic logs confirmed that the Stripe webhook's `supabaseAdmin` client reaches PostgreSQL as `service_role` but lacks required base table privileges:

- INSERT on `public.payments`: `"permission denied for table payments"` (code `42501`). Postgres hint: `"GRANT INSERT ON public.payments TO service_role;"`
- SELECT on `public.services`: `"permission denied for table services"` (code `42501`). Postgres hint: `"GRANT SELECT ON public.services TO service_role;"`

# Grants Verified Missing

The live logs directly verify these missing grants:

| Table | Privilege | Verification result |
| --- | --- | --- |
| `payments` | `INSERT` | Confirmed missing by live error `42501` |
| `services` | `SELECT` | Confirmed missing by live error `42501` |

No live Supabase/Postgres connection is available in this workspace, so the current state of the other required grants could not truthfully be reported as a live query result during authoring. The migration therefore begins by querying `information_schema.role_table_grants` for `grantee = 'service_role'` across every required table/privilege. Its conditional block repeats that metadata check for each privilege and grants only those found absent. A final query reports the post-grant state.

The checked-in webhook proves the following privilege requirements:

| Table | Required privileges | Webhook operations |
| --- | --- | --- |
| `payments` | `SELECT`, `INSERT`, `UPDATE` | Counts installments, inserts payment/event rows, and updates failed/refunded/canceled statuses |
| `services` | `SELECT` | Reads service names for email context and the Founders-package match |
| `app_config` | `SELECT`, `UPDATE` | Reads and increments `founders_plan/taken` |
| `leads` | `UPDATE` | Changes the paid user's lead status to `en_proceso` |
| `properties` | `SELECT`, `UPDATE` | Reads `owner_id` and updates balance-invoice status |

# Exact Grants Added

The migration conditionally adds only missing privileges from this exact set:

```sql
payments:   SELECT, INSERT, UPDATE
services:   SELECT
app_config: SELECT, UPDATE
leads:      UPDATE
properties: SELECT, UPDATE
```

`payments` requires `SELECT` and `UPDATE` in addition to the confirmed missing `INSERT`: the checked-in webhook counts existing installment payments and updates payment statuses. `properties` requires `SELECT` in addition to `UPDATE` because the successful plan-balance invoice path reads `owner_id` before inserting the corresponding payment.

# Migration File Created

`supabase/migration_v44_service_role_webhook_grants.sql`

This follows migration v43 and is explicitly documented as the project's first `service_role` base table grants fix. It contains the exact live errors and Postgres hints in its header.

# What Was Intentionally Not Changed

No RLS policy was added, removed, or modified. Nothing was granted to `authenticated` or `anon`. No application code or temporary `[webhook-diag]` logging was changed. No unlisted table is included. The migration was not applied, and nothing was committed, pushed, or deployed.

# How To Apply

1. Open the Supabase Dashboard for the correct project and go to **SQL Editor**.
2. Open `supabase/migration_v44_service_role_webhook_grants.sql` from this repository and copy its complete contents into a new query.
3. Run the query once. The first result set shows which required grants were present before the fix. The migration then grants only missing privileges. The final result set should show `is_present = true` for all nine required table/privilege combinations.
4. Trigger a new real Stripe test payment and inspect the temporary `[webhook-diag]` Vercel logs and affected database rows.

# Expected Result

The `service_role`-backed webhook can perform every checked-in operation it needs on the five listed tables. A completed Checkout Session can insert its `payments` row, read the service, read and update the Founders counter, and update the lead status. Recurring, failure, refund, cancellation, and plan-balance webhook paths retain the minimum base privileges their existing code requires. RLS policies remain untouched.
