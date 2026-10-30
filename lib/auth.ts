import "server-only";
import { createClient } from "@/lib/supabase/server";

export type SessionUser = { id: string; email: string | null };

/** Thrown by requireUser(). Route handlers turn it into a 401. */
export class UnauthorizedError extends Error {
  constructor() {
    super("Sign in with Google to do this.");
    this.name = "UnauthorizedError";
  }
}

/**
 * The signed-in user, or null. Uses getClaims(), which verifies the JWT
 * signature; getSession() reads the cookie without checking it.
 */
export async function getUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  return { id: claims.sub, email: claims.email ?? null };
}

/** For routes that spend money (upload, extract): the user, or UnauthorizedError. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) throw new UnauthorizedError();
  return user;
}
