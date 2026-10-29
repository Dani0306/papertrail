import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { Nav } from "@/components/ui/nav";

// Placeholder until the upload and review screens land in week 2.
export default function Home() {
  return (
    <>
      <Nav />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-4 py-16 sm:px-6">
        <h1 className="font-display text-display-2 text-neutral-900 sm:text-display-1">
          Invoices in, clean rows out.
        </h1>
        <p className="max-w-xl text-body-lg text-neutral-600">
          PaperTrail reads invoices and PDFs into spreadsheet rows, and flags every uncertain
          field for a human instead of guessing.
        </p>
        <div>
          <Link href="/design-system" className={buttonClasses({ variant: "tertiary" })}>
            Design system
            <ArrowRight aria-hidden />
          </Link>
        </div>
      </main>
    </>
  );
}
