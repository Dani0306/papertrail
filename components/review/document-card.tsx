import Link from "next/link";
import { FileImage, FileText, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { DocumentStatusValue } from "@/lib/document-status";
import { DocumentStatus } from "./document-status";

export function DocumentCard({
  href,
  fileName,
  kind,
  vendor,
  total,
  pages,
  status,
  flaggedCount,
}: {
  href: string;
  fileName: string;
  kind: "pdf" | "image";
  vendor: string | null;
  total: string | null;
  pages?: number;
  status: DocumentStatusValue;
  flaggedCount: number;
}) {
  const Icon = kind === "pdf" ? FileText : FileImage;
  return (
    <Card className="relative flex flex-col gap-4 transition-shadow focus-within:shadow-md hover:shadow-md">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-primary-50 text-primary-500">
          <Icon aria-hidden className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-h3 text-neutral-900">
            <Link
              href={href}
              className="rounded-xs after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none after:focus-visible:outline-2 after:focus-visible:outline-offset-2 after:focus-visible:outline-primary-500"
            >
              {vendor ?? "Unknown vendor"}
            </Link>
          </h3>
          <p className="truncate font-mono text-small text-neutral-500">{fileName}</p>
        </div>
        {total && (
          <p className="shrink-0 text-body-lg font-medium text-neutral-900 tabular-nums">
            {total}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t pt-3">
        <DocumentStatus status={status} />
        <span className="flex items-center gap-3 text-small text-neutral-500">
          {pages !== undefined && (
            <span>
              {pages} {pages === 1 ? "page" : "pages"}
            </span>
          )}
          {flaggedCount > 0 && (
            <span className="flex items-center gap-1 font-medium text-review-700">
              <TriangleAlert aria-hidden className="size-3.5" />
              {flaggedCount} to review
            </span>
          )}
        </span>
      </div>
    </Card>
  );
}
