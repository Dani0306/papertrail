import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { BadgeCheck, CircleAlert, CircleDollarSign, ListChecks, ScanText, Timer, TriangleAlert, UserPen } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card } from "@/components/ui/card";
import { Nav } from "@/components/ui/nav";
import { RouteButton } from "@/components/ui/route-button";
import { DocumentPreview } from "@/components/review/document-preview";
import { DocumentStatus } from "@/components/review/document-status";
import { FieldEditor } from "@/components/review/field-editor";
import { FieldList } from "@/components/review/field-row";
import { StatCard } from "@/components/review/stat-card";
import { getUser } from "@/lib/auth";
import { type DocumentReview, getDocumentReview } from "@/lib/db/reviews";
import { confidenceThreshold } from "@/lib/design/confidence";
import { type ReviewField, effectiveValue, groupFields, reviewCounts } from "@/lib/review/fields";
import { z } from "zod";

export const metadata: Metadata = {
  title: "Review · PaperTrail",
};

const DocumentId = z.uuid();

export default function ReviewPage({ params }: PageProps<"/documents/[id]">) {
  return (
    <>
      <Nav current="/documents" />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
        {/* params are runtime data under Cache Components: the shell prerenders, the review streams in. */}
        <Suspense fallback={<ReviewSkeleton />}>
          {params.then(({ id }) => (
            <Review id={id} />
          ))}
        </Suspense>
      </main>
    </>
  );
}

async function Review({ id }: { id: string }) {
  if (!DocumentId.safeParse(id).success) notFound();

  let review: DocumentReview | null;
  let viewerId: string | null = null;
  try {
    viewerId = (await getUser())?.id ?? null;
    review = await getDocumentReview(id, viewerId);
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    return (
      <Card className="flex items-start gap-3">
        <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-danger-700" />
        <div className="flex flex-col gap-1">
          <p className="text-body font-medium text-neutral-900">This document couldn&apos;t be loaded</p>
          <p className="text-small text-neutral-600">The database didn&apos;t answer. Reload the page in a moment.</p>
        </div>
      </Card>
    );
  }
  // Someone else's upload is a 404, not a 403: it doesn't exist as far as this visitor can tell.
  if (!review) notFound();

  const threshold = confidenceThreshold();
  const isOwner = review.access === "owner";
  const fields = review.extraction?.fields ?? [];
  const vendor = valueOf(fields, "vendor");
  const currency = valueOf(fields, "currency");
  const editable = isOwner && (review.status === "extracted" || review.status === "reviewed");

  return (
    <>
      <div className="flex flex-col gap-4">
        <Breadcrumbs items={[{ label: "Documents", href: "/documents" }, { label: review.fileName }]} />
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="font-display text-display-2 break-words text-neutral-900">
              {typeof vendor === "string" ? vendor : review.fileName}
            </h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <DocumentStatus status={review.status} />
              {review.access === "public" && <span className="text-small text-neutral-500">Sample document · read only</span>}
            </div>
          </div>
          {isOwner && review.status === "uploaded" && (
            <RouteButton endpoint={`/api/documents/${review.id}/extract`} busyLabel="Extracting…" busyHint="Reading the invoice. This takes 5–20 seconds.">
              <ScanText aria-hidden />
              Extract
            </RouteButton>
          )}
          {isOwner && review.status === "extracted" && (
            <RouteButton endpoint={`/api/documents/${review.id}/review`} variant="secondary" busyLabel="Saving…">
              <BadgeCheck aria-hidden />
              Mark reviewed
            </RouteButton>
          )}
        </header>
      </div>

      {review.extraction && <Stats review={review} fields={fields} threshold={threshold} />}

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section aria-labelledby="fields-heading" className="flex min-w-0 flex-col gap-6 lg:order-last">
          <h2 id="fields-heading" className="sr-only">
            Extracted fields
          </h2>
          {review.extraction ? (
            <Fields review={review} fields={fields} currency={typeof currency === "string" ? currency : null} threshold={threshold} editable={editable} />
          ) : (
            <NoExtraction review={review} />
          )}
        </section>
        <section aria-label="Document" className="min-w-0 lg:sticky lg:top-6">
          <DocumentPreview url={review.previewUrl} mimeType={review.mimeType} fileName={review.fileName} />
        </section>
      </div>
    </>
  );
}

function Stats({ review, fields, threshold }: { review: DocumentReview; fields: ReviewField[]; threshold: number }) {
  const counts = reviewCounts(fields, threshold);
  return (
    <section aria-label="Summary" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard icon={TriangleAlert} label="To review" value={String(counts.toReview)} hint={`${counts.flagged} below ${threshold} confidence`} />
      <StatCard icon={ListChecks} label="Corrected" value={String(counts.corrected)} hint={`of ${counts.fields} fields`} />
      <StatCard
        icon={CircleDollarSign}
        label="Extraction cost"
        value={`$${review.calls.costUsd.toFixed(5)}`}
        hint={`${review.calls.count} model ${review.calls.count === 1 ? "call" : "calls"}`}
      />
      <StatCard icon={Timer} label="Model time" value={`${(review.calls.latencyMs / 1000).toFixed(1)} s`} hint={review.extraction?.model} />
    </section>
  );
}

function Fields({
  review,
  fields,
  currency,
  threshold,
  editable,
}: {
  review: DocumentReview;
  fields: ReviewField[];
  currency: string | null;
  threshold: number;
  editable: boolean;
}) {
  const groups = groupFields(fields);
  const editor = (field: ReviewField) => (
    <FieldEditor key={field.name} documentId={review.id} field={field} currency={currency} threshold={threshold} editable={editable} />
  );
  return (
    <>
      <FieldGroup title="Invoice">{groups.header.map(editor)}</FieldGroup>
      {groups.lineItems.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-h3 text-neutral-900">
            Line items <span className="text-body font-normal text-neutral-500 tabular-nums">({groups.lineItems.length})</span>
          </h3>
          <ol className="flex flex-col gap-3">
            {groups.lineItems.map((line) => (
              <li key={line.index} className="flex flex-col gap-1.5">
                <p className="text-small font-medium text-neutral-500 tabular-nums">Line {line.index + 1}</p>
                <FieldList>{line.fields.map(editor)}</FieldList>
              </li>
            ))}
          </ol>
        </div>
      )}
      <FieldGroup title="Totals">{groups.totals.map(editor)}</FieldGroup>
    </>
  );
}

function FieldGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-h3 text-neutral-900">{title}</h3>
      <FieldList>{children}</FieldList>
    </div>
  );
}

function NoExtraction({ review }: { review: DocumentReview }) {
  if (review.status === "needs_human") {
    return (
      <Card className="flex items-start gap-3">
        <UserPen aria-hidden className="mt-0.5 size-5 shrink-0 text-danger-700" />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-body font-medium text-neutral-900">This document needs a person to enter it</p>
          <p className="text-small text-neutral-600">
            The model&apos;s answer still broke the invoice rules after a repair attempt, so nothing was saved. Manual entry comes
            with the human-entry step; the document is on the left.
          </p>
          {review.calls.lastError && (
            <p className="mt-1 line-clamp-3 font-mono text-small break-words text-neutral-500" title={review.calls.lastError}>
              {review.calls.lastError}
            </p>
          )}
        </div>
      </Card>
    );
  }
  return (
    <Card className="flex items-start gap-3">
      <ScanText aria-hidden className="mt-0.5 size-5 shrink-0 text-neutral-500" />
      <div className="flex flex-col gap-1">
        <p className="text-body font-medium text-neutral-900">Not extracted yet</p>
        <p className="text-small text-neutral-600">
          {review.access === "owner" ? "Extract it to see its fields here." : "Its fields appear here once it has been extracted."}
        </p>
      </div>
    </Card>
  );
}

function ReviewSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <div className="h-5 w-48 rounded-sm bg-neutral-100 motion-safe:animate-pulse" />
        <div className="h-12 w-2/3 rounded-sm bg-neutral-100 motion-safe:animate-pulse" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-lg bg-neutral-100 motion-safe:animate-pulse" />
        ))}
      </div>
      <div className="grid gap-8 lg:grid-cols-[5fr_7fr]">
        <div className="h-96 rounded-lg bg-neutral-100 motion-safe:animate-pulse" />
        <div className="h-96 rounded-lg bg-neutral-100 motion-safe:animate-pulse" />
      </div>
    </div>
  );
}

function valueOf(fields: ReviewField[], name: string) {
  const field = fields.find((candidate) => candidate.name === name);
  return field ? effectiveValue(field) : null;
}
