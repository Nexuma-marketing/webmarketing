# Leads Grants Fix and Customer Registration Flow Audit

## Scope

This report documents the confirmed `public.leads` permission failure in the Property Owner final-submit flow, the minimum code and versioned database correction, and a static grant audit of the Property Owner, Investor, Tenant, and PYMES/Business Owner customer flows.

Only the confirmed `leads` failure is fixed. Potential mismatches found in other tables are reported but not changed. No commit, push, or production deployment was performed.

## Exact Root Cause of the Current `leads` 403

After the Property Owner flow successfully persists `discovery_briefs`, `properties`, and `consent_logs`, it calls `POST /api/leads`. That route performs two operations on `public.leads`:

1. `SELECT id ... WHERE user_id = auth.uid()` to avoid creating a duplicate lead.
2. `INSERT` of a new lead when none exists.

The confirmed live grant query shows that `authenticated` has only `TRIGGER`, `REFERENCES`, and `TRUNCATE` on `public.leads`; it lacks both `SELECT` and `INSERT`. PostgreSQL checks table privileges before RLS policies can authorize rows, so both lead operations fail with HTTP 403 and `permission denied for table leads`.

The route also used the global `supabaseAdmin` client for the lead lookup and insert. The live requests demonstrate that this Preview client was not reaching PostgreSQL with effective service-role privileges. The route already has a verified cookie-authenticated request client, so the safe customer path is to use that authenticated client and authorize only the caller's own lead through grants plus RLS.

No `UPDATE` occurs in this registration route. No `DELETE` occurs.

## Existing RLS Policies on `public.leads`

Before migration v42, the versioned schema defines:

### `Admins can manage all leads`

```sql
CREATE POLICY "Admins can manage all leads"
  ON leads FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );
```

This permits admin access when the policy condition is true. It does not authorize an ordinary customer to look up their own lead.

### `Service role can insert leads`

```sql
CREATE POLICY "Service role can insert leads"
  ON leads FOR INSERT
  WITH CHECK (TRUE);
```

Despite its name, this original policy has no `TO service_role` scope. RLS policies are permissive by default and combine with `OR`, so granting `INSERT` to `authenticated` while leaving this policy unchanged would allow any authenticated user to insert any lead row, including a row with another user's `user_id`.

The safe migration scopes this existing service policy to `service_role` and adds separate authenticated policies constrained by `auth.uid() = user_id`.

## Migration Created

Filename:

`supabase/migration_v42_authenticated_lead_registration.sql`

### Exact table grants added

```sql
GRANT SELECT, INSERT
  ON TABLE public.leads
  TO authenticated;
```

No `UPDATE` or `DELETE` privilege is granted. `UPDATE` is unnecessary because the final-submit route only looks up and creates a lead. `DELETE` is neither required nor appropriate for a customer registration flow.

### RLS policy changes included for safe grant activation

The migration preserves intended service-role insertion but gives the policy an explicit role scope:

```sql
DROP POLICY IF EXISTS "Service role can insert leads" ON public.leads;
CREATE POLICY "Service role can insert leads"
  ON public.leads FOR INSERT TO service_role
  WITH CHECK (true);
```

It adds own-row customer policies:

```sql
CREATE POLICY "Users can view own lead"
  ON public.leads FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own lead"
  ON public.leads FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
```

The admin policy is unchanged.

## Why These Grants Are Sufficient Without Weakening RLS

Table grants and RLS are separate authorization layers. The new grants allow PostgreSQL to consider the two operations, while RLS still decides which rows the caller may access:

- `SELECT`: an authenticated customer can see only a lead whose `user_id` equals their JWT `auth.uid()`.
- `INSERT`: an authenticated customer can create only a lead whose `user_id` equals their JWT `auth.uid()`.
- `UPDATE`: not granted.
- `DELETE`: not granted.
- Admin behavior: unchanged.
- Service-role insert behavior: preserved and explicitly scoped.

Scoping the former unqualified service policy strengthens the existing boundary. It prevents the new authenticated `INSERT` grant from activating the old unrestricted `WITH CHECK (true)` condition for customer requests.

## Application Change Required to Use the New Authenticated Authorization

`src/app/api/leads/route.ts` now uses its cookie-context authenticated `supabase` client for all three customer-context operations:

- Read the caller's own `profiles` row.
- Look up the caller's own existing `leads` row.
- Insert the caller's own lead.

The `supabaseAdmin` import and its two `leads` calls were removed from this route. This ensures the runtime requests actually carry the authenticated user's JWT so the new grant and own-row policies apply.

The existing duplicate check remains unchanged in behavior: if a lead already exists for the user, the route returns success without another insert.

## Customer Flow Table Audit

This is a static comparison of code operations against grants represented in migrations v39-v42. Auth-trigger internals and third-party services are noted separately where relevant. `S`, `I`, and `U` mean `SELECT`, `INSERT`, and `UPDATE`.

### Shared account-registration operations

All four customer types share:

| Table/resource | Operation | Versioned authenticated grant | Finding |
|---|---:|---:|---|
| `profiles` | Trigger creates row; later customer S/U | S/I/U in v40 | Covered for direct customer operations. Trigger execution is security-definer database behavior. |
| `consent_logs` | I | S/I in v40 | Covered. |

### Property Owner

| Table/resource | Operation in authenticated flow | Versioned grant | Finding |
|---|---:|---:|---|
| `forms_dynamic` | S | S in v40 | Covered. |
| `form_questions` | S | S in v40 | Covered. |
| `legal_documents` | S | No authenticated table grant found | Potential mismatch; see below. |
| `discovery_briefs` | I | S/I/U in v39 | Covered. |
| `properties` | I, then S/U in profiling/dashboard | S/I/U/D in v40 | Covered. |
| `property_images` | I, later S | S/I/U/D in v40 | Covered. |
| `storage.objects` | S/I for property images | S/I in v41 | Covered at table-grant layer; bucket RLS still applies. |
| `profiles` | S/U | S/I/U in v40 | Covered. |
| `leads` | S/I | S/I in new v42 | Fixed; own-row RLS added. |
| `site_content` | S on dashboard layout | S in v41 | Covered. |
| `services` | S on dashboard | S in v41 | Covered. |

### Investor

Investor uses the same owner page and server endpoints, but loops over multiple property/image inserts and assigns the calculated elite tier.

| Table/resource | Operation in authenticated flow | Versioned grant | Finding |
|---|---:|---:|---|
| `forms_dynamic` | S | S in v40 | Covered. |
| `form_questions` | S | S in v40 | Covered. |
| `legal_documents` | S | No authenticated table grant found | Potential mismatch; see below. |
| `discovery_briefs` | I | S/I/U in v39 | Covered. |
| `properties` | multiple I, then S/U | S/I/U/D in v40 | Covered. |
| `property_images` | multiple I, later S | S/I/U/D in v40 | Covered. |
| `storage.objects` | S/I | S/I in v41 | Covered at table-grant layer. |
| `profiles` | S/U | S/I/U in v40 | Covered. |
| `leads` | S/I | S/I in new v42 | Fixed; own-row RLS added. |
| `site_content`, `services` | S on dashboard | S in v41 | Covered. |

The v42 change does not modify owner/investor tier calculation or property persistence.

### Tenant

| Table/resource | Operation in authenticated flow | Versioned grant | Finding |
|---|---:|---:|---|
| `forms_dynamic` | S | S in v40 | Covered. |
| `form_questions` | S | S in v40 | Covered. |
| `legal_documents` | S | No authenticated table grant found | Potential mismatch; see below. |
| `tenant_preferences` | S/I/U | S/I/U in v40 | Covered. |
| `consent_logs` | I | S/I in v40 | Covered. |
| `matching_rules` | S during profiling | S in v41 | Covered. |
| `profiles` | S/U | S/I/U in v40 | Covered. |
| `properties` | S during matching | S/I/U/D in v40 | Covered at grant layer; RLS controls visible listings. |
| `property_images` | S during matching | S/I/U/D in v40 | Covered. |
| `leads` | S/I | S/I in new v42 | The same confirmed mismatch would affect Tenant lead creation; v42 covers the shared route. |
| `site_content`, `services` | S on dashboard | S in v41 | Covered. |

### PYMES / Business Owner

The page exposes two submit paths: client acquisition and business diagnosis.

| Table/resource | Operation in authenticated flow | Versioned grant | Finding |
|---|---:|---:|---|
| `forms_dynamic` | S | S in v40 | Covered. |
| `form_questions` | S | S in v40 | Covered. |
| `pymes_captacion` | I | S/I/U in v40 | Covered. |
| `pymes_diagnosis` | I/S | S/I/U in v40 | Covered. |
| `pymes_plans` | S on diagnosis result/services pages | S in v40 | Covered. |
| `profiles` | S in lead/email/dashboard routes | S/I/U in v40 | Covered. |
| `leads` | S/I | S/I in new v42 | The same confirmed mismatch would affect both PYMES submit paths; v42 covers the shared route. |
| `site_content`, `services`, `app_config` | S on dashboard/services | S in v41 | Covered. |
| `service_recommendations` | S on services page | S in v40 | Covered. |

## Other Concrete Potential Grant Mismatches Detected

### `public.legal_documents` — authenticated `SELECT`

Property Owner/Investor and Tenant forms call `useLegalDocsOverlay()`, which performs authenticated `SELECT type, content, updated_at FROM legal_documents` after the user has registered and reached the form.

The schema has an RLS policy named `Anyone can read legal_documents`, but no versioned `GRANT SELECT ON public.legal_documents TO authenticated` was found in the repository migrations. An RLS policy alone does not supply the base table privilege. This is therefore a concrete code-operation/versioned-grant mismatch that could produce the same table-level `permission denied` pattern.

Per instruction, no `legal_documents` grant or policy was changed. Its failure is currently non-blocking in `useLegalDocsOverlay()` because the hook falls back to hardcoded legal text, but it should be verified during the relevant manual customer-flow tests before any separate migration is considered.

### No other concrete relational-table grant mismatch found in the four audited paths

Against migrations v39-v42, all other direct authenticated table operations identified above have matching base privileges. This statement is limited to the inspected registration, final-submit, immediate result, and customer-dashboard entry paths. It does not assert the live database has every migration applied.

No speculative grants were added for other flows or tables.

## Files Changed

- `src/app/api/leads/route.ts`
- `supabase/migration_v42_authenticated_lead_registration.sql`
- `CODEX_LEADS_GRANTS_AND_CUSTOMER_FLOW_AUDIT.md`

No unrelated pre-existing modified or untracked file was edited.

## Tests and Checks Performed

- Traced the Property Owner/Investor final-submit sequence and shared `/api/leads` route.
- Confirmed the route requires only `SELECT` and `INSERT` on `public.leads`.
- Inspected all versioned `leads` policy definitions and grant references.
- Verified that no versioned authenticated `leads` grant existed before v42.
- Identified and corrected the unsafe interaction between an authenticated `INSERT` grant and the old unscoped `WITH CHECK (true)` service policy.
- Traced the Tenant final-submit, profiling, matching, email, and dashboard-entry reads/writes.
- Traced both PYMES submit paths, result email, result page, and dashboard-entry reads/writes.
- Compared identified operations with the explicit authenticated grants in migrations v39, v40, v41, and the new v42.
- Ran `git diff --check` after implementation; expected result is no whitespace errors.

Full lint, TypeScript, and Next.js build checks cannot run in this workspace because `npm` and installed `node_modules` are unavailable. No live Supabase migration was applied and no Vercel Preview request was executed locally.

## Expected Next Property Owner Vercel Preview Test

After migration v42 is applied to the Preview Supabase database and a Preview build includes the route change:

1. Register a fresh Property Owner and complete onboarding once.
2. `discovery_briefs` POST returns 201.
3. `properties` POST returns 201 and creates exactly one intended property.
4. `consent_logs` POST returns 201.
5. Authenticated `profiles` GET/PATCH operations continue to succeed.
6. `/api/leads` authenticates the request and issues an authenticated own-row `leads` lookup.
7. The `leads` GET succeeds under the new `SELECT` grant and `auth.uid() = user_id` policy. No other user's lead is visible.
8. If no lead exists, the `leads` POST succeeds under the new `INSERT` grant and own-row `WITH CHECK` policy. If a lead already exists, the route returns its existing success response without a duplicate insert.
9. No `permission denied for table leads` entry appears in Supabase logs.
10. The onboarding-calculated service tier remains unchanged.
11. The UI does not show the incomplete-owner-registration error.
12. The authenticated user is redirected to `/dashboard/properties` and sees the saved property.

Do not resubmit an account/property already created by the failing build when validating duplicate behavior; use a fresh test account for the clean end-to-end test.
