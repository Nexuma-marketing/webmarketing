# Fix 1 — Payback Calculation Root Cause and Fix

The payback numerator was incorrectly the recurring monthly optimization fee: `$200` for Essentials and Signature, and `$300` for the `lujo` tier. That produced `$200 / $320 = 0.625`, displayed as `0.6 months`, rather than the required `$900 / $320 = 2.8125`, displayed as `2.8 months`.

Both calculation paths now use the confirmed formula: `one-time portfolio fee / CFP monthly`.

- Essentials: `$900 / CFP monthly`
- Signature: `$1,410 / CFP monthly`
- Luxury: `$1,650 / CFP monthly`

The owner form calculates the correct value when saving an Investor portfolio, and the profiling path recalculates it correctly on subsequent profiling runs. `supabase/migration_v49_payback_one_time_fee.sql` corrects already-stored Elite payback values using the same formula.

# Fix 2 — "Lujo" to "Luxury" Translation (approach taken: label-only vs data value)

The translation is label-only. The internal `lujo` key, `elite_tier` value, and database enum/check value remain unchanged for compatibility with existing property records and portfolio logic. Customer-facing English labels, pricing copy, portfolio cards, form previews, and property detail output now display `Luxury`.

# Files Modified

- `src/lib/profiling.ts`
- `src/app/forms/propietario/page.tsx`
- `src/lib/constants.ts`
- `src/app/(dashboard)/dashboard/page.tsx`
- `src/app/(dashboard)/dashboard/services/page.tsx`
- `src/app/(dashboard)/dashboard/properties/page.tsx`
- `src/app/(dashboard)/dashboard/properties/[id]/page.tsx`
- `src/app/(dashboard)/admin/plans/page.tsx`
- `supabase/migration_v49_payback_one_time_fee.sql`
- `PAYBACK_CALC_AND_LUJO_TRANSLATION_FIX.md`

# Expected Result

A property with `$320` CFP monthly in Essentials displays `2.8 months` payback (`$900 / $320`). Signature and Luxury use `$1,410` and `$1,650`, respectively, with their existing rent thresholds and monthly fees unchanged. Customers see `Luxury`; stored records continue to use `lujo` internally.
