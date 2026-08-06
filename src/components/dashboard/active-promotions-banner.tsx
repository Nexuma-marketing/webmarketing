import { createClient as createSbClient } from "@supabase/supabase-js";
import { Tag } from "lucide-react";

// Steve 4/28: question — "where do promotions appear for the customer?".
// This component fetches active, in-date, role-targeted promotions and renders
// a banner on the user's services page so they know what discount codes apply.
//
// Steve 5/22 Milestone 4: promotions has admin-only RLS, so reading via
// the cookie-context client returned 0 rows for tenants/owners/pymes.
// Switched to the service-role client (server-only) — same pattern as
// the public PublicPromotionsBanner. We still only return non-sensitive
// columns and only for active in-date rows, so the bypass is safe.
export async function ActivePromotionsBanner({
  userRole,
  userCity,
}: {
  userRole?: string | null;
  userCity?: string | null;
}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  const supabase = createSbClient(url, serviceKey, { auth: { persistSession: false } });
  const today = new Date().toISOString().split("T")[0];
  const { data } = await supabase
    .from("promotions")
    .select("*")
    .eq("is_active", true)
    .lte("valid_from", today)
    .or(`valid_until.is.null,valid_until.gte.${today}`)
    .order("created_at", { ascending: false });

  const matched = (data || []).filter((p) => {
    const roles = (p.target_roles || []) as string[];
    const zones = (p.target_zones || []) as string[];
    if (roles.length > 0 && userRole && !roles.includes(userRole)) return false;
    if (zones.length > 0 && userCity && !zones.includes(userCity)) return false;
    return true;
  });

  if (matched.length === 0) return null;

  return (
    <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4 space-y-2">
      <p className="text-sm font-semibold text-amber-900 flex items-center gap-2">
        <Tag className="h-4 w-4" />
        Active promotions for you
      </p>
      <div className="space-y-2">
        {matched.slice(0, 3).map((p) => (
          <div key={p.id} className="flex flex-wrap items-baseline gap-2 text-sm">
            <code className="rounded bg-white px-2 py-0.5 font-mono font-bold text-amber-900 border border-amber-200">
              {p.code}
            </code>
            <span className="text-amber-900 font-medium">
              {p.discount_type === "percentage"
                ? `${p.discount_value}% off`
                : `$${p.discount_value} off`}
            </span>
            {p.description && (
              <span className="text-amber-800 text-xs">— {p.description}</span>
            )}
            {p.valid_until && (
              <span className="text-xs text-amber-700">
                until {new Date(p.valid_until).toLocaleDateString("en-CA")}
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-amber-700">
        Mention or paste a code at checkout to apply the discount.
      </p>
    </div>
  );
}
