import type { ReactNode } from "react";

export function FoundersBanner({
  taken,
  limit,
  terms,
  children,
}: {
  taken: number;
  limit: number;
  terms: string[];
  children?: ReactNode;
}) {
  const left = Math.max(0, limit - taken);

  return (
    <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-4 text-center">
      <p className="text-lg font-bold text-amber-900">
        {taken} owners have already chosen the Founders Package
      </p>
      <p className="mt-1 text-2xl font-extrabold text-red-600">
        Only {left} spots left — Hurry!
      </p>
      <p className="mt-2 font-semibold text-amber-900">
        Lock in a 30% lifetime rate — as long as you stay with us, this rate never increases.
      </p>
      <p className="mt-1 text-xs text-amber-700">
        Limited to the first {limit} Visionary Owners.
      </p>
      <details className="mx-auto mt-4 max-w-xl rounded-md border border-amber-300 bg-white/70 p-3 text-left">
        <summary className="cursor-pointer text-center font-semibold text-amber-900">
          See Founders Package details
        </summary>
        <ul className="mt-3 space-y-1.5">
          {terms.map((term) => (
            <li key={term} className="flex items-start gap-2 text-sm text-amber-950">
              <span className="mt-0.5 text-amber-700" aria-hidden="true">✓</span>
              {term}
            </li>
          ))}
        </ul>
        {children && <div className="mt-4">{children}</div>}
      </details>
    </div>
  );
}
