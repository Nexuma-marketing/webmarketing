import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

// Supabase email links (magic link, recovery, invite, etc.)
// redirect here with token_hash & type parameters.
// We verify the OTP server-side, then redirect the user.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = searchParams.get("next") ?? "/dashboard";

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type: type as "recovery" | "signup" | "email",
      token_hash,
    });

    if (!error) {
      // Password recovery → send to reset-password page
      if (type === "recovery") {
        return NextResponse.redirect(`${origin}/reset-password`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // If verification fails, redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=invalid_link`);
}
