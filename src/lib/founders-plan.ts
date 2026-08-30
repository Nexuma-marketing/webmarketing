import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/** Returns the live Founders Package availability used across owner views. */
export async function getFoundersAvailability() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let taken = 0;
  let limit = 20;

  if (!url || !key) return { taken, limit };

  const supabase = createSupabaseClient(url, key, {
    auth: { persistSession: false },
  });
  const [{ data: configRows }, { data: foundersServices }] = await Promise.all([
    supabase.from("app_config").select("key, value").eq("category", "founders_plan"),
    supabase.from("services").select("id").ilike("name", "%Founder%Package%"),
  ]);
  const config = Object.fromEntries(
    (configRows || []).map((row) => [row.key as string, row.value as string]),
  );
  limit = Number(config.limit ?? "20");

  const serviceIds = (foundersServices || []).map((service) => service.id as string);
  if (serviceIds.length > 0) {
    const { count } = await supabase
      .from("payments")
      .select("id", { count: "exact", head: true })
      .in("service_id", serviceIds)
      .eq("status", "completed");
    taken = count ?? 0;
  }

  return { taken, limit };
}
