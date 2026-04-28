// Creates an admin auth user + profile in Supabase using the service role key.
// Usage:
//   node --env-file=.env.local scripts/create-admin-user.mjs <email> <password> "<full name>"
// Example:
//   node --env-file=.env.local scripts/create-admin-user.mjs admin@nexuma.ca StevePass2026 "Steve Sanabria"

import { createClient } from "@supabase/supabase-js";

const [, , email, password, ...nameParts] = process.argv;
const fullName = nameParts.join(" ");

if (!email || !password || !fullName) {
  console.error("Usage: node --env-file=.env.local scripts/create-admin-user.mjs <email> <password> \"<full name>\"");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log(`Creating admin user ${email}...`);

const { data: created, error: createErr } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: {
    full_name: fullName,
    role: "admin",
  },
});

if (createErr) {
  // If user already exists, look them up and just promote their profile to admin.
  if (/already.*registered|already exists/i.test(createErr.message)) {
    console.log("User already exists; promoting their profile to admin...");
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const existing = list?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!existing) {
      console.error("Could not find the existing user. Aborting.");
      process.exit(1);
    }
    const { error: upErr } = await admin
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", existing.id);
    if (upErr) {
      console.error("Failed to set admin role:", upErr.message);
      process.exit(1);
    }
    console.log(`Done. ${email} is now admin.`);
    process.exit(0);
  }
  console.error("Create failed:", createErr.message);
  process.exit(1);
}

const userId = created.user.id;
console.log(`Auth user created: ${userId}`);

// The handle_new_user() trigger creates the profile automatically using
// user_metadata.role, but we double-check here in case the trigger ran with
// a stale role value or didn't fire.
const { error: profileErr } = await admin
  .from("profiles")
  .upsert(
    { id: userId, email, full_name: fullName, role: "admin" },
    { onConflict: "id" },
  );

if (profileErr) {
  console.error("Profile upsert failed:", profileErr.message);
  process.exit(1);
}

console.log("");
console.log("=========================================");
console.log("  ADMIN ACCOUNT READY");
console.log("=========================================");
console.log(`  URL:      ${process.env.NEXT_PUBLIC_APP_URL || "https://webmarketing-lyart.vercel.app"}/login`);
console.log(`  Email:    ${email}`);
console.log(`  Password: ${password}`);
console.log(`  Role:     admin`);
console.log("=========================================");
