import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import { DocumentGrid, GridSkeleton } from "@/components/documents/document-grid";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Nav } from "@/components/ui/nav";
import { getUser } from "@/lib/auth";
import { listDocuments } from "@/lib/db/documents";
import { confidenceThreshold } from "@/lib/design/confidence";
import { queueOrder } from "@/lib/review/queue";

export const metadata: Metadata = {
  title: "Review queue · PaperTrail",
};

export default function ReviewQueuePage() {
  return (
    <>
      <Nav current="/review" />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-4 py-10 sm:px-6">
        <header className="flex flex-col gap-2">
          <h1 className="font-display text-display-2 text-neutral-900">Review queue</h1>
          <p className="max-w-2xl text-body-lg text-neutral-600">
            Documents that need a person: the ones the model couldn&apos;t read come first, then the ones with the most
            fields below the confidence threshold. Oldest first when it&apos;s a tie.
          </p>
        </header>
        <section aria-labelledby="queue-heading" className="flex flex-col gap-4">
          <h2 id="queue-heading" className="sr-only">
            Documents to review
          </h2>
          <Suspense fallback={<GridSkeleton />}>
            <Queue />
          </Suspense>
        </section>
      </main>
    </>
  );
}

async function Queue() {
  let result;
  try {
    const user = await getUser();
    result = queueOrder(await listDocuments(user?.id ?? null, confidenceThreshold()));
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    return (
      <Card className="flex items-start gap-3">
        <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-danger-700" />
        <div className="flex flex-col gap-1">
          <p className="text-body font-medium text-neutral-900">The queue couldn&apos;t be loaded</p>
          <p className="text-small text-neutral-600">The database didn&apos;t answer. Reload the page in a moment.</p>
        </div>
      </Card>
    );
  }

  const { queue, clear } = result;
  const clearNote = `${clear} ${clear === 1 ? "document needs" : "documents need"} nothing from you.`;

  if (queue.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 py-12 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-success-50 text-success-700">
          <CircleCheck aria-hidden className="size-6" />
        </span>
        <p className="text-body font-medium text-neutral-900">Nothing to review</p>
        <p className="max-w-sm text-small text-neutral-600">
          Every extracted field is above the confidence threshold or already corrected. {clear > 0 && clearNote}
        </p>
        <Link href="/documents" className={buttonClasses({ variant: "tertiary", size: "sm" })}>
          Go to documents
        </Link>
      </Card>
    );
  }

  return (
    <>
      <p className="text-small text-neutral-500 tabular-nums">
        {queue.length} to review{clear > 0 && ` · ${clearNote}`}
      </p>
      <DocumentGrid documents={queue} />
    </>
  );
}
