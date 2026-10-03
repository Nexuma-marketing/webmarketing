import { CheckCircle2, Sparkles } from "lucide-react";
import { AlreadyPaidLink } from "@/components/dashboard/paid-or-checkout";

// Shown in place of the generic "Deposit paid ✓" state when the owner's
// active basic-tier plan on this property is specifically FOUNDERS
// (see getBasicTierPlanStatus in src/lib/payment-lookup.ts). Callers
// render the Low Price card right below it in its dimmed "Not selected"
// state (PrimaryPlanPricingCard's `notSelectedNote`) so the owner can
// compare. Not used when the active plan is Low Price — that's the base
// option, there's no saving to announce.

function formatCad(amount: number) {
  return amount.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function FoundersActivePlanCard({
  foundersTotalCad,
  lowPriceTotalCad,
  terms,
}: {
  /** 30% of the property's monthly rent. 0/null when rent is unknown. */
  foundersTotalCad: number | null;
  /** 35% of the property's monthly rent — only used to show the saving. */
  lowPriceTotalCad?: number | null;
  terms: string[];
}) {
  const hasTotal = !!foundersTotalCad && foundersTotalCad > 0;
  const savingCad = hasTotal && lowPriceTotalCad ? lowPriceTotalCad - foundersTotalCad : 0;

  return (
    <div className="rounded-lg border-2 border-green-300 bg-card p-4 space-y-3">
      <div className="flex items-start gap-3 rounded-md border border-green-200 bg-green-50 p-3 text-green-900">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
        <div className="space-y-0.5">
          <p className="font-semibold">
            Well done! You&apos;re now saving money with Founders
            {hasTotal && <> — your new total is ${formatCad(foundersTotalCad)} CAD</>}
          </p>
          {savingCad > 0 && (
            <p className="text-sm text-green-800">
              That&apos;s ${formatCad(savingCad)} CAD less than the Low Price plan.
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold">Founders Package — Visionary Owners</p>
          <p className="text-sm font-medium text-green-700">30% of first month&apos;s rent (one-time, lifetime rate)</p>
        </div>
        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Active plan</span>
      </div>
      {terms.length > 0 && (
        <ul className="space-y-1.5">
          {terms.map((term) => (
            <li key={term} className="flex items-start gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
              {term}
            </li>
          ))}
        </ul>
      )}
      <AlreadyPaidLink />
    </div>
  );
}
