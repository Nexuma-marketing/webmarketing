# Fix 1 — Dashboard Home Plan Summary + CTA (implemented)

The Property Owner dashboard now shows the assigned tier, concise included-feature highlights, the matched primary plan's pricing and payment terms, and its existing checkout action. The Basic plan continues to use the existing Stripe `CheckoutButton`; plans without an existing Stripe charge retain their existing contact CTA.

# Fix 2 — Services Page Reordering (implemented)

The assigned service, included features, available plans, pricing, and purchase actions now appear together directly after the Property Owner Services page heading. Active promotions and the secondary service catalog stay below this decision-focused content.

# Fix 3 — Founders Package On Dashboard Home (implemented)

The Dashboard home page now renders the same shared Founders Package banner used by Services, including the live completed-purchase count, spots remaining, and the existing checkout action. The Services banner now also remains visible for every Property Owner tier, as intended.

# Fix 4 — Other Available Services Collapsible Grouping (implemented)

For Property Owners, Other Available Services is now secondary to the assigned plan and split into collapsed Property add-on services, Investor services, and Business services sections. No catalog entries were removed; expanding a section reveals the same service cards and details.

# Files Modified

- `src/app/(dashboard)/dashboard/page.tsx`
- `src/app/(dashboard)/dashboard/services/page.tsx`
- `src/components/dashboard/founders-banner.tsx`
- `src/lib/founders-plan.ts`
- `PROPERTY_OWNER_SERVICES_UX_REORG.md`

# What Was Intentionally Not Changed (including CFP/Payback, deferred)

- Investor and PYME dashboard/services flows were not changed.
- CFP and Payback calculations and display were not changed; their Property Owner/Investor scope remains deferred to the separate testing round.
- Pricing, plan terms, and Stripe checkout behavior were not changed.

# Expected Result

Property Owners can understand and act on their assigned plan immediately from Dashboard home, find the complete service-and-plan decision area near the top of Services, see the live Founders offer in both places, and browse secondary services without an overwhelming expanded catalog.
