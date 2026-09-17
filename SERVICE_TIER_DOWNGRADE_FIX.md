# Service Tier Downgrade Fix

## Root Cause

`profileOwner()` in [src/lib/profiling.ts](src/lib/profiling.ts) computed the new tier using the user's **current/existing role** as an input to the decision, instead of deriving it purely from the current property count. Two sticky conditions were found:

```ts
const isCurrentlyInvestor = currentRole === "inversionista";
const isCurrentlyOwner = currentRole === "propietario" || currentRole === "propietario_preferido";
```

```ts
if (isCurrentlyInvestor || propertyCount >= 4) {
  role = "inversionista";
  serviceTier = "elite";
} else if (isCurrentlyOwner) {
  ...
}
```

`isCurrentlyInvestor` short-circuited the top branch: once a user's stored role was `"inversionista"`, they stayed classified as Elite regardless of how far `propertyCount` had dropped — even to 1. This is the confirmed live bug (Investor dropped to 3 properties, stayed Elite instead of downgrading to Preferred Owners).

`isCurrentlyOwner` had the same shape one level down: it gated the Basic/Preferred split on "is the stored role already an owner-type role," which happened to still recompute correctly from `propertyCount` inside that branch (2-3 → preferred, else → basic) — but only because `isCurrentlyOwner` itself doesn't distinguish preferred from basic. The real risk this pattern created is at the Elite boundary above it, and the same "gate the branch off the stored role" shape is exactly what caused the Elite bug — so it was replaced along with it rather than left as a second latent copy of the pattern.

## Fix Implemented

Both sticky conditions were removed from the tier-decision. `currentRole` is now used **only** as a one-time guard (renamed `isOwnerRole`) to confirm the profile is owner-type before this function is allowed to touch it — preventing a Tenant/PYME/missing-role profile from ever being turned into an owner. It no longer participates in choosing *which* owner tier to assign.

Tier assignment is now a single, pure, stateless three-way split on `propertyCount` alone, evaluated fresh every call:

```ts
if (propertyCount >= 4) {
  role = "inversionista";
  serviceTier = "elite";
} else if (propertyCount >= 2) {
  role = "propietario_preferido";
  serviceTier = "preferred_owners";
} else {
  role = "propietario";
  serviceTier = "basic";
}
```

No branch here references the profile's prior role or tier. Same thresholds as before (1 → Basic, 2-3 → Preferred Owners, 4+ → Elite) — only the stickiness was removed.

## Tier-Specific Fields Cleared On Downgrade

- **Elite fields (`elite_tier`, `cfp_monthly`, `payback_months`)**: already conditionally null — the per-property loop only populates `propEliteTier`/`cfp`/`paybackMonths` when `serviceTier === "elite"`; otherwise they stay at their `null` defaults and are written as `NULL` on every property row via the existing `.update()` call. This logic was untouched and now works correctly for every property because `serviceTier` itself is no longer stale.
- **Preferred Owners fields**: checked the `Property` type ([src/types/database.ts](src/types/database.ts)) and the migration that introduced the tier (`migration_v2_mvp.sql`) — Preferred Owners has no tier-specific columns of its own (no per-property fields beyond the shared `service_tier`). There is nothing additional to clear when downgrading to Basic.

## Property Deletion Trigger Checked

Already existed — no gap here. [src/components/property/delete-property-button.tsx](src/components/property/delete-property-button.tsx) already calls `POST /api/profiling` with `{ type: "owner" }` immediately after a successful property deletion (step 3 in `handleDelete`), before refreshing the page. The confirmed live bug was not a missing trigger — profiling *was* being re-run on every deletion, but the sticky `isCurrentlyInvestor` condition inside `profileOwner()` made that re-run a no-op for downgrades. No new call was added; only the stale-tier logic it fed into was fixed.

## Upgrade Path Confirmed Still Working

Upgrades were never gated by the removed conditions (`isCurrentlyInvestor`/`isCurrentlyOwner` only ever *blocked* a move to a lower tier that the count already justified — they never blocked a move up). With the new pure `propertyCount` split:
- Basic (1) → Preferred Owners (2-3): fires as soon as `propertyCount >= 2`, unconditionally.
- Preferred Owners (2-3) → Elite (4+): fires as soon as `propertyCount >= 4`, unconditionally.

Both are unchanged in behavior from before this fix, since the count thresholds themselves were never touched.

## Multi-Property-Drop Case Confirmed

The new logic re-evaluates `propertyCount` fresh on every call with no dependency on how many properties changed or what the prior tier was, so single-step and multi-step drops behave identically: 4→3 lands on Preferred Owners, 3→1 or 4→1 lands on Basic, in one profiling run, with no intermediate stale state possible. (Searched the codebase for a bulk-delete-properties feature — none exists today; only single-property deletion via `DeletePropertyButton`, which already re-runs profiling per deletion.)

## Files Modified

- [src/lib/profiling.ts](src/lib/profiling.ts) — removed `isCurrentlyInvestor`/`isCurrentlyOwner` sticky conditions from `profileOwner()`; replaced with a stateless `propertyCount`-only tier split, keeping a role guard (`isOwnerRole`) that only decides *whether* this function may act, never *which* tier it assigns.

## Expected Result

`profileOwner()` now recomputes `role`/`serviceTier` from scratch every time it runs, based solely on the caller's current property count:
- 1 property → Basic, always — including for a user who was previously Preferred Owners or Elite.
- 2-3 properties → Preferred Owners, always — including for a user who was previously Elite.
- 4+ properties → Elite, always.

Since property deletion already re-runs profiling, downgrades at any threshold (Elite→Preferred, Elite→Basic, Preferred→Basic) now take effect immediately on deletion, and the corresponding per-property Elite fields are nulled out in the same update. Upgrades continue to work exactly as before.
