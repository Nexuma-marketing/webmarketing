import { supabaseAdmin } from "@/lib/supabase/admin";
import type { UserRole } from "@/types/database";

export async function createLead(
  userId: string,
  role: UserRole,
  source: string
) {
  // Fetch user profile
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("full_name, email, phone")
    .eq("id", userId)
    .single();

  if (!profile) return;

  // Check if lead already exists for this user
  const { data: existingLead } = await supabaseAdmin
    .from("leads")
    .select("id")
    .eq("user_id", userId)
    .single();

  if (existingLead) return; // Don't create duplicate leads

  await supabaseAdmin.from("leads").insert({
    user_id: userId,
    full_name: profile.full_name,
    email: profile.email,
    phone: profile.phone,
    role,
    source,
    status: "nuevo",
  });
}
