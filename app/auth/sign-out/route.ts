import { NextResponse } from "next/server";
import { requestOrigin } from "@/lib/request-origin";
import { createClient } from "@/lib/supabase/server";

/** POST only, so a link or an image tag can't sign anyone out. */
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // 303 turns the POST into a GET of the home page.
  return NextResponse.redirect(`${requestOrigin(request)}/`, 303);
}
