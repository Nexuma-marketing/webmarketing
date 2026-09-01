# Fix 1 — Support Tier Default / Premier Tier Secondary (implemented)

Preferred Owners now see **Support Tier** as their sole primary plan card in Services, matching the established primary-plan treatment used for Basic owners. Premier Tier is no longer a side-by-side, equal-weight choice. It is available through the secondary expandable prompt: **“Want to pay in installments? See Premier Tier details.”**

The Dashboard home card continues to show the assigned Support Tier first and now includes a direct secondary link to the Premier Tier details in Services.

# Fix 2 — Payment Wording Clarity (implemented)

The shared Property Owner calculated-price formatter now says **“you would pay approximately”** for both a single property and every property in a multi-property breakdown. Dashboard home and Services both use this formatter for Low Price, Support Tier, and Premier Tier, so the wording is consistent across Basic and Preferred Owner displays.

# Fix 3 — Founders Package Value Proposition Strengthened (implemented)

The shared Founders Package banner now:

- States the lifetime-value proposition: **“Lock in a 30% lifetime rate — as long as you stay with us, this rate never increases.”**
- Keeps the taken/remaining-spots counter prominent.
- Uses an expandable **“See Founders Package details”** section containing the full existing Founders terms checklist.
- Places the existing checkout/contact action inside the expanded details and labels it **“Upgrade to Founders Package”** (or the existing price-aware checkout label).

The same shared banner is used on Dashboard home and Services for all Property Owner tiers, including owners without a completed tier.

# Files Modified

- `src/app/(dashboard)/dashboard/page.tsx`
- `src/app/(dashboard)/dashboard/services/page.tsx`
- `src/components/dashboard/founders-banner.tsx`
- `src/lib/owner-plan-display.ts`
- `PROPERTY_OWNER_PLAN_PRESENTATION_FIXES.md`

# What Was Intentionally Not Changed

No pricing, commission percentages, plan terms, service IDs, Stripe checkout behavior, Investor flow, PYME flow, or database configuration was changed. The Founder, Support, and Premier pricing values and existing checklist content are unchanged; only presentation, wording, and Preferred-plan hierarchy changed.

# Expected Result

Basic and Preferred Property Owners see calculated amounts as payments they would make. Preferred Owners are guided first to their assigned Support Tier, with Premier available only as an intentional installment alternative. Every Property Owner services view and Dashboard home can open Founders Package details, review the complete current terms, see the remaining-spots urgency, and then choose the existing upgrade action.
