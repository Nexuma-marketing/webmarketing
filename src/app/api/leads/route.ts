import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { source } = await request.json();

  // Fetch profile
  // This is the caller's own profile, so read it with the authenticated
  // cookie-context client. Using the service-role client here made this
  // otherwise ordinary own-row read depend on a separate database role and
  // caused owner onboarding to fail after the property had already been saved.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name, email, phone, role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return NextResponse.json(
      { error: profileError?.message || "Profile not found" },
      { status: profileError ? 500 : 404 }
    );
  }

  // Check if lead already exists
  const { data: existingLead } = await supabase
    .from("leads")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (existingLead) {
    return NextResponse.json({ message: "Lead already exists" });
  }

  const { error } = await supabase.from("leads").insert({
    user_id: user.id,
    full_name: profile.full_name,
    email: profile.email,
    phone: profile.phone,
    role: profile.role,
    source,
    status: "nuevo",
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: "Lead created" });
}
