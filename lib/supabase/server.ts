import "server-only";
import { createServerClient } from "@supabase/ssr";
import { io } from "next/cache";
import { cookies } from "next/headers";
import { supabaseEnv } from "./env";

/** Per-request Supabase client for Server Components and route handlers, backed by the session cookies. */
export async function createClient() {
  const cookieStore = await cookies();
  // Creating the client starts auth initialize() in the background, which reads Date.now()
  // to check expiry. Dev prerenders with cookies available, so cookies() alone doesn't
  // stop that; io() keeps it out of the prerender and resolves at once on real requests.
  await io();
  const { url, publishableKey } = supabaseEnv();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components can't write cookies. The proxy refreshes the session instead.
        }
      },
    },
  });
}
