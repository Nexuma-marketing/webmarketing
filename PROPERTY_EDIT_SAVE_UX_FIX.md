# Root Cause (why the abrupt navigation happens)

The submit handler is `onSubmit` in [src/components/property/property-edit-form.tsx](src/components/property/property-edit-form.tsx#L275-L349) (the form used at `/dashboard/preferences/[id]`). Immediately after the Supabase `.update()` succeeds and the `/api/profiling` re-run fires, the old code ran:

```ts
router.push("/dashboard/preferences");
router.refresh();
```

with nothing in between. There was no success state at all — only an `error` state existed, shown in a banner on failure. On success, the very next statement after the save was a client-side route change, so the customer's browser left `/dashboard/preferences/[id]` (Step 3 — Photos, the step where "Save Changes" lives) in the same tick the save resolved. There was never a moment where a success message could render, and no way to interact with the photos step they had just reached — the redirect fired before any paint the user could react to.

# Exact Fix Implemented (confirmation shown, navigation behavior)

1. Added a `saved` boolean state (`const [saved, setSaved] = useState(false)`), parallel to the existing `error` state.
2. `onSubmit` no longer calls `router.push(...)` on success. It still calls `router.refresh()` (harmless — refreshes the cached `/dashboard/preferences` list server-side in the background without navigating), then sets `setSaved(true)` and returns, leaving the user on the same page/step.
3. A visible success banner renders at the top of the card content (same spot the error banner already uses): *"Property updated successfully."* (`role="status"` so it's announced by assistive tech too), immediately below `{error && ...}`.
4. The footer's primary button is now state-dependent:
   - Mid-wizard (`step < TOTAL_STEPS`): unchanged — "Next".
   - Final step, not yet saved: unchanged — "Save Changes" / "Saving...".
   - Final step, **just saved** (`saved === true`): the button becomes **"Done — Back to My Properties"**, a plain `type="button"` that calls `router.push("/dashboard/preferences")` only when the customer explicitly clicks it.
5. `saved` resets to `false` whenever the customer moves between steps again (`nextStep`, `prevStep`, and the browser-back `handlePopState` handler all clear it) and at the start of every new `onSubmit` call — so if they go back and edit more, "Save Changes" reappears instead of a stale "Done" button, and a second save shows its own fresh confirmation.

Net effect: after a successful save, the customer sees the confirmation and the still-populated form/photos step, and only leaves the page when they click "Done — Back to My Properties" themselves.

# Photos Step Handling (before and after)

Confirmed by reading the Step 3 render block ([lines 760-795](src/components/property/property-edit-form.tsx#L760-L795)): reaching Step 3 was **already** a deliberate, user-driven action (clicking "Next" from Step 2), and photo management itself was **already** a deliberate, clearly-labeled action — a `<Link href="/dashboard/images?property=..."`> styled as an outline button, literally reading "Manage Photos". There is no `useEffect`, no automatic `router.push`, and no other navigation call anywhere in this component tied to reaching or rendering Step 3. The only "abrupt" navigation in the whole file was the post-submit redirect described above.

**Before**: Step 3 correctly showed existing photos + an explicit "Manage Photos" button — but the instant the customer clicked "Save Changes" on that same step, the whole page (including that button) vanished via an immediate redirect, so in practice they never got a chance to use it after saving.

**After**: no change was needed to the Photos step's own markup or the "Manage Photos" link — it already satisfies "explicit, clearly-labeled action." What changed is that the save no longer redirects the customer away from Step 3, so the existing photos grid and "Manage Photos" button remain visible and clickable right alongside the new success banner after a save completes.

# Files Modified

- `src/components/property/property-edit-form.tsx` — added `saved` state; changed `onSubmit`'s success path to stop navigating and show a confirmation instead; added the success banner; changed the final-step footer button to swap to a deliberate "Done" action once saved; reset `saved` on step navigation (forward, back, and browser back).

# What Was Intentionally Not Changed

- No validation rule, saved field, or the shape of the `.update({...})` payload was touched.
- Stripe, CFP/payback, `service_tier`/`elite_tier` recalculation, and the `/api/profiling` call are untouched — still fired exactly as before, in the same place, same order.
- Objectives logic (`ObjectivesEditor`, `properties.objectives`) is untouched — it already saves and confirms independently of this form, per the prior change.
- `/dashboard/preferences` (the property list page) was not touched — the fix only changes *when* this form navigates there, not the destination page itself.
- The "Manage Photos" `<Link>` and the photos grid markup in Step 3 were left exactly as they were — they already matched the "explicit action" requirement, so nothing needed fixing there.
- Add Property, Tenant, and PYME flows were not touched.
- No commit, push, or deploy was performed.

# Expected Result

- A customer editing a property now sees a green "Property updated successfully." confirmation the moment their save completes, without being yanked off the page.
- They remain on Step 3 (Photos) after saving — the existing photos grid and the "Manage Photos" button stay right where they were, fully usable.
- The only way to leave the page after a save is clicking the new, explicit "Done — Back to My Properties" button.
- If they go back and change something else, the confirmation and "Done" button are replaced by "Save Changes" again until they save once more.
