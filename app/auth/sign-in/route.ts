import { NextResponse } from "next/server";
import { requestOrigin } from "@/lib/request-origin";
import { safeNextPath } from "@/lib/safe-next-path";
import { createClient } from "@/lib/supabase/server";

/**
 * Starts Google sign-in on the server (PKCE). signInWithOAuth stores the code
 * verifier in a cookie through cookies(), so the redirect below carries it.
 */
export async function GET(request: Request) {
  const origin = requestOrigin(request);
  const next = safeNextPath(new URL(request.url).searchParams.get("next"));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });

  if (error || !data.url) {
    return NextResponse.redirect(`${origin}/auth/error`);
  }
  return NextResponse.redirect(data.url);
}
