import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { CircleAlert, Download, FileSpreadsheet, Inbox, TriangleAlert } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Nav } from "@/components/ui/nav";
import { getUser } from "@/lib/auth";
import { exportSelection } from "@/lib/db/exports";
import { confidenceThreshold } from "@/lib/design/confidence";
import { toExportInvoice } from "@/lib/export/rows";

export const metadata: Metadata = {
  title: "Exports · PaperTrail",
};

const COLUMNS: Array<[string, string]> = [
  ["Invoices sheet", "One row per document: vendor, number, dates, currency, subtotal, tax, total."],
  ["Line items sheet / CSV", "One row per line item, with the invoice repeated, ready to filter or pivot."],
  ["Corrections", "Where a person corrected a field, the corrected value is exported, not the model's."],
  ["Amounts", "Numbers in the document's own currency, never converted. They sum in Excel."],
  ["Dates", "Real dates when the document settles day/month order; the printed text when it doesn't."],
  ["Check", "Fields still below the confidence threshold, and any date whose order is unclear."],
];

export default function ExportsPage() {
  return (
    <>
      <Nav current="/exports" />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-4 py-10 sm:px-6">
        <header className="flex flex-col gap-2">
          <h1 className="font-display text-display-2 text-neutral-900">Exports</h1>
          <p className="max-w-2xl text-body-lg text-neutral-600">
            Every extracted invoice as a spreadsheet, with corrections applied and anything still uncertain listed in a
            Check column instead of passed off as fact.
          </p>
        </header>
        <Suspense fallback={<div className="h-48 rounded-lg bg-neutral-100 motion-safe:animate-pulse" />}>
          <ExportPanel />
        </Suspense>
        <section aria-labelledby="columns-heading" className="flex flex-col gap-4">
          <h2 id="columns-heading" className="text-h2 text-neutral-900">
            What&apos;s in the file
          </h2>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
            {COLUMNS.map(([term, description]) => (
              <div key={term} className="flex flex-col gap-1">
                <dt className="text-body font-medium text-neutral-900">{term}</dt>
                <dd className="text-small text-neutral-600">{description}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>
    </>
  );
}

async function ExportPanel() {
  let summary;
  let signedIn = false;
  try {
    const user = await getUser();
    signedIn = user !== null;
    const selection = (await exportSelection(user?.id ?? null))!;
    const invoices = selection.documents.map((document) => toExportInvoice(document, confidenceThreshold()));
    summary = {
      documents: invoices.length,
      lines: invoices.reduce((total, invoice) => total + invoice.lines.length, 0),
      toCheck: invoices.reduce((total, invoice) => total + invoice.check.length, 0),
      withChecks: invoices.filter((invoice) => invoice.check.length > 0).length,
      needsHuman: selection.needsHuman,
    };
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    return (
      <Card className="flex items-start gap-3">
        <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-danger-700" />
        <div className="flex flex-col gap-1">
          <p className="text-body font-medium text-neutral-900">The export couldn&apos;t be prepared</p>
          <p className="text-small text-neutral-600">The database didn&apos;t answer. Reload the page in a moment.</p>
        </div>
      </Card>
    );
  }

  if (summary.documents === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 py-12 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
          <Inbox aria-hidden className="size-6" />
        </span>
        <p className="text-body font-medium text-neutral-900">Nothing to export yet</p>
        <p className="max-w-sm text-small text-neutral-600">Extracted invoices appear here once a document has been read.</p>
        <Link href="/documents" className={buttonClasses({ variant: "tertiary", size: "sm" })}>
          Go to documents
        </Link>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-primary-50 text-primary-500">
          <FileSpreadsheet aria-hidden className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-body font-medium text-neutral-900 tabular-nums">
            {summary.documents} {summary.documents === 1 ? "invoice" : "invoices"} · {summary.lines}{" "}
            {summary.lines === 1 ? "line item" : "line items"}
          </p>
          <p className="text-small text-neutral-600">
            {signedIn ? "Your uploads plus the public samples." : "Public samples only. Sign in to include your own uploads."}
            {summary.needsHuman > 0 &&
              ` ${summary.needsHuman} ${summary.needsHuman === 1 ? "document needs" : "documents need"} entering by hand and ${summary.needsHuman === 1 ? "isn't" : "aren't"} included.`}
          </p>
          {summary.toCheck > 0 && (
            <p className="mt-1 flex items-start gap-1.5 text-small font-medium text-review-700">
              <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              {summary.toCheck} {summary.toCheck === 1 ? "field" : "fields"} on {summary.withChecks}{" "}
              {summary.withChecks === 1 ? "invoice" : "invoices"} still {summary.toCheck === 1 ? "needs" : "need"} checking. They&apos;re listed
              in the Check column.
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <a href="/api/exports?format=xlsx" download className={buttonClasses()}>
          <Download aria-hidden />
          Download XLSX
        </a>
        <a href="/api/exports?format=csv" download className={buttonClasses({ variant: "secondary" })}>
          <Download aria-hidden />
          Download CSV
        </a>
      </div>
    </Card>
  );
}
