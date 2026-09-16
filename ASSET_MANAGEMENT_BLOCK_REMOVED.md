# Fix Implemented (both pages, text repositioned)

The "Asset Management" plan card (heading, description, and the
non-functional "Manage My Assets" CTA — it had no linked Stripe service,
so it silently fell back to a dead `#contact` anchor) only actually
rendered on **Recommended Services**, via the `availablePlans` grid, which
is sourced from `OWNER_TIERS.elite.plans` in
[src/lib/constants.ts](src/lib/constants.ts#L131-L141). Dashboard home
never rendered a plans grid at all (it only reads `ownerPlan.features` and
`ownerPlan.plans` for the Founders/primary-plan lookups), so there was
nothing to remove there — confirmed by grepping the whole `src/` tree for
"Asset Management" / "Manage My Assets" before making any change.

Changes made:

1. **`OWNER_TIERS.elite.plans`** emptied to `[]` — this removes the
   Asset Management card from the "Available Plans" grid on Recommended
   Services (no other tier's `plans` array was touched).
2. Its description content was moved into a new **`serviceNotes`** field
   on the same `elite` tier entry, containing the same three bullet lines
   verbatim:
   - Single plan with 3 investment portfolios based on rent level
   - Includes CFP (Cash Flow Preserved) calculation per property
   - Includes Payback period calculation per property
3. Both **Dashboard home**'s "Your Service Tier" card and **Recommended
   Services**' "Your Service: Elite Assets & Legacy" card now render
   `serviceNotes` as a bullet list — reusing the same `CheckCircle2`
   checkmark + `${tier.color}` styling already used for the
   "Recommendations" and "What's included" lists right next to it — and
   only when `serviceNotes` is present. Since only the `elite` tier has
   `serviceNotes`, this list is a no-op for Property Owner (Basic /
   Preferred Owners) and never renders on their cards.
   - Dashboard home: inserted directly before "What's included in your
     {ownerPlan.name} service".
   - Recommended Services: inserted directly before "Recommendations".

# Spacing/Layout Verified

**Recommended Services** — removing the Asset Management card left the
"Available Plans" heading with nothing underneath it for Investors (the
Founders banner is already hidden for Investor per a prior fix, the plan
grid is now empty, and Elite never had a "Premier Tier" entry). Rather
than leave a dangling empty heading, the entire "Available Plans" section
(heading + Founders banner + plan grid + Premier Tier details) is now
wrapped in `{!isInvestor && (...)}` — unchanged for Property Owner (Basic
still shows Founders banner + grid; Preferred Owners still shows Support
Tier context + Premier Tier details). For Investor, this whole block no
longer renders, so nothing sits under the "Your Service" card except the
per-property "Your Portfolio" breakdown, which is a separate, untouched
Card further down. Since everything lives inside a `space-y-4` flex
container (siblings, not fixed-height slots or absolute positioning), not
rendering the block collapses the gap automatically — no blank space is
left behind.

Also updated the "See the full plan pricing and payment options in the
'Available Plans' section below" helper text inside the "Your Service"
card to only render for `!isInvestor` — for Investor that section no
longer exists below it, so the reference would otherwise point at
nothing.

**Dashboard home** required no layout change: it never rendered an
"Asset Management" block or an "Available Plans" grid, so there was no
gap to close. The new `serviceNotes` list sits inside the existing
`space-y-4` `CardContent`, which spaces it automatically like every other
child in that card.

# Files Modified

- [src/lib/constants.ts](src/lib/constants.ts#L131-L141) — `OWNER_TIERS.elite.plans` emptied to `[]`; added `serviceNotes` field
  (and its optional type) with the same three bullet lines.
- [src/app/(dashboard)/dashboard/page.tsx](src/app/(dashboard)/dashboard/page.tsx#L394-L403) — added the `serviceNotes` bullet list to the "Your Service Tier"
  card, before "What's included in your {ownerPlan.name} service".
- [src/app/(dashboard)/dashboard/services/page.tsx](src/app/(dashboard)/dashboard/services/page.tsx) — added the `serviceNotes` bullet list to the "Your Service" card
  (before "Recommendations"); wrapped the "Available Plans"
  heading/Founders banner/grid/Premier Tier block in `{!isInvestor && (...)}`;
  gated the "See the full plan pricing... below" helper paragraph on
  `!isInvestor`.

# Expected Result

- **Investor**: no "Asset Management" card and no dead "Manage My Assets"
  button anywhere. The "Your Service: Elite Assets & Legacy" card (both
  pages) now opens with the three bullet points as introductory text,
  directly above "Recommendations" / "What's included". On Recommended
  Services, the "Available Plans" heading and its (now-empty) grid no
  longer render for Investor — the per-property "Your Portfolio"
  breakdown sits directly below the "Your Service" card with no gap.
- **Property Owner** (Basic / Preferred Owners): completely unaffected —
  Founders banner, plan grid (Low Price / Support Tier), and Premier Tier
  details all render exactly as before, since `!isInvestor` is `true` for
  them and `serviceNotes` is `undefined` for their tiers.
- **PYME**: unaffected — never touched this code path.
