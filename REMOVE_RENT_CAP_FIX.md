# Root Cause (where the $8,000 cap was defined)

The monthly-rent upper limit was defined in two layers:

- `src/types/forms.ts` applied Zod `.max(8000)` validation to the owner portfolio `rents` array and the Add Property `monthly_rent` field.
- `src/app/forms/propietario/page.tsx` applied `max={8000}`, displayed the `Maximum rent is $8,000 CAD` error, and described the portfolio range as ending at $8,000.
- `src/app/forms/propietario/add-property/page.tsx` applied `max={8000}` to its monthly-rent input.

# Fix Implemented

- Removed the `$8,000` Zod maximum validation from both monthly-rent schemas.
- Removed the `max={8000}` browser constraint from the Property Portfolio and Add Property inputs.
- Removed the portfolio maximum-rent error message.
- Changed the Property Portfolio helper text from `$2,500-$8,000` to `$2,500+` for investors, and from `$300-$8,000` to `$300+` for non-investors.
- Kept the existing investor minimum of `$2,500 CAD` in Step 2. The existing `$300 CAD` minimum for non-investor and Add Property inputs also remains unchanged.

# Files Modified

- `src/types/forms.ts`
- `src/app/forms/propietario/page.tsx`
- `src/app/forms/propietario/add-property/page.tsx`
- `REMOVE_RENT_CAP_FIX.md`

# Expected Result

Owners and investors can enter monthly rents above `$8,000 CAD` in both the Property Portfolio step and the Add Property form. Investor portfolio entries below `$2,500 CAD` continue to be rejected; the other existing `$300 CAD` minimum remains in effect.
