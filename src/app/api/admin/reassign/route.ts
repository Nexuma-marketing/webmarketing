import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Steve 6/5 (6-2.md #25): /admin/reassign "Pick a client" panel
// showed "0 clients" and "No clients match" for every search. Same
// family of bug as /admin/payments and /admin/properties — the
// cookie-context client's read on `profiles` returns 0 rows because
// of a policy quirk on the recursive admin SELECT. Service-role API
// pattern fixes it. Same authorization check used elsewhere.

export const dynamic = "force-dynamic";

const INTERNAL_ROLES = ["admin", "marketing", "sales", "support"];
const CUSTOMER_ROLES = [
  "propietario",
  "propietario_preferido",
  "inversionista",
  "inquilino",
  "inquilino_premium",
  "pymes",
];

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!callerProfile?.role || !INTERNAL_ROLES.includes(callerProfile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [usersRes, servicesRes] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, role")
      .in("role", CUSTOMER_ROLES)
      .order("full_name"),
    supabaseAdmin
      .from("services")
      .select("id, name, category, price, currency, status")
      .or("status.is.null,status.neq.archived")
      .order("category")
      .order("name"),
  ]);

  if (usersRes.error) {
    return NextResponse.json(
      { error: `profiles fetch failed: ${usersRes.error.message}` },
      { status: 500 },
    );
  }
  if (servicesRes.error) {
    return NextResponse.json(
      { error: `services fetch failed: ${servicesRes.error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    users: usersRes.data ?? [],
    services: servicesRes.data ?? [],
  });
}
