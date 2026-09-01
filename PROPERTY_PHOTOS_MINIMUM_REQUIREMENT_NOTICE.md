# Fix Implemented (exact text added, exact location)

Added this visible notice immediately above the shared `ImageUpload` component in **Step 3: Property Photos** of `src/app/forms/propietario/add-property/page.tsx`:

> Required to continue
>
> Upload at least one photo each of the Living Room, Bedroom, Kitchen, Bathroom, and Exterior.

It appears before the existing Photo Guidelines and room-category selector, so the requirement is visible before an owner begins uploading images.

# File Modified

- `src/app/forms/propietario/add-property/page.tsx`
- `PROPERTY_PHOTOS_MINIMUM_REQUIREMENT_NOTICE.md`

# Expected Result

Owners using the four-step Add Property form see the required room categories before uploading photos. The existing validation remains unchanged and continues to prevent advancing until every listed category has at least one photo.
