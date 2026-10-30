import Link from "next/link";
import {
  ArrowRight,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  ListChecks,
  RotateCcw,
  ScanText,
  TriangleAlert,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Nav } from "@/components/ui/nav";
import { StatusIndicator } from "@/components/ui/status-indicator";
import { toneClasses, type Tone } from "@/components/ui/tone";
import { DocumentStatus } from "@/components/review/document-status";
import { FieldList, FieldRow } from "@/components/review/field-row";
import type { DocumentStatusValue } from "@/lib/document-status";

// Faint ruled lines behind the hero, faded out towards the bottom.
const RULED_PAPER = {
  backgroundImage:
    "repeating-linear-gradient(to bottom, transparent 0 31px, var(--color-primary-100) 31px 32px)",
  maskImage: "linear-gradient(to bottom, black, transparent 85%)",
};

const STEPS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Upload,
    title: "Upload",
    body: "Drop in a PDF or a photo of an invoice. It goes straight to storage.",
  },
  {
    icon: ScanText,
    title: "Extract with evidence",
    body: "The model reads the file and returns every field with a confidence and the exact text it came from.",
  },
  {
    icon: ListChecks,
    title: "Review what's uncertain",
    body: "Fields below the threshold are flagged. Fix one, save, and the original stays on record.",
  },
  {
    icon: FileSpreadsheet,
    title: "Export rows",
    body: "Download clean CSV or XLSX, one row per invoice, ready for the spreadsheet.",
  },
];

type LadderStep = { title: string; body: string; tone: Tone } & (
  | { status: DocumentStatusValue }
  | { icon: LucideIcon; label: string }
);

const LADDER: LadderStep[] = [
  {
    title: "Validate",
    body: "Zod checks every response. Valid on the first try means done.",
    tone: "success",
    status: "extracted",
  },
  {
    title: "Repair",
    body: "One retry, with the validation error fed back to the model.",
    tone: "primary",
    icon: RotateCcw,
    label: "Repair retry",
  },
  {
    title: "Escalate",
    body: "Still invalid: one rerun on the stronger model.",
    tone: "escalated",
    status: "escalated",
  },
  {
    title: "Hand over",
    body: "Still invalid: marked for human entry. Never partial data.",
    tone: "danger",
    status: "needs_human",
  },
];

export default function Home() {
  return (
    <>
      <Nav />
      <main className="flex flex-1 flex-col">
        <section className="relative overflow-hidden bg-linear-to-b from-primary-50 to-paper">
          <div aria-hidden className="absolute inset-0" style={RULED_PAPER} />
          <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_34rem] lg:items-center lg:py-24">
            <div className="flex flex-col gap-6">
              <div>
                <Badge tone="primary">In the lab · week 1</Badge>
              </div>
              <h1 className="font-display text-display-2 text-neutral-900 sm:text-display-1">
                Invoices in, <span className="text-primary-600">clean rows</span> out.
              </h1>
              <p className="max-w-xl text-body-lg text-neutral-600">
                PaperTrail reads invoices and PDFs into spreadsheet rows, and flags every
                uncertain field for a human instead of guessing.
              </p>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <Link href="/design-system" className={buttonClasses()}>
                  See the design system
                  <ArrowRight aria-hidden />
                </Link>
                <a href="#how-it-works" className={buttonClasses({ variant: "text" })}>
                  How it works
                </a>
              </div>
            </div>

            <ExtractionPreview />
          </div>
        </section>

        <section
          id="how-it-works"
          className="mx-auto w-full max-w-6xl scroll-mt-8 px-4 py-16 sm:px-6"
        >
          <h2 className="text-h1 text-neutral-900">How it works</h2>
          <ol className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(({ icon: Icon, title, body }, i) => (
              <li key={title}>
                <Card className="flex h-full flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="flex size-10 items-center justify-center rounded-sm bg-primary-500 text-white">
                      <Icon aria-hidden className="size-5" />
                    </span>
                    <span className="font-mono text-small text-primary-600">0{i + 1}</span>
                  </div>
                  <h3 className="text-h3 text-neutral-900">{title}</h3>
                  <p className="text-body text-neutral-600">{body}</p>
                </Card>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-y bg-white">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-h1 text-neutral-900">Never a silent guess</h2>
            <p className="mt-2 max-w-2xl text-body-lg text-neutral-600">
              When the model&apos;s output doesn&apos;t validate, PaperTrail climbs a short
              ladder. Every document ends extracted, escalated or with a human.
            </p>
            <ol className="mt-8 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] lg:items-stretch">
              {LADDER.map((step, i) => (
                <LadderItem key={step.title} step={step} last={i === LADDER.length - 1} />
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <div className="flex flex-col gap-6 rounded-xl bg-primary-700 px-6 py-10 text-white sm:flex-row sm:items-center sm:justify-between sm:px-10">
            <div className="flex flex-col gap-2">
              <h2 className="font-display text-display-2">Still in the lab.</h2>
              <p className="max-w-xl text-body-lg text-primary-100">
                The extraction CLI comes first. Upload, review and export land in week 2.
              </p>
            </div>
            <Link
              href="/design-system"
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-white px-4 text-body font-medium whitespace-nowrap text-primary-700 transition-colors hover:bg-primary-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white [&_svg]:size-4"
            >
              Browse the components
              <ArrowRight aria-hidden />
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}

/** A static review card with synthetic values: what an extracted invoice looks like. */
function ExtractionPreview() {
  return (
    <figure className="flex flex-col gap-3 rounded-xl border bg-white p-3 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-2 px-2 pt-1">
        <span className="flex min-w-0 items-center gap-2">
          <FileText aria-hidden className="size-4 shrink-0 text-primary-500" />
          <span className="truncate font-mono text-small text-neutral-600">
            harbor-pine-inv-2041.pdf
          </span>
        </span>
        <DocumentStatus status="extracted" />
      </div>
      <FieldList>
        <FieldRow
          label="Vendor"
          value="Harbor & Pine Stationers"
          confidence={0.98}
          sourceQuote="HARBOR & PINE STATIONERS"
        />
        <FieldRow
          label="Invoice number"
          value="INV-2041"
          confidence={0.96}
          sourceQuote="Invoice # INV-2041"
        />
        <FieldRow label="Due date" value={null} confidence={0.91} sourceQuote={null} />
        <FieldRow
          label="Total"
          value="$1,284.50"
          confidence={0.62}
          sourceQuote="TOTAL DUE  1,284.5O"
          numeric
        />
      </FieldList>
      <figcaption className="flex items-center gap-1.5 px-2 pb-1 text-small font-medium text-review-700">
        <TriangleAlert aria-hidden className="size-3.5" />
        1 field to review: the total was printed with a letter O.
      </figcaption>
    </figure>
  );
}

function LadderItem({ step, last }: { step: LadderStep; last: boolean }) {
  return (
    <>
      <li className="flex flex-col gap-3 overflow-hidden rounded-lg border bg-paper">
        <span aria-hidden className={`h-1 ${toneClasses[step.tone].fill}`} />
        <div className="flex flex-1 flex-col gap-2 px-4 pb-4">
          <h3 className="text-h3 text-neutral-900">{step.title}</h3>
          <p className="text-body text-neutral-600">{step.body}</p>
          <div className="mt-auto pt-2">
            {"status" in step ? (
              <DocumentStatus status={step.status} />
            ) : (
              <StatusIndicator icon={step.icon} label={step.label} tone={step.tone} />
            )}
          </div>
        </div>
      </li>
      {!last && (
        <li aria-hidden className="flex items-center justify-center text-neutral-400">
          <ChevronRight className="size-5 rotate-90 lg:rotate-0" />
        </li>
      )}
    </>
  );
}
