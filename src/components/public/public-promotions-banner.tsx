import { createClient as createSbClient } from "@supabase/supabase-js";
import { Tag } from "lucide-react";

// Steve 5/20 (docx feedback): client asked "Crear promociones temporales —
// este como funciona, en la web donde aparece para el cliente porque no
// lo vi?" The authenticated dashboard already has ActivePromotionsBanner,
// but a customer browsing the public site had no way to discover that
// promotions exist. This component fetches active, in-date promotions
// that are NOT role/zone-restricted (i.e. visible to anonymous visitors)
// and renders a compact strip near the public Services / Pricing area.
//
// Role/zone-restricted promos still only surface inside the dashboard
// where userRole + userCity are known.
export async function PublicPromotionsBanner() {
  // promotions table has admin-only RLS, so anon reads return [].
  // Use the service-role client (server-only) to fetch active promos.
  // We only return non-sensitive columns and only when is_active is true,
  // so service-role here is safe for a public render.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  const sb = createSbClient(url, serviceKey, { auth: { persistSession: false } });
  const today = new Date().toISOString().split("T")[0];

  const { data } = await sb
    .from("promotions")
    .select("code, discount_type, discount_value, description, valid_until, target_roles, target_zones")
    .eq("is_active", true)
    .lte("valid_from", today)
    .or(`valid_until.is.null,valid_until.gte.${today}`)
    .order("created_at", { ascending: false });

  // Only show promos that have no role/zone targeting — those are the
  // ones a public visitor can actually redeem. Targeted promos remain
  // visible in the authenticated dashboard.
  const publiclyVisible = (data || []).filter((p) => {
    const roles = (p.target_roles || []) as string[];
    const zones = (p.target_zones || []) as string[];
    return roles.length === 0 && zones.length === 0;
  });

  if (publiclyVisible.length === 0) return null;

  return (
    <section className="border-y border-amber-200 bg-amber-50 px-4 py-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <Tag className="h-4 w-4" />
            Active promotions
          </p>
          <div className="flex flex-wrap gap-3">
            {publiclyVisible.slice(0, 3).map((p) => (
              <div
                key={p.code}
                className="flex flex-wrap items-baseline gap-2 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm shadow-sm"
              >
                <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono font-bold text-amber-900">
                  {p.code}
                </code>
                <span className="font-medium text-amber-900">
                  {p.discount_type === "percentage"
                    ? `${p.discount_value}% off`
                    : `$${p.discount_value} off`}
                </span>
                {p.description && (
                  <span className="text-xs text-amber-800">— {p.description}</span>
                )}
                {p.valid_until && (
                  <span className="text-xs text-amber-700">
                    until {new Date(p.valid_until).toLocaleDateString("en-CA")}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
        <p className="mt-2 text-xs text-amber-700">
          Apply your code at checkout. Some promotions are reserved for
          specific cities or customer types and will appear inside your
          dashboard after sign-in.
        </p>
      </div>
    </section>
  );
}
