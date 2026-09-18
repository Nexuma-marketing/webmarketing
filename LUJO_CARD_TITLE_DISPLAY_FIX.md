# Root Cause (title renders raw services.name, no display translation)

`SERVICES_CATALOG_DESCRIPTIONS_FIX.md` corrected the `services.description` text for the Luxury tier's row, but intentionally left `services.name = 'Plan: Elite — Lujo'` untouched, because that exact string is a real lookup key elsewhere:
- `ELITE_SUB_TIERS.lujo.dbServiceName` (`src/lib/constants.ts`) matches against it to resolve the row's price/id.
- The Stripe checkout route (`src/app/api/stripe/checkout/route.ts:213`) compares `assignedTier.dbServiceName === service.name` as a server-side security check before allowing the charge.

The problem: several UI locations render `service.name` **directly as visible text** (a card's `<CardTitle>`, a Stripe line-item's `product_data.name`) with no translation layer in between — so the same raw string that must stay `"Plan: Elite — Lujo"` for matching purposes was also the literal text shown to the customer.

# Fix Implemented (display substitution, lookup key untouched)

Added one small, shared helper — `displayServiceName()` — in `src/lib/constants.ts`, next to `ELITE_SUB_TIERS` (which it reads from, so the two can never drift apart):

```ts
export function displayServiceName(name: string): string {
  if (name === ELITE_SUB_TIERS.lujo.dbServiceName) {
    return `Plan: Elite — ${ELITE_SUB_TIERS.lujo.name}`;
  }
  return name;
}
```

It's a pure display-layer substitution: called only where a name is about to be *shown*, never where it's *compared*. Every lookup/matching site (`ELITE_SUB_TIERS.lujo.dbServiceName`, the checkout security check, `servicesByDbName`/`planServicesByName` maps keyed by the raw name) keeps using the untouched `service.name` value exactly as before — none of that logic was modified.

Placed it in `constants.ts` (rather than duplicating it locally in `services/page.tsx`) so the one Stripe checkout route that also needed it could import the same function instead of maintaining a second copy — consistent with this codebase's existing "don't duplicate a lookup/display rule across files" pattern.

# Other Locations Checked And Fixed

Grepped the codebase for every place a raw `services.name`/`service.name`/`svc.name` value is rendered as visible text (not just used as a key) and applied `displayServiceName()` at each one:

1. **`OtherServiceCard`** ([services/page.tsx](<src/app/(dashboard)/dashboard/services/page.tsx#L85>)) — the "Other Available Services" catalog card title. This was the one named in the task; it's a single shared component used by both the Property Owner/Investor accordion groups and PYME's opt-in grid, so one fix covers both.
2. **Admin-assigned recommendations card** ([services/page.tsx:1052](<src/app/(dashboard)/dashboard/services/page.tsx#L1052>), the "Specially Assigned for You" section) — reachable in practice: an admin could assign this exact service to any customer via `/admin/reassign`, and this section renders whatever they were assigned regardless of role-based targeting.
3. **"Recommended for You" card** ([services/page.tsx:1116](<src/app/(dashboard)/dashboard/services/page.tsx#L1116>), `relevantServices`) — currently unreachable for this specific row in practice (an Investor is the only role whose `target_roles` match it, but Investors are routed away from this block entirely by the existing `!isOwnerRole` gate before reaching it), but fixed defensively so it can't resurface if that gating logic ever changes.
4. **Stripe Checkout product name** ([stripe/checkout/route.ts:292](src/app/api/stripe/checkout/route.ts#L292)) — a genuinely separate, real bug this task's search turned up: the literal product name shown on **Stripe's hosted checkout page and the customer's payment receipt** for an Elite Luxury per-property purchase was built directly from `service.name`, completely independent of the dashboard UI. Fixed to use `displayServiceName(service.name)`; the security check at line 213 (`assignedTier.dbServiceName === service.name`) is a few lines above and was left untouched.

**Checked and confirmed already correct, no change needed:**
- `elite-portfolio-breakdown.tsx` (the Investor's own "Your Portfolio" per-property breakdown, on both Dashboard home and Recommended Services) — already renders `ELITE_SUB_TIERS[elite_tier].name` (`"Luxury"`), never the raw `services.name`.
- The webhook's recurring maintenance-fee subscription product name ([stripe/webhook/route.ts](src/app/api/stripe/webhook/route.ts)) — already built from `tier.name` (`ELITE_SUB_TIERS[metadata.elite_tier].name`), already "Luxury".
- `CheckoutButton`'s default label is a static `"Purchase"`, never derived from `service.name`; every real call site passes its own explicit label built from tier/plan names, not raw service names.
- Admin-only surfaces (`/admin/reassign`'s service dropdown, `/admin/services` table, `/admin/plans` editor) intentionally left showing the raw `"Plan: Elite — Lujo"` name — these are not customer-facing, and an admin managing/searching services needs the literal DB value, not a translated label.

# Files Modified

- `src/lib/constants.ts` — added the shared `displayServiceName()` helper.
- `src/app/(dashboard)/dashboard/services/page.tsx` — imports `displayServiceName`; applied it at all three `CardTitle` render sites listed above.
- `src/app/api/stripe/checkout/route.ts` — imports `displayServiceName`; applied it to the Stripe `product_data.name` for the Elite per-property checkout line item only (the security-check comparison a few lines above is untouched).

# Expected Result

"Lujo" no longer appears anywhere a customer can see it: the "Other Available Services" catalog card, the admin-assigned-service card, the (currently unreachable but now guarded) "Recommended for You" card, and — the one this task's search specifically surfaced — the actual Stripe Checkout page and receipt for an Elite Luxury property purchase all now read "Plan: Elite — Luxury." `services.name` itself remains exactly `'Plan: Elite — Lujo'` in the database, and every lookup/matching/security check that depends on that exact string (tier resolution, the checkout ownership/tier-assignment verification) continues to compare against the untouched raw value.
