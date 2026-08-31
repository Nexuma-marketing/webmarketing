# Fix 1 — Calculated Dollar Price Display (implemented, per-property logic if applicable)

Percentage-based Property Owner plans now show the calculated CAD amount beside the existing percentage-based pricing. The amount is calculated from the owner’s stored monthly rent. For Preferred Owner Support and Premier plans, Property 1 uses 30% and Properties 2 and 3 use 28%, with each property’s amount shown separately.

# Fix 2 — Correct Full Service Description (implemented, confirms exact source of truth reused)

The Dashboard home card no longer uses the abbreviated “Included highlights” list. It now renders the complete list from the shared `OWNER_TIERS` definition in `src/lib/constants.ts`, which is also imported by the Services page. Services-page admin feature and timing overrides are also applied on Dashboard home, so the two owner views use the same verified feature source and current override values. This removes the incorrect photography claims; the Basic list includes the verified text “Client-uploaded photos with validation.”

# Fix 3 — CFP/Payback Removed From Property Owner Views (implemented, calculation logic preserved for future Investor use)

CFP and Payback displays are now limited to Investor users on Dashboard home, Services, the property list, and property detail pages. Existing stored values and calculation logic were not removed or changed.

# Files Modified

- `src/lib/constants.ts`
- `src/lib/owner-plan-display.ts`
- `src/app/(dashboard)/dashboard/page.tsx`
- `src/app/(dashboard)/dashboard/services/page.tsx`
- `src/app/(dashboard)/dashboard/properties/page.tsx`
- `src/app/(dashboard)/dashboard/properties/[id]/page.tsx`
- `PROPERTY_OWNER_PRICE_CLARITY_FIX.md`

# What Was Intentionally Not Changed

- Plan percentages, fees, payment terms, and Stripe checkout behavior.
- Investor and PYME flows, other than retaining existing Investor-only CFP/Payback presentation.
- CFP/Payback calculation and persistence logic.

# Expected Result

Property Owners see their full, accurate tier feature list and their property-specific approximate CAD price alongside percentage-based plan pricing. Basic and Preferred Owner views no longer show CFP or Payback. Investors retain their CFP/Payback displays.
