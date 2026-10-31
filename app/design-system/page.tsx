import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleAlert,
  Clock,
  Coins,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Inbox,
  Pencil,
  ScanText,
  Search,
  Target,
  Timer,
  Upload,
  UserPen,
} from "lucide-react";
import { AuthControls } from "@/components/ui/auth-controls";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, SearchInput } from "@/components/ui/input";
import { Logo } from "@/components/ui/logo";
import { Nav } from "@/components/ui/nav";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Select } from "@/components/ui/select";
import { UploadBox } from "@/components/documents/upload-box";
import { DocumentCard } from "@/components/review/document-card";
import { DocumentStatus } from "@/components/review/document-status";
import { FieldList, FieldRow } from "@/components/review/field-row";
import { StatCard } from "@/components/review/stat-card";
import { DEFAULT_CONFIDENCE_THRESHOLD } from "@/lib/design/confidence";
import { DOCUMENT_STATUSES } from "@/lib/document-status";
import { readColorTokens } from "./tokens";

export const metadata: Metadata = {
  title: "Design system · PaperTrail",
};

const COLOR_GROUPS = [
  { family: "primary", title: "Primary — ink blue", use: "Actions, links, focus" },
  { family: "neutral", title: "Neutral", use: "Text, borders, surfaces" },
  { family: "review", title: "Review", use: "Below the confidence threshold — amber means only this" },
  { family: "success", title: "Success", use: "Extracted, reviewed, confident" },
  { family: "danger", title: "Danger", use: "Needs human entry, errors" },
  { family: "escalated", title: "Escalated", use: "Re-run on the stronger model" },
];

const TYPE_SCALE = [
  { style: "Display 1", className: "font-display text-display-1", font: "Playfair Display", size: "48 / 56", weight: "Bold", use: "Page titles" },
  { style: "Display 2", className: "font-display text-display-2", font: "Playfair Display", size: "36 / 44", weight: "Bold", use: "Section titles" },
  { style: "Heading 1", className: "text-h1", font: "Inter", size: "28 / 36", weight: "Semibold", use: "Card titles, big numbers" },
  { style: "Heading 2", className: "text-h2", font: "Inter", size: "22 / 30", weight: "Semibold", use: "Sub sections" },
  { style: "Heading 3", className: "text-h3", font: "Inter", size: "18 / 26", weight: "Medium", use: "Small titles" },
  { style: "Body Large", className: "text-body-lg", font: "Inter", size: "16 / 24", weight: "Regular", use: "Field values" },
  { style: "Body", className: "text-body", font: "Inter", size: "14 / 20", weight: "Regular", use: "Default UI text" },
  { style: "Small", className: "text-small", font: "Inter", size: "12 / 16", weight: "Regular", use: "Captions, meta" },
  { style: "Evidence", className: "font-mono text-small", font: "Geist Mono", size: "12 / 16", weight: "Regular", use: "sourceQuote, file names" },
];

const SPACING = [
  { px: 4, className: "size-1" },
  { px: 8, className: "size-2" },
  { px: 12, className: "size-3" },
  { px: 16, className: "size-4" },
  { px: 24, className: "size-6" },
  { px: 32, className: "size-8" },
  { px: 40, className: "size-10" },
  { px: 48, className: "size-12" },
  { px: 64, className: "size-16" },
];

const RADII = [
  { name: "xs", px: "4px", className: "rounded-xs" },
  { name: "sm", px: "8px", className: "rounded-sm" },
  { name: "md", px: "12px", className: "rounded-md" },
  { name: "lg", px: "16px", className: "rounded-lg" },
  { name: "xl", px: "24px", className: "rounded-xl" },
  { name: "full", px: "circle", className: "rounded-full" },
];

const SHADOWS = [
  { name: "sm", className: "shadow-sm", value: "0 1px 2px 0 / 0.05" },
  { name: "md", className: "shadow-md", value: "0 4px 12px -2px / 0.08" },
  { name: "lg", className: "shadow-lg", value: "0 12px 24px -4px / 0.10" },
  { name: "xl", className: "shadow-xl", value: "0 20px 40px -8px / 0.12" },
];

const ICONS = [
  { icon: Upload, name: "Upload" },
  { icon: FileText, name: "FileText" },
  { icon: ScanText, name: "ScanText" },
  { icon: Search, name: "Search" },
  { icon: Inbox, name: "Inbox" },
  { icon: Pencil, name: "Pencil" },
  { icon: Check, name: "Check" },
  { icon: CircleAlert, name: "CircleAlert" },
  { icon: UserPen, name: "UserPen" },
  { icon: FileSpreadsheet, name: "FileSpreadsheet" },
  { icon: Download, name: "Download" },
  { icon: Clock, name: "Clock" },
  { icon: ChevronRight, name: "ChevronRight" },
];

const PRINCIPLES = [
  { icon: CircleAlert, title: "Flag, don't guess", body: "An uncertain field is shown as uncertain. Amber is reserved for it." },
  { icon: ScanText, title: "Evidence beside every value", body: "The text the model read sits under the value it produced." },
  { icon: Eye, title: "Calm by default", body: "Confident rows stay quiet so the flagged ones stand out." },
  { icon: Target, title: "Accessible", body: "AA contrast, visible focus, and a label on every colour signal." },
];

function Section({
  number,
  title,
  className,
  children,
}: {
  number: string;
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={className}>
      <h2 className="mb-5 flex items-center gap-3 text-small font-semibold tracking-widest uppercase">
        <span className="text-primary-500 tabular-nums">{number}</span>
        <span className="text-neutral-900">{title}</span>
      </h2>
      {children}
    </Card>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <p className="mb-3 text-body font-medium text-neutral-700">{children}</p>;
}

export default function DesignSystemPage() {
  const colors = readColorTokens();

  return (
    <>
      <Nav />
      <main className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-5 px-4 py-10 sm:px-6 lg:grid-cols-12">
        <Card className="flex flex-col gap-5 lg:col-span-12">
          <Logo />
          <h1 className="font-display text-display-1 text-neutral-900">Design System</h1>
          <p className="max-w-2xl text-body-lg text-neutral-600">
            One visual language for PaperTrail: a quiet review tool where the only loud thing on
            screen is a field that needs a human.
          </p>
          <p className="mt-auto text-small tracking-widest text-neutral-500 uppercase">
            Version 1.0 · October 2026 · Threshold {DEFAULT_CONFIDENCE_THRESHOLD}
          </p>
        </Card>

        <Section number="01" title="Colors" className="lg:col-span-12">
          <div className="flex flex-col gap-6">
            {COLOR_GROUPS.map(({ family, title, use }) => (
              <div key={family}>
                <p className="text-body font-medium text-neutral-700">{title}</p>
                <p className="mb-3 text-small text-neutral-500">{use}</p>
                <div className="grid grid-cols-4 gap-3 sm:grid-cols-5 md:grid-cols-10">
                  {(colors[family] ?? []).map((swatch) => (
                    <div key={swatch.token}>
                      <div
                        className="h-12 rounded-sm border border-neutral-900/5"
                        style={{ backgroundColor: swatch.hex }}
                      />
                      <p className="mt-1.5 text-small text-neutral-700">{swatch.step}</p>
                      <p className="font-mono text-small text-neutral-500 uppercase">
                        {swatch.hex}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div>
              <p className="mb-3 text-body font-medium text-neutral-700">Surfaces</p>
              <div className="grid grid-cols-4 gap-3 sm:grid-cols-5 md:grid-cols-10">
                {[...(colors.paper ?? []), ...(colors.white ?? [])].map((swatch) => (
                  <div key={swatch.token}>
                    <div
                      className="h-12 rounded-sm border"
                      style={{ backgroundColor: swatch.hex }}
                    />
                    <p className="mt-1.5 text-small text-neutral-700">{swatch.step}</p>
                    <p className="font-mono text-small text-neutral-500 uppercase">{swatch.hex}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>

        <Section number="02" title="Typography" className="lg:col-span-4">
          <div className="flex flex-col gap-6">
            {[
              { family: "font-display", name: "Playfair Display", traits: "Page titles only · editorial · paper" },
              { family: "font-sans", name: "Inter", traits: "All UI · tabular figures for money" },
              { family: "font-mono", name: "Geist Mono", traits: "Evidence · literal text from the document" },
            ].map((font) => (
              <div key={font.name} className="flex items-center gap-5">
                <span className={`${font.family} w-16 text-display-1 font-normal text-neutral-900`}>
                  Ag
                </span>
                <div>
                  <p className={`${font.family} text-h3 text-neutral-900`}>{font.name}</p>
                  <p className="text-small text-neutral-500">{font.traits}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section number="03" title="Type scale" className="lg:col-span-8">
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-xl text-left">
              <thead className="text-small text-neutral-500">
                <tr>
                  <th className="pb-2 font-normal">Style</th>
                  <th className="pb-2 font-normal">Font</th>
                  <th className="pb-2 font-normal">Size / line</th>
                  <th className="pb-2 font-normal">Weight</th>
                  <th className="pb-2 font-normal">Use</th>
                </tr>
              </thead>
              <tbody className="text-small text-neutral-500">
                {TYPE_SCALE.map((row) => (
                  <tr key={row.style} className="border-t">
                    <td className={`py-2 pr-4 text-neutral-900 ${row.className}`}>{row.style}</td>
                    <td className="py-2 pr-4">{row.font}</td>
                    <td className="py-2 pr-4 tabular-nums">{row.size}</td>
                    <td className="py-2 pr-4">{row.weight}</td>
                    <td className="py-2">{row.use}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section number="04" title="Spacing" className="lg:col-span-6">
          <Label>Base unit: 4px (Tailwind default, unchanged)</Label>
          <div className="flex flex-wrap items-end gap-x-5 gap-y-4">
            {SPACING.map((space) => (
              <div key={space.px} className="flex flex-col items-center gap-2">
                <div className={`${space.className} rounded-xs bg-primary-200`} />
                <span className="text-small text-neutral-700 tabular-nums">{space.px}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section number="05" title="Radius & shadows" className="lg:col-span-6">
          <Label>Radius</Label>
          <div className="mb-6 flex flex-wrap gap-4">
            {RADII.map((radius) => (
              <div key={radius.name} className="flex flex-col items-center gap-2">
                <div className={`${radius.className} size-12 border bg-white`} />
                <span className="text-small text-neutral-700">{radius.name}</span>
                <span className="-mt-2 text-small text-neutral-500">{radius.px}</span>
              </div>
            ))}
          </div>
          <Label>Shadows</Label>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {SHADOWS.map((shadow) => (
              <div key={shadow.name} className={`${shadow.className} rounded-md bg-white p-3`}>
                <p className="text-body font-medium text-neutral-900">{shadow.name}</p>
                <p className="font-mono text-small text-neutral-500">{shadow.value}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section number="06" title="Icons" className="lg:col-span-4">
          <Label>Lucide · outline · 24px grid · 2px stroke · round caps</Label>
          <ul className="grid grid-cols-5 gap-3 text-neutral-700 sm:grid-cols-7 lg:grid-cols-5">
            {ICONS.map(({ icon: Icon, name }) => (
              <li key={name} title={name} className="flex size-10 items-center justify-center rounded-sm bg-neutral-50">
                <Icon aria-hidden className="size-5" />
                <span className="sr-only">{name}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-small text-neutral-500">
            16px inside buttons and inputs, 20px standalone. Outline only; Lucide has no filled set.
          </p>
        </Section>

        <Section number="07" title="Buttons" className="lg:col-span-8">
          <div className="-mx-5 overflow-x-auto px-5">
            <div className="grid min-w-xl grid-cols-[5rem_repeat(4,auto)] items-center gap-x-4 gap-y-3">
              <span />
              {["Primary", "Secondary", "Tertiary", "Text"].map((name) => (
                <span key={name} className="text-small text-neutral-500">
                  {name}
                </span>
              ))}
              {(["Default", "Disabled"] as const).map((state) => (
                <div key={state} className="contents">
                  <span className="text-small text-neutral-500">{state}</span>
                  <div>
                    <Button disabled={state === "Disabled"}>
                      <Upload aria-hidden />
                      Upload invoice
                    </Button>
                  </div>
                  <div>
                    <Button variant="secondary" disabled={state === "Disabled"}>
                      Approve all
                    </Button>
                  </div>
                  <div>
                    <Button variant="tertiary" disabled={state === "Disabled"}>
                      Export CSV
                      <Download aria-hidden />
                    </Button>
                  </div>
                  <div>
                    <Button variant="text" disabled={state === "Disabled"}>
                      View source
                      <ArrowUpRight aria-hidden />
                    </Button>
                  </div>
                </div>
              ))}
              <span className="text-small text-neutral-500">Small</span>
              <div>
                <Button size="sm">Save</Button>
              </div>
              <div>
                <Button size="sm" variant="secondary">
                  Accept
                </Button>
              </div>
              <div>
                <Button size="sm" variant="tertiary">
                  <Pencil aria-hidden />
                  Edit
                </Button>
              </div>
              <span />
            </div>
          </div>
          <ul className="mt-5 list-disc pl-5 text-small text-neutral-500">
            <li>Height 44px (md, default) or 36px (sm, for dense review rows). Radius 12px.</li>
            <li>Hover and focus are live: hover a button, or tab to it for the focus ring.</li>
            <li>
              Links that look like buttons use <code className="font-mono">buttonClasses()</code>, e.g.{" "}
              <a href="#field-rows" className={buttonClasses({ variant: "text" })}>
                jump to field rows
              </a>
              .
            </li>
          </ul>
        </Section>

        <Section number="08" title="Inputs" className="lg:col-span-4">
          <div className="flex flex-col gap-5">
            <Field label="Search" htmlFor="ds-search">
              <SearchInput id="ds-search" placeholder="Vendor, invoice number…" shortcut="⌘K" />
            </Field>
            <Field label="Status" htmlFor="ds-select">
              <Select id="ds-select" defaultValue="needs_review">
                <option value="all">All documents</option>
                <option value="needs_review">Needs review</option>
                <option value="reviewed">Reviewed</option>
              </Select>
            </Field>
            <Field label="Total" htmlFor="ds-invalid" error="Use a number, like 1240.00">
              <Input id="ds-invalid" defaultValue="1.240,OO" aria-invalid />
            </Field>
            <Field label="Currency" htmlFor="ds-disabled" hint="Read from the document; not editable.">
              <Input id="ds-disabled" defaultValue="EUR" disabled />
            </Field>
          </div>
        </Section>

        <Section number="09" title="Badges" className="lg:col-span-4">
          <div className="flex flex-wrap gap-2">
            <Badge tone="primary">PDF</Badge>
            <Badge>Image</Badge>
            <Badge tone="review">Review 62%</Badge>
            <Badge tone="success">94%</Badge>
            <Badge tone="escalated">Sonnet</Badge>
            <Badge tone="danger">Failed</Badge>
            <Badge tone="primary">Corrected</Badge>
          </div>
        </Section>

        <Section number="10" title="Document status" className="lg:col-span-4">
          <ul className="flex flex-col gap-3">
            {DOCUMENT_STATUSES.map((status) => (
              <li key={status}>
                <DocumentStatus status={status} />
              </li>
            ))}
          </ul>
        </Section>

        <Section number="11" title="Progress" className="lg:col-span-12">
          <div className="grid gap-4 sm:grid-cols-3">
            <ProgressBar value={0.35} label="complete" />
            <ProgressBar value={0.8} label="reviewed" tone="success" />
            <ProgressBar value={0.25} label="flagged" tone="review" />
          </div>
        </Section>

        <Section number="12" title="Field rows" className="lg:col-span-12">
          <div id="field-rows" className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-small text-neutral-500">
            <span>Threshold {DEFAULT_CONFIDENCE_THRESHOLD}. Below it a row turns amber, with or without a value.</span>
            <span>A confident null reads as “Not found” and stays quiet.</span>
          </div>
          <FieldList>
            <FieldRow label="Vendor" value="Northwind Office Supply" confidence={0.97} sourceQuote="NORTHWIND OFFICE SUPPLY LTD." />
            <FieldRow label="Invoice number" value="INV-2041" confidence={0.99} sourceQuote="Invoice No: INV-2041" />
            <FieldRow
              label="Issue date"
              value="2026-11-15"
              confidence={0.71}
              sourceQuote="15/11/26"
              action={
                <Button size="sm" variant="tertiary" aria-label="Edit issue date">
                  <Pencil aria-hidden />
                  Edit
                </Button>
              }
            />
            <FieldRow label="Due date" value={null} confidence={0.93} sourceQuote={null} />
            <FieldRow label="PO number" value={null} confidence={0.41} sourceQuote={null} />
            <FieldRow label="Tax" value="€206.67" confidence={0.88} sourceQuote="VAT 20% 206,67" numeric />
            <FieldRow
              label="Total"
              value="€1,204.00"
              correctedValue="€1,240.00"
              confidence={0.62}
              sourceQuote="TOTAL DUE 1.240,00 EUR"
              numeric
            />
          </FieldList>
        </Section>

        <Section number="13" title="Cards" className="lg:col-span-12">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <DocumentCard
              href="#field-rows"
              fileName="northwind-inv-2041.pdf"
              kind="pdf"
              vendor="Northwind Office Supply"
              total="€1,240.00"
              pages={2}
              status="extracted"
              flaggedCount={3}
            />
            <DocumentCard
              href="#field-rows"
              fileName="receipt-scan-0193.jpg"
              kind="image"
              vendor={null}
              total={null}
              status="needs_human"
              flaggedCount={0}
            />
            <DocumentCard
              href="#field-rows"
              fileName="contoso-q4-services.pdf"
              kind="pdf"
              vendor="Contoso Consulting"
              total="$8,950.00"
              pages={4}
              status="escalated"
              flaggedCount={1}
            />
            <DocumentCard
              fileName="harbor-pine-inv-2041.pdf"
              kind="pdf"
              vendor={null}
              total={null}
              meta="184 KB · 31 Oct"
              status="uploaded"
              flaggedCount={0}
            />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <StatCard icon={Target} label="Field accuracy" value="—" hint="Golden set lands in week 3" />
            <StatCard icon={Coins} label="Cost per document" value="—" hint="Measured, not estimated" />
            <StatCard icon={Timer} label="p95 latency" value="—" hint="From model_calls" />
          </div>
        </Section>

        <Section number="14" title="Upload" className="lg:col-span-12">
          <div className="grid gap-6 lg:grid-cols-3">
            <div>
              <Label>Idle</Label>
              <UploadBox remaining={17} cap={20} preview={{ kind: "idle" }} />
            </div>
            <div>
              <Label>Uploading</Label>
              <UploadBox
                remaining={17}
                cap={20}
                preview={{ kind: "uploading", fileName: "harbor-pine-inv-2041.pdf", progress: 0.62 }}
              />
            </div>
            <div>
              <Label>Error</Label>
              <UploadBox
                remaining={17}
                cap={20}
                preview={{ kind: "error", message: "notes.txt: Only PDF, PNG, JPEG or WebP files can be uploaded." }}
              />
            </div>
          </div>
          <p className="mt-2 text-small text-neutral-500">
            Previews are inert. The live box sits on /documents for signed-in visitors; signed-out
            visitors see a sign-in prompt instead.
          </p>
        </Section>

        <Section number="15" title="Navigation" className="lg:col-span-12">
          <Label>Breadcrumbs</Label>
          <Breadcrumbs
            items={[
              { label: "Documents", href: "/documents" },
              { label: "Northwind Office Supply", href: "/documents" },
              { label: "Review" },
            ]}
          />
          <p className="mt-4 text-small text-neutral-500">The top bar of this page is the main nav.</p>
          <div className="mt-6">
            <Label>Sign-in control</Label>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <AuthControls email={null} />
            <AuthControls email="ada.lovelace@example.com" />
          </div>
          <p className="mt-2 text-small text-neutral-500">
            Signed out, then signed in. Browsing is public; Google sign-in is only required to upload
            or extract.
          </p>
        </Section>

        <Section number="16" title="Principles" className="lg:col-span-12">
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {PRINCIPLES.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3">
                <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-primary-500" />
                <div>
                  <p className="text-body font-medium text-neutral-900">{title}</p>
                  <p className="text-small text-neutral-500">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      </main>
    </>
  );
}
