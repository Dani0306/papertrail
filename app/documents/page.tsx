import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { CircleAlert, Inbox, LockKeyhole } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Nav } from "@/components/ui/nav";
import { SignInLink } from "@/components/ui/sign-in-link";
import { DocumentGrid, GridSkeleton } from "@/components/documents/document-grid";
import { UploadBox } from "@/components/documents/upload-box";
import { getUser } from "@/lib/auth";
import { countUploadsToday, dailyUploadCap, listDocuments } from "@/lib/db/documents";
import { confidenceThreshold } from "@/lib/design/confidence";

export const metadata: Metadata = {
  title: "Documents · PaperTrail",
};



export default function DocumentsPage() {
  return (
    <>
      <Nav current="/documents" />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-4 py-10 sm:px-6">
        <header className="flex flex-col gap-2">
          <h1 className="font-display text-display-2 text-neutral-900">Documents</h1>
          <p className="max-w-2xl text-body-lg text-neutral-600">
            Upload an invoice, extract it, then review the fields the model wasn&apos;t sure about.
            Your uploads are visible only to you; the samples are public.
          </p>
        </header>

        <section aria-labelledby="upload-heading" className="flex flex-col gap-3">
          <h2 id="upload-heading" className="text-h2 text-neutral-900">
            Upload an invoice
          </h2>
          <Suspense fallback={<div className="h-52 rounded-lg bg-neutral-100 motion-safe:animate-pulse" />}>
            <UploadPanel />
          </Suspense>
        </section>

        <section aria-labelledby="list-heading" className="flex flex-col gap-4">
          <h2 id="list-heading" className="text-h2 text-neutral-900">
            Documents
          </h2>
          <Suspense fallback={<GridSkeleton />}>
            <DocumentList />
          </Suspense>
        </section>
      </main>
    </>
  );
}

/** Signed in: the drop zone with today's allowance. Signed out: why and how to sign in. */
async function UploadPanel() {
  const user = await getUser();
  if (!user) {
    return (
      <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-primary-50 text-primary-500">
            <LockKeyhole aria-hidden className="size-5" />
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-body font-medium text-neutral-900">Sign in to upload</p>
            <p className="max-w-xl text-small text-neutral-600">
              Anyone can browse the documents below. Uploading needs a Google sign-in, which keeps
              the free demo from being flooded.
            </p>
          </div>
        </div>
        <SignInLink />
      </Card>
    );
  }

  const cap = dailyUploadCap();
  const used = await countUploadsToday(user.id);
  return <UploadBox remaining={Math.max(0, cap - used)} cap={cap} />;
}

async function DocumentList() {
  let documents;
  let signedIn = false;
  try {
    const user = await getUser();
    signedIn = user !== null;
    documents = await listDocuments(user?.id ?? null, confidenceThreshold());
  } catch (error) {
    // Lets Next's own signals through (prerender ending, redirects); only real failures land here.
    unstable_rethrow(error);
    console.error(error);
    return (
      <Card className="flex items-start gap-3">
        <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-danger-700" />
        <div className="flex flex-col gap-1">
          <p className="text-body font-medium text-neutral-900">Documents couldn&apos;t be loaded</p>
          <p className="text-small text-neutral-600">
            The database didn&apos;t answer. Reload the page in a moment.
          </p>
        </div>
      </Card>
    );
  }

  if (documents.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 py-12 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
          <Inbox aria-hidden className="size-6" />
        </span>
        <p className="text-body font-medium text-neutral-900">No documents yet</p>
        <p className="max-w-sm text-small text-neutral-600">
          {signedIn
            ? "Invoices you upload appear here, newest first."
            : "Sign in to upload an invoice. Your uploads appear here, visible only to you."}
        </p>
      </Card>
    );
  }

  return (
    <>
      <p className="-mt-2 text-small text-neutral-500 tabular-nums">
        {documents.length} {documents.length === 1 ? "document" : "documents"}
      </p>
      <DocumentGrid documents={documents} />
    </>
  );
}
