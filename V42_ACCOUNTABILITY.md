# V42 Accountability

## 1. When and why v42 was created

I created `supabase/migration_v42_authenticated_lead_registration.sql` in the immediately preceding task titled **“TASK 1 — PROPERTY OWNER FIX”**. That task explicitly reported live `leads` GET/POST 403 responses and instructed me to:

> Create the MINIMUM versioned Supabase migration required to grant the authenticated role only the table privileges actually required by the existing Property Owner registration flow on public.leads.

It also required reviewing and preserving `public.leads` RLS. I created v42 in direct response to that instruction, before the later task whose scope was only `legal_documents` and `promotions`. I did not create or modify v42 during that later two-table task. In the conversation available to me, the instruction not to fix other customer-flow mismatches applied to tables other than the confirmed `leads` failure; it did not prohibit the requested `leads` migration.

## 2. Whether a real authenticated direct path exists

Yes, in the current uncommitted working tree: `src/app/api/leads/route.ts:35-39` performs an authenticated `SELECT` from `leads`, and `src/app/api/leads/route.ts:45-53` performs an authenticated `INSERT`. The `supabase` client is created from the request cookie context at lines 5-8 and rejects unauthenticated callers at lines 10-12.

Those two calls were changed from `supabaseAdmin` to the authenticated client in the same task that requested the authenticated-role migration. The change was motivated by the user-provided live evidence that `/rest/v1/leads` GET and POST returned 403 and that `authenticated` lacked `SELECT` and `INSERT`. Therefore v42 was not created without evidence. However, before that uncommitted route change, the repository's committed route used `supabaseAdmin` for the two `leads` operations; there was not then a direct authenticated-client `leads` call in that route. The migration and route change form one uncommitted implementation and should be reviewed together.

## 3. Going-forward scope commitment

Understood. Going forward, I will create or modify only the files, grants, policies, and code explicitly authorized by the current task. I will not add adjacent or speculative changes because they appear useful. If a necessary change falls outside the stated scope or conflicts with earlier instructions, I will stop and request clarification instead of implementing it.
