# Fix Applied To dashboard/properties/[id]/page.tsx

The property details gallery now renders the existing `images` array in one shared grid instead of creating a grid for each room. The grid uses two columns at the base breakpoint and three at `sm` and larger. Each image displays its `room_category` in a bottom overlay, while its existing status badge remains in place.

# Fix Applied To dashboard/images/page.tsx

The image-management gallery now renders one card containing one shared grid of the existing `images` array instead of a separate card and grid for every room category. The grid uses two base columns and three at `sm` and larger. Each image retains its room-category label as a bottom overlay.

# Interactive Functionality Preserved (upload/delete/approve/reorder — confirmed unchanged)

Image fetching and the supplied image order are unchanged. The existing upload flow, status display, delete button and `handleDelete` call, validation-note display, and category information remain unchanged. This page does not add approval, reorder, or category-assignment controls as part of this layout change.

# Files Modified

- `src/app/(dashboard)/dashboard/properties/[id]/page.tsx`
- `src/app/(dashboard)/dashboard/images/page.tsx`
- `OWNER_INVESTOR_PHOTO_GRID_FIX.md` (required report)

# What Was Intentionally Not Changed

- The tenant matched-property card.
- Photo fetching, storage, database ordering, status/approval/rejection logic, uploads, deletion behavior, or validation handling.
- Any components other than the two requested owner/investor galleries.
- No commit, push, or deployment.

# Expected Result

Owner and investor photo galleries show every property image together in a compact grid: at least two thumbnails per row on mobile and three on larger screens. Every thumbnail remains identifiable by room category, and existing management controls continue to work.
