import { ExternalLink, FileX } from "lucide-react";
import { Card } from "@/components/ui/card";

/**
 * The document itself, next to its fields. `url` is a short-lived signed URL to
 * the private bucket, issued on the server; the bucket is never made public.
 */
export function DocumentPreview({ url, mimeType, fileName }: { url: string | null; mimeType: string; fileName: string }) {
  if (!url) {
    return (
      <Card className="flex items-start gap-3">
        <FileX aria-hidden className="mt-0.5 size-5 shrink-0 text-neutral-500" />
        <p className="text-body text-neutral-600">The preview couldn&apos;t be loaded. Reload the page to try again.</p>
      </Card>
    );
  }

  return (
    <figure className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-lg border bg-neutral-100">
        {mimeType === "application/pdf" ? (
          <iframe src={url} title={`Preview of ${fileName}`} className="block h-[70vh] min-h-96 w-full bg-white" />
        ) : (
          // A signed URL that expires in minutes: the image optimizer would cache it past its life.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`Scan of ${fileName}`} className="block h-auto max-h-[70vh] w-full object-contain" />
        )}
      </div>
      <figcaption className="flex flex-wrap items-center justify-between gap-2 text-small text-neutral-500">
        <span className="min-w-0 truncate font-mono" title={fileName}>
          {fileName}
        </span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 rounded-xs text-primary-600 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
        >
          Open file
          <ExternalLink aria-hidden className="size-3.5" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </figcaption>
    </figure>
  );
}
