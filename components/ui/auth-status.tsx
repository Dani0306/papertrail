import { getUser } from "@/lib/auth";
import { AuthControls } from "./auth-controls";

/** Reads the session on the server and renders the matching nav control. */
export async function AuthStatus() {
  const user = await getUser();
  // A signed-in Google account always has an email; "" keeps the signed-in state if it doesn't.
  return <AuthControls email={user ? (user.email ?? "") : null} />;
}
