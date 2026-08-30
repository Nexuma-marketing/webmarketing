import type { ReactNode } from "react";

export function FoundersBanner({
  taken,
  limit,
  children,
}: {
  taken: number;
  limit: number;
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
      <p className="mt-2 text-xs text-amber-700">
        Limited to the first {limit} Visionary Owners at the special lifetime rate.
      </p>
      {children && <div className="mx-auto mt-4 max-w-sm">{children}</div>}
    </div>
  );
}
