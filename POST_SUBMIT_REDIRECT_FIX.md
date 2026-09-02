# Root Cause

The successful submit path in `src/app/forms/propietario/page.tsx` called `router.push("/dashboard/properties")`, which sent users to the My Properties page after completing the six-step Property Portfolio form.

# Fix Implemented

Changed only the successful post-submit redirect destination to `router.push("/dashboard")`.

# File Modified

- `src/app/forms/propietario/page.tsx`
- `POST_SUBMIT_REDIRECT_FIX.md`

# Expected Result

After successfully submitting the Property Portfolio form, Property Owners and Investors are returned to the main Dashboard home page. The update/replace property logic is unchanged.
