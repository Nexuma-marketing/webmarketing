import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

const ALLOWED_ROLES = ["admin", "marketing", "sales", "support"];

export async function POST(request: Request) {
  try {
    // 1. Caller must be an admin already
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (callerProfile?.role !== "admin") {
      return NextResponse.json({ error: "Only administrators can create internal users." }, { status: 403 });
    }

    const { email, password, full_name, role } = await request.json();
    if (!email || !password || !full_name || !role) {
      return NextResponse.json({ error: "email, password, full_name and role are required" }, { status: 400 });
    }
    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: `role must be one of ${ALLOWED_ROLES.join(", ")}` }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      return NextResponse.json({ error: "Server is not configured for admin operations." }, { status: 500 });
    }

    const admin = createAdminClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 2. Create the auth user (email_confirm: true so they can log in immediately)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, role },
    });
    if (createErr) {
      return NextResponse.json({ error: createErr.message }, { status: 400 });
    }

    const newUserId = created.user.id;

    // 3. Make sure the profile row reflects the role + role_locked.
    // The handle_new_user trigger seeds the profile from user_metadata.role and
    // sets role_locked when role is internal — we double-check here.
    await admin
      .from("profiles")
      .upsert(
        {
          id: newUserId,
          email,
          full_name,
          role,
          role_locked: true,
        },
        { onConflict: "id" },
      );

    return NextResponse.json({ success: true, id: newUserId });
  } catch (err) {
    console.error("[create-internal-user] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
