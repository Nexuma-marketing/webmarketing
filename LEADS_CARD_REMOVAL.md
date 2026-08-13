# Exact Change Made (before/after for the removed query and card)

Before, the shared customer Dashboard declared `leadCount`, executed an unconditional count-style `SELECT` on `leads` for the current user, converted a missing count to zero, and conditionally rendered an **Active Leads** card when that count was positive.

After, the `leadCount` variable, the complete `leads` query, and the complete **Active Leads** card are absent. The now-unused `FileText` icon import was also removed. The file no longer references or queries `leads`.

# File Modified

`src/app/(dashboard)/dashboard/page.tsx`

# What Was Intentionally Not Changed (confirm /admin and leads table/RLS untouched)

All other customer Dashboard queries and cards remain unchanged, including profiles, owner properties, tenant matches, PYME diagnosis, and active services.

No file under `/admin/*` was changed. Internal Admin, Commercial/Sales, Marketing, and Support lead metrics remain untouched. No `leads` table grant, RLS policy, schema, migration, login redirect, or other application file was changed.

# Expected Result

Customers loading `/dashboard` no longer issue a query against `leads`, eliminating that customer-session permission error. Internal users continue to receive lead metrics from the separate `/admin` dashboard exactly as before.
