import type { Metadata } from "next";
import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Nav } from "@/components/ui/nav";

export const metadata: Metadata = {
  title: "Sign-in failed · PaperTrail",
};

export default function AuthErrorPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto flex w-full max-w-6xl flex-1 items-start justify-center px-4 py-16 sm:px-6">
        <Card className="flex w-full max-w-md flex-col gap-4">
          <div className="flex items-center gap-2 text-danger-700">
            <CircleAlert aria-hidden className="size-5" />
            <h1 className="text-h2 text-neutral-900">Sign-in didn&apos;t finish</h1>
          </div>
          <p className="text-body text-neutral-600">
            Google sent you back without a valid sign-in. The link may have expired or been used
            already. Nothing was charged and nothing was saved.
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {/* A plain <a>: Link would prefetch the route handler and start a sign-in. */}
            <a href="/auth/sign-in" className={buttonClasses()}>
              Try again
            </a>
            <Link href="/" className={buttonClasses({ variant: "text" })}>
              Back to home
            </Link>
          </div>
        </Card>
      </main>
    </>
  );
}
