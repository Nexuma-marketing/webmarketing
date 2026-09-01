# Root Cause (why the checklist became a paragraph)

The Dashboard home plan box rendered the service record’s `description` field, which is paragraph-style text, instead of rendering the plan’s `details` list. The Services page already renders `details` as separate checklist rows.

# Exact Fix Implemented

Dashboard home now finds the selected plan’s `details` list from the shared `OWNER_TIERS` plan definition and renders every item as a separate row with the same `CheckCircle2` checkmark format used on Services. The shared definition supplies the exact existing terms for Low Price, Founders Package, Support Tier, and Premier Tier.

# File(s) Modified

- `src/app/(dashboard)/dashboard/page.tsx`
- `PROPERTY_OWNER_PLAN_TERMS_CHECKLIST_FIX.md`

# What Was Intentionally Not Changed

- The percentage and calculated CAD price line.
- The full “What’s included” feature list.
- Plan terms, pricing, wording, checkout CTA behavior, Services, Investor, and PYME flows.

# Expected Result

The Dashboard home plan detail box shows each applicable plan term on its own checkmarked line, matching the Services-page presentation, while retaining the existing calculated price and purchase CTA.
