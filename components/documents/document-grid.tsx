import { ScanText } from "lucide-react";
import { RouteButton } from "@/components/ui/route-button";
import { DocumentCard } from "@/components/review/document-card";
import type { DocumentSummary } from "@/lib/db/documents";
import type { DocumentStatusValue } from "@/lib/document-status";
import { formatMoney } from "@/lib/review/fields";
import { formatBytes } from "@/lib/uploads";

const DATE = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", timeZone: "UTC" });

/** Statuses with something to show on the review screen. */
const REVIEWABLE: readonly DocumentStatusValue[] = ["extracted", "needs_human", "reviewed"];

/** Cards for /documents and /review: link once reviewable, Extract on the uploader's own uploads. */
export function DocumentGrid({ documents }: { documents: DocumentSummary[] }) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {documents.map((document) => (
        <li key={document.id}>
          <DocumentCard
            href={REVIEWABLE.includes(document.status) ? `/documents/${document.id}` : undefined}
            fileName={document.fileName}
            kind={document.mimeType === "application/pdf" ? "pdf" : "image"}
            vendor={document.vendor}
            total={document.total === null ? null : formatMoney(document.total, document.currency)}
            pages={document.pageCount ?? undefined}
            meta={`${formatBytes(document.sizeBytes)} · ${DATE.format(new Date(document.createdAt))}`}
            status={document.status}
            flaggedCount={document.toReview}
            action={
              document.isOwner && document.status === "uploaded" ? (
                <RouteButton
                  endpoint={`/api/documents/${document.id}/extract`}
                  size="sm"
                  variant="secondary"
                  busyLabel="Extracting…"
                  busyHint="Reading the invoice. This takes 5–20 seconds."
                >
                  <ScanText aria-hidden />
                  Extract
                </RouteButton>
              ) : undefined
            }
          />
        </li>
      ))}
    </ul>
  );
}

export function GridSkeleton() {
  return (
    <ul aria-hidden className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <li key={i} className="h-36 rounded-lg bg-neutral-100 motion-safe:animate-pulse" />
      ))}
    </ul>
  );
}
