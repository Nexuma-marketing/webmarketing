# Fix Implemented

Same category of issue as `PYME_DASHBOARD_SERVICES_UX_FIX.md` Fix 3: the
"Available Services" stat card on Dashboard home
(`src/app/(dashboard)/dashboard/page.tsx`) ran an unconditional
`SELECT count(*) FROM services WHERE is_active = true` (~19 rows,
dominated by Owner/Investor/PYME plans) and showed that raw count to
every role, including Tenant.

Per `TENANT_SERVICES_AND_CLEANING_FIX.md`, Tenants now genuinely only
have services tagged/relevant to them:

- **Tenant Property Search** — `target_roles = ['inquilino', 'inquilino_premium']`
  (all tenants)
- **Premium Tenant Concierge** — `target_roles = ['inquilino_premium']`
  (Premium tenants only)
- **Cleaning Services** — the new lead-gen card, shown to all tenants

So the accurate count is **2 for a standard Tenant, 3 for a Premium
Tenant** — not a flat 3 for everyone, since Premium Tenant Concierge
specifically doesn't apply to a non-Premium tenant (mirrors the exact
`target_roles` gating already live on `/dashboard/services`, so this stat
never claims a service the tenant can't actually see there).

Changes made:

1. **Skip the platform-wide count query for Tenant too** — extended the
   existing PYME-only skip condition from `if (!isPymesRole)` to
   `if (!isPymesRole && !isTenantRole)`, avoiding the same unnecessary DB
   round trip for Tenant that was already avoided for PYME.
2. **Compute a Tenant-specific count** — inside the existing
   `if (isTenantRole) { ... }` block (which already runs the matched-
   properties lookup), added:
   ```ts
   tenantServiceCount = profile.is_premium_tenant ? 3 : 2;
   ```
3. **Render a Tenant-specific card** — added an `isTenantRole` branch
   between the existing PYME branch and the Owner/Investor fallback
   branch, keeping the "Available Services" title but showing
   `tenantServiceCount` and a subtitle naming the actual services
   ("Property Search, Cleaning Services" or, for Premium tenants,
   "Property Search, Premium Concierge, Cleaning") instead of the generic
   "Active services" label.

The Owner/Investor branch (the final `else`) is untouched — same JSX,
same `serviceCount` query, same "Active services" subtitle as before this
change.

# Files Modified

- `src/app/(dashboard)/dashboard/page.tsx`:
  - Added `let tenantServiceCount = 0;` alongside the existing `serviceCount`.
  - Set `tenantServiceCount` inside the existing `if (isTenantRole)` block.
  - Extended the platform-wide `services` count query's skip condition to
    also exclude Tenant.
  - Added a new `isTenantRole` branch in the stat-card ternary; PYME and
    Owner/Investor branches unchanged.

# Expected Result

- A standard Tenant's Dashboard home now shows **"Available Services: 2"**
  with subtitle "Property Search, Cleaning Services".
- A Premium Tenant's Dashboard home shows **"Available Services: 3"** with
  subtitle "Property Search, Premium Concierge, Cleaning".
- Property Owner and Investor dashboards are unchanged — still show the
  platform-wide `serviceCount` under "Available Services" / "Active
  services", exactly as before.
- PYME dashboards are unchanged (already fixed previously).
- One fewer DB round trip for Tenant requests (the platform-wide services
  count query no longer runs for them), same optimization already applied
  for PYME.

## Not verified

No `node_modules` are installed in this environment, so I could not run a
type-check, build, or the dev server to visually confirm the card for
both a standard and a Premium tenant account. `profile.is_premium_tenant`
is already read elsewhere in this same file (the "Your Tenant Status"
card just below), so the new usage follows an established, working
pattern in this exact component — but a quick smoke test as both a
standard and a Premium tenant is worth doing before merging.
