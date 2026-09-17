# Property Delete Email Notification Fix

## Email Added (customer + commercial content, tier-change detection)

`delete-property-button.tsx` already deletes the property and awaits the `/api/profiling` re-run (confirmed correct in `SERVICE_TIER_DOWNGRADE_FIX.md`), but never emailed anyone about it. A new step now fires right after that profiling call completes, hitting a new route: `POST /api/property-delete-email`.

Two emails are sent, mirroring `property-edit-email`'s recipients:

- **Commercial team** (`COMMERCIAL_AREA_EMAIL`): "Property Removed" (or "Property Removed & Tier Changed" when applicable) with the customer's name/email and the removed property's address/city.
- **Customer** (the authenticated user's own email): "Property removed — Nexuma" confirming the specific property was removed, with a link back to `/dashboard/properties`.

**Tier-change detection**: the new tier is read from the customer's `profiles.role` *after* profiling has already re-run (server-side, authoritative — never trusted from the client), and mapped back to a `PropertyServiceTier` (`propietario` → `basic`, `propietario_preferido` → `preferred_owners`, `inversionista` → `elite`). The tier *before* deletion (`previousTier`) is passed from the client, since by the time this route runs the profile row already reflects the new state and the old one is no longer recoverable server-side — this is the same trust boundary `property-edit-email` already uses for client-supplied `address`/`city`.

- If `previousTier !== newTier`, both emails get an extra block: "Previously **Elite Assets & Legacy**, now **Basic**." plus the new tier's actual current pricing terms (see below) — sent to both the customer and commercial, since the task called out that commercial needs to know about the pricing/structure change too, not just the customer.
- If the tier didn't change (e.g. 3 → 2 properties, still Preferred Owners), the commercial email says so explicitly and the customer email simply omits the tier block, per the task's "just confirm the property was removed" requirement.

Since a property deletion can only ever *reduce* the count, the new tier after a deletion is always `basic` or `preferred_owners` (never `elite`) — so the tier-change block never needs to render Elite's per-property portfolio pricing, only the two tiers `owner-plan-display.ts` already models a primary plan for.

## Reused Pattern/Infrastructure

- **New dedicated route** (`src/app/api/property-delete-email/route.ts`) rather than extending `property-edit-email` in place. Reasoning: the two events are semantically different (an edit vs. a deletion that can also imply a tier/pricing change), and cramming both into one route would mean branching the entire template on a `mode` flag plus threading tier-change data through a route whose job today is simple and correct. A sibling route keeps `property-edit-email` completely untouched (task requirement) while copying its proven shape byte-for-byte:
  - Same `COMMERCIAL_EMAIL` / `FROM_EMAIL` env-driven constants.
  - Same auth check → profile lookup → `RESEND_API_KEY` guard → `Resend` client.
  - Same `Promise.allSettled` + per-recipient `labels` success/failure logging.
  - Same general HTML template style (gradient header for the customer email, table layout for the commercial email).
- **Pricing terms**: reused `OWNER_PRIMARY_PLAN` + `formatOwnerPlanPrice()` from `src/lib/owner-plan-display.ts` (the same functions the dashboard's `PrimaryPlanPricingCard` uses) to compute the new tier's actual current pricing against the customer's *remaining* properties' rents — no hardcoded percentages or copy.
- **Tier display names**: reused `OWNER_TIERS[tier].name` from `src/lib/constants.ts` (e.g. `"Elite Assets & Legacy"`, `"Basic"`, `"Preferred Owners"`) instead of hardcoding tier labels.

## Files Modified

- **Added** [src/app/api/property-delete-email/route.ts](src/app/api/property-delete-email/route.ts) — new email route described above.
- [src/components/property/delete-property-button.tsx](src/components/property/delete-property-button.tsx) — added `address`, `city`, `previousTier` props; added a fire-and-forget call to `/api/property-delete-email` immediately after the existing (unchanged) profiling `await`. Deletion, confirmation dialog, and profiling logic are untouched.
- [src/app/(dashboard)/dashboard/properties/page.tsx](src/app/(dashboard)/dashboard/properties/page.tsx) — passes the new `address`, `city`, `previousTier={property.service_tier}` props to `DeletePropertyButton` (the property row already carries `service_tier` from its existing `select("*")`).

## Expected Result

Deleting a property now always notifies commercial and the customer that the property was removed. If that deletion also dropped the owner across a tier boundary (Elite → Preferred/Basic, or Preferred → Basic), both emails additionally state the old and new tier by name and the new tier's real, current pricing terms (computed from the customer's actual remaining properties, not hardcoded). If the deletion didn't change the tier (still within the same 1 / 2–3 / 4+ bracket), no tier-change language appears — just the removal confirmation.

Not independently verified end-to-end (no `RESEND_API_KEY`/DB access in this sandbox to trigger a real send) — verified by code review against the already-proven `property-edit-email` pattern it mirrors.
