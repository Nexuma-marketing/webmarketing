# Fix 1 — Role Preservation Logic Corrected For Investor Promotion

`profileOwner()` now assigns `inversionista` and the `elite` service tier when an owner has four or more properties. Existing investors remain Elite at any property count. The Basic and Preferred Owners behavior for one to three properties is unchanged.

# Fix 2 — Portfolio Lower Boundary Corrected (Lujo Upper Cap Confirmed Intentionally Absent)

Essentials is now limited to rents from $2,500 through $3,999. Signature remains $4,000 through $7,000, and Lujo remains $7,001 and above with no upper cap. For an Elite owner, a property below $2,500 receives no Elite portfolio, CFP, or payback; the owner's Elite assignment based on property count remains unchanged.

# Fix 3 — Elite Monthly Fees Updated ($200 Essentials/Signature)

Essentials and Signature monthly fees are now $200. Their $900 and $1,410 one-time fees are unchanged. Lujo remains $1,650 one-time and $300 monthly. The owner form, customer services page, admin plan display, and editable service descriptions have been aligned.

# Fix 4 — CFP Only Calculated For Elite Properties

CFP and payback are now calculated and stored only when a property has the Elite service tier and qualifies for an Elite portfolio. Non-Elite properties, and Elite-owner properties below the $2,500 minimum, are saved with `elite_tier`, `cfp_monthly`, and `payback_months` cleared.

# Files Modified

- `src/lib/profiling.ts`
- `src/app/forms/propietario/page.tsx`
- `src/app/(dashboard)/dashboard/services/page.tsx`
- `src/app/(dashboard)/admin/plans/page.tsx`
- `supabase/migration_v48_investor_service_assignment_fixes.sql`

# What Was Intentionally Not Changed

- Lujo has no upper rent cap.
- Basic and Preferred Owners behavior for one to three properties is unchanged.
- One-time Elite fees are unchanged.
- Tenant, PYME, and Stripe checkout flows are unchanged.

# Expected Result

An owner who selects Investor or reaches four properties is kept on the Investor/Elite path. Eligible property portfolios and financial values follow the corrected rent boundaries and monthly fees, while ineligible and non-Elite properties do not retain CFP or payback data.
