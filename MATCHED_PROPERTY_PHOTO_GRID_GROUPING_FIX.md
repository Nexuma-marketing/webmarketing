# Root Cause Confirmed

`MatchedPropertyCard` grouped the supplied photos by `room_category` and rendered a separate grid for every group. Categories with one or few photos therefore produced visually stacked thumbnails.

# Exact Fix Implemented (single grid, room labels preserved)

The tenant matched-property card now maps the existing `images` array directly into one gallery grid. The grid uses two columns at the base breakpoint and three from `sm` upward. Each thumbnail retains its `room_category` as a small, bottom-overlaid label.

The image array is rendered in its supplied order; fetching, storage, approval/rejection behavior, and ordering logic were not changed.

# Owner/Investor Galleries — Same Issue Present? (report only, not fixed here)

Yes. Both inspected gallery components use the same per-room grouping followed by a separate nested image grid:

- `src/app/(dashboard)/dashboard/properties/[id]/page.tsx` builds `imagesByRoom` and maps each room to its own grid.
- `src/app/(dashboard)/dashboard/images/page.tsx` builds `groupedImages` and maps each category to its own card and grid.

Neither component was changed in this task.

# File Modified

- `src/components/tenant/matched-property-card.tsx`

# What Was Intentionally Not Changed

- Photo fetching, storage, supplied array order, approval, and rejection behavior.
- Owner/investor gallery components.
- Any files other than the requested tenant component and this required report.
- No commit, push, or deployment.

# Expected Result

All property photos in a tenant matched-property card display together in one compact gallery, with at least two thumbnails per row on typical mobile widths and three on larger widths. Every thumbnail still identifies its room category.
