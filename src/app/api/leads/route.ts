import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
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
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("full_name, email, phone, role")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // Check if lead already exists
  const { data: existingLead } = await supabaseAdmin
    .from("leads")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (existingLead) {
    return NextResponse.json({ message: "Lead already exists" });
  }

  const { error } = await supabaseAdmin.from("leads").insert({
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
