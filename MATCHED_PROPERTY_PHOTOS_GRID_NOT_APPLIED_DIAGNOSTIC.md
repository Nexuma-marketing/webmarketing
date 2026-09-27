# Content of matched-property-card.tsx (photo section, as committed)

The working tree and `HEAD` (`bf2ac56`) contain the same photo renderer at `src/components/tenant/matched-property-card.tsx:103-127`:

```tsx
{/* Image gallery (all photos by room, smaller aspect) */}
{images.length > 0 ? (
  <div className="space-y-3 p-4 bg-muted/30">
    {Object.entries(imagesByRoom).map(([room, roomImgs]) => (
      <div key={room}>
        <p className="text-xs font-medium text-muted-foreground mb-1.5">
          {room} ({roomImgs.length})
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {roomImgs.map((img, i) => (
            <div key={i} className="aspect-[4/3] overflow-hidden rounded-md bg-background">
              <img
                src={img.image_url}
                alt={`${room} ${i + 1}`}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </div>
          ))}
        </div>
      </div>
    ))}
  </div>
) : (
  // empty state
)}
```

The responsive grid classes are therefore present in the committed component. The commit changed the previous `grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5` classes to `grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3`.

# Actual Component Rendering Tenant Matched Properties On Live Pages

`/dashboard` does not render matched-property photos. It computes only the match count at `src/app/(dashboard)/dashboard/page.tsx:94-99` and renders a link at lines 165-178 to `/dashboard/services#matched-properties`.

`/dashboard/services` is the actual matched-property page:

- It imports `MatchedPropertyCard` from `@/components/tenant/matched-property-card` at line 30.
- It loads every non-rejected matched-property image at lines 471-493.
- It renders each matched property through `<MatchedPropertyCard>` at lines 1206-1225 and passes that property's image array through the `images` prop.

Therefore, the reported fix was not applied to an unused component. The live matched-property list is rendered by this exact component.

# Other Candidate Components Found

No second tenant matched-property photo-list renderer was found. The only use of `MatchedPropertyCard` is the one in `/dashboard/services`.

Other customer-facing property image renderers are owner/investor views, not alternate tenant matched-property implementations:

- `src/app/(dashboard)/dashboard/properties/[id]/page.tsx:273-292` groups property images by room and gives each room its own responsive grid.
- `src/app/(dashboard)/dashboard/images/page.tsx:536-554` groups upload-management images by category and gives each category its own responsive grid.
- `src/app/(dashboard)/dashboard/properties/page.tsx` renders one thumbnail per property rather than a photo list.

# Root Cause Assessment

There is no page/component wiring mismatch. The likely layout issue is inside the implemented grid structure itself:

1. The base class is explicitly `grid-cols-1`. Below Tailwind's `sm` viewport breakpoint, the committed behavior is intentionally one full-width image per row. In that viewport, the result is indistinguishable from the reported stacked layout.
2. Images are grouped by `room_category` before rendering (`matched-property-card.tsx:68-73`). Each room category creates a separate block and a separate grid (`lines 108-126`). Photos from different rooms can never share a row. If the property has one photo per room/category, the UI produces a vertical sequence of independent one-item grids. Even at wider breakpoints, each grid has only one item, so the gallery still reads visually as a category-by-category vertical stack rather than one compact property gallery.
3. The commit only changed column utility classes. It did not change this per-room nested-grid structure. It also changed the base layout from the prior three columns to one column, so it cannot eliminate stacking at mobile widths.

The presence of the classes, confirmed route wiring, and successful deployment of sibling changes rule out the originally suspected unused-component explanation. The implementation did not address the structural reason photos can remain vertically separated.

# Recommended Fix (describe only, do not implement)

The correct tenant file remains `src/components/tenant/matched-property-card.tsx`, specifically the gallery at lines 105-127.

Render one grid for the property's complete `images` array instead of creating a separate grid inside every room-category block. Preserve room information per image with a small caption or overlay. Use the desired responsive columns on that single grid—for example two columns at the base/mobile size and three on a wider breakpoint if the requirement is that multiple photos must appear per row even on the tested viewport.

If room grouping must remain visually explicit, use one outer multi-column grid whose children are individual photos and show the room label on each photo; do not make each room category a full-width wrapper containing its own grid. This directly fixes the one-photo-per-category case without changing photo fetching, storage, approval, or ordering.

Before implementation, compare the reported test viewport width with Tailwind's `sm` breakpoint. If testing was below that breakpoint, `grid-cols-1` alone fully explains the observed one-per-row result. No change is needed in `/dashboard/services` beyond its existing use of `MatchedPropertyCard`.
