# Fix Implemented (all locations found and corrected)

Searched the codebase for every occurrence of the "Estimated Loss" stat and any "revenue at risk" subtitle text (`grep -rn "revenue at risk|Estimated Loss|estimated_loss"` across `src/`). Only one location had the wrong "Monthly" framing:

- **Dashboard home** ([src/app/(dashboard)/dashboard/page.tsx:320](<src/app/(dashboard)/dashboard/page.tsx#L320>)) — the "Estimated Loss" stat card's subtitle read `"Monthly revenue at risk"`, even though the value it labels (`pymesLoss`) is populated directly from `diagnosis.estimated_loss` ([src/lib/pymes-plan-display.ts:71](src/lib/pymes-plan-display.ts#L71)) — the same annual figure (`monthly_revenue × 30% × 12 months`) used everywhere else. Changed to `"Annual revenue at risk"`. No other text or the calculation itself was touched.

Every other surface that shows this figure was already labeled correctly and needed no change:

- **Sales Leak Diagnosis results page** ([src/app/results/pymes/[id]/page.tsx:298](<src/app/results/pymes/%5Bid%5D/page.tsx#L298>)) — already titled "Estimated Annual Revenue Loss" with an explicit "× 30% × 12 months" breakdown underneath.
- **Diagnosis result email** ([src/app/api/pymes-result-email/route.ts](src/app/api/pymes-result-email/route.ts)) — already distinguishes `monthlyLoss` ("every month") from `annualLoss` ("extra per year" / "Estimated Annual Loss" table row); not the same bug.
- **Rescue-plan schedule email** ([src/app/api/pymes-schedule-rescue/route.ts:84](src/app/api/pymes-schedule-rescue/route.ts#L84)) — already labeled "Estimated Annual Loss".
- **Diagnosis form results screen** ([src/app/forms/pymes/page.tsx:1072](src/app/forms/pymes/page.tsx#L1072)) — already displays the figure as "... CAD annually".

# Files Modified

- [src/app/(dashboard)/dashboard/page.tsx](<src/app/(dashboard)/dashboard/page.tsx>) — changed the "Estimated Loss" stat card subtitle from `"Monthly revenue at risk"` to `"Annual revenue at risk"`. One-line text change; the `pymesLoss` value, its calculation, and the Diagnosis Score card above it are untouched.

# Expected Result

The "Estimated Loss" card on Dashboard home now reads "Annual revenue at risk" underneath the dollar figure, correctly describing the annual number already being shown (unchanged), consistent with how the same figure is already labeled on the Diagnosis results page and in both diagnosis-related emails.
