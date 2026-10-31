import "server-only";
import { createClient } from "@supabase/supabase-js";
import { io } from "next/cache";
import { supabaseEnv, supabaseSecretKey } from "@/lib/supabase/env";
import type { Database } from "./types";

/**
 * Server-only client with the secret key, scoped to the papertrail schema.
 * It bypasses RLS, so it never leaves the server and never sees a visitor's session.
 */
export async function db() {
  // Creating any Supabase client starts auth initialize(), which reads Date.now().
  // io() keeps that out of the prerender (see lib/supabase/server.ts).
  await io();
  return createClient<Database, "papertrail">(supabaseEnv().url, supabaseSecretKey(), {
    db: { schema: "papertrail" },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function documentsBucket(): string {
  return process.env.SUPABASE_STORAGE_BUCKET || "papertrail-documents";
}
