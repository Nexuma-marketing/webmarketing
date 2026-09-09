# Root Cause

`src/types/database.ts`'s `Property` interface gained `objectives: string[]` as part of the objectives-per-property change, and `src/types/forms.ts`'s `propertyOnlySchema` (which `propertyEditSchema` is derived from via `.omit(...)`) gained `objectives: z.array(z.string()).default([])`. Because that field has a Zod `.default()`, `z.infer<typeof propertyEditSchema>` makes `objectives: string[]` **required** in the output type `PropertyEditFormData`, even though it's optional on input.

[src/components/property/property-edit-form.tsx:139-178](src/components/property/property-edit-form.tsx#L139-L178) has a `toDefaultValues(property: PropertyRow): PropertyEditFormData` function with an explicit return-type annotation, returning a hand-built object literal. That literal listed every other field (`amenities`, `common_areas`, `style`, etc.) but never listed `objectives`, so TypeScript flagged it as missing a required property of `PropertyEditFormData` — exactly the reported error at line 143 (the start of the `return { ... }`).

Root cause, in one line: the `Property`/`PropertyEditFormData` types were updated for the objectives-per-property change, but this one hand-written object-literal function that maps a raw `properties` row onto form default values was not updated to pass `objectives` through.

# Exact Fix Implemented

Both in [src/components/property/property-edit-form.tsx](src/components/property/property-edit-form.tsx):

1. Added `objectives: string[] | null;` to the local `PropertyRow` interface (line 108), matching the nullable-array convention already used for every other array field there (`amenities`, `common_areas`, `smart_home_features`, etc.).
2. Added `objectives: property.objectives || [],` to the object returned by `toDefaultValues` (line 154), immediately after `amenities`, using the exact same `|| []` fallback pattern already used for every sibling array field in that function — and consistent with how `ObjectivesEditor` and the registration-form changes already default missing objectives to `[]`.

No other line in this file was touched. In particular, `onSubmit`'s `.update({...})` payload (which intentionally omits `objectives` so it doesn't clobber what `ObjectivesEditor` saves independently on the same page) was left exactly as-is — that payload is a plain object passed to the untyped Supabase client, not type-checked against `PropertyEditFormData`, so it was never part of this error and didn't need changing.

# Build Verification Result

**Could not run `npm run build` or `tsc --noEmit`** — this sandbox has no Node toolchain at all (`node`, `npm`, `npx`, `pnpm`, `yarn` are all absent from `PATH`, and there is no `node_modules` directory), the same limitation noted in the prior implementation report.

In place of an actual compile, I manually audited every other site in `src/` that either:
- explicitly constructs an object literal against `OwnerFormData`, `PropertyOnlyFormData`, or `PropertyEditFormData` (via a `function ...(): T` or `useForm<T>({ defaultValues: {...} })`), or
- explicitly types a variable/parameter as `Property` (from `database.ts`) and constructs a fresh object of that shape.

Findings:
- The three `useForm<T>({ defaultValues: {...} })` call sites (`propietario/page.tsx`, `add-property/page.tsx`, `property-edit-form.tsx`) are all fine — react-hook-form's `defaultValues` is typed as `DefaultValues<T>` (a deep-partial type), so a partial object never triggers a "missing required property" error there, and all three already pass an explicit `objectives` default (`[[]]`, `[]`, and via `toDefaultValues` respectively).
- `toDefaultValues` in `property-edit-form.tsx` was the **only** function anywhere in `src/` with a strict, non-partial return-type annotation (`): PropertyEditFormData`) building a full object literal by hand — the one pattern capable of producing exactly this class of error.
- `matched-property-card.tsx` accepts a `property: Property` prop but only *consumes* it (destructures/reads fields) — it never constructs a new `Property`-shaped object, so it cannot hit this "missing property" error class.
- No other file constructs a `Property`- or form-schema-typed object literal from scratch.

Based on this audit, I'm confident this was the only build-breaking site from the objectives change, but this is a manual review, not a compiler run — an actual `npm run build` (or `tsc --noEmit`) should still be run in CI/Vercel to confirm before merging.

# Files Modified

- `src/components/property/property-edit-form.tsx` (added `objectives` to `PropertyRow` and to `toDefaultValues`'s returned object)
