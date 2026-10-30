import { LogOut } from "lucide-react";
import { buttonClasses } from "./button";
import { SignInLink } from "./sign-in-link";

/** Nav sign-in control. Presentational, so /design-system can show both states. */
export function AuthControls({ email }: { email: string | null }) {
  if (email === null) return <SignInLink />;

  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="hidden max-w-48 truncate text-small text-neutral-600 sm:inline" title={email}>
        {email}
      </span>
      <form action="/auth/sign-out" method="post">
        <button type="submit" className={buttonClasses({ variant: "tertiary", size: "sm" })}>
          <LogOut aria-hidden />
          Sign out
        </button>
      </form>
    </div>
  );
}
