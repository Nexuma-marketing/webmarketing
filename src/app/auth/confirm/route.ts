import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Supabase email links (magic link, recovery, invite, etc.)
// redirect here with a PKCE code or token_hash & type parameters.
// We establish the session server-side, then redirect the user.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = searchParams.get("next") ?? "/dashboard";

  // Handle the PKCE flow used by @supabase/ssr first. The response-bound
  // cookie adapter ensures the exchanged session reaches the next request.
  if (code) {
    const successUrl = type === "recovery"
      ? `${origin}/reset-password`
      : `${origin}${next}`;
    const response = NextResponse.redirect(successUrl);

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options);
            });
          },
        },
      },
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return response;
    }
  }

  if (token_hash && type) {
    const successUrl = type === "recovery"
      ? `${origin}/reset-password`
      : `${origin}${next}`;
    const response = NextResponse.redirect(successUrl);

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options);
            });
          },
        },
      },
    );

    const { error } = await supabase.auth.verifyOtp({
      type: type as "recovery" | "signup" | "email",
      token_hash,
    });

    if (!error) {
      return response;
    }
  }

  // If verification fails, redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=invalid_link`);
}
