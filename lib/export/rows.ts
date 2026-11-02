import { confidenceLevel } from "@/lib/design/confidence";
import type { DocumentStatusValue } from "@/lib/document-status";
import { normalizeDocumentDates, toCents } from "@/lib/normalize";
import { type FieldValue, type ReviewField, effectiveValue, fieldLabel, parseFieldName } from "@/lib/review/fields";

// What a document becomes in a spreadsheet: corrections applied, amounts as
// integer cents, dates as ISO only where the document settles their order, and a
// Check list of everything a person still has to look at. Pure and tested; the
// CSV and XLSX writers only format these.

export type ExportDocument = { id: string; fileName: string; status: DocumentStatusValue; fields: ReviewField[] };

/** A date as the export writes it: ISO when the document settles it, else the printed text. */
export type ExportDate = { iso: string | null; printed: string | null };

export type ExportLine = {
  line: number;
  description: string | null;
  qty: number | null;
  unitPriceCents: number | null;
  lineTotalCents: number | null;
};

export type ExportInvoice = {
  documentId: string;
  file: string;
  status: DocumentStatusValue;
  vendor: string | null;
  invoiceNumber: string | null;
  issueDate: ExportDate;
  dueDate: ExportDate;
  currency: string | null;
  subtotalCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
  lines: ExportLine[];
  /** Fields a person still has to look at: flagged and not corrected, or a date whose order is unclear. */
  check: string[];
};

export function toExportInvoice(document: ExportDocument, threshold: number): ExportInvoice {
  const byName = new Map(document.fields.map((field) => [field.name, field]));
  const value = (name: string): FieldValue => {
    const field = byName.get(name);
    return field ? effectiveValue(field) : null;
  };
  const text = (name: string) => {
    const v = value(name);
    return typeof v === "string" ? v : null;
  };
  const cents = (name: string) => {
    const v = value(name);
    return typeof v === "number" ? toCents(v) : null;
  };

  const dates = normalizeDocumentDates({ issueDate: text("issueDate"), dueDate: text("dueDate") });
  const lineIndexes = [...new Set(document.fields.map((field) => parseFieldName(field.name).index).filter((i) => i !== undefined))].sort(
    (a, b) => a - b,
  );
  const lines = lineIndexes.map((index) => {
    const qty = value(`lineItems[${index}].qty`);
    const description = value(`lineItems[${index}].description`);
    return {
      line: index + 1,
      description: typeof description === "string" ? description : null,
      qty: typeof qty === "number" ? qty : null,
      unitPriceCents: cents(`lineItems[${index}].unitPrice`),
      lineTotalCents: cents(`lineItems[${index}].lineTotal`),
    };
  });

  const flagged = document.fields
    .filter((field) => field.correctedAt === null && confidenceLevel(field.value, field.confidence, threshold) === "review")
    .map((field) => checkLabel(field.name));
  const unclearDates = dates.unsettled.map((name) => `${fieldLabel(name)} (day/month order unclear)`);

  return {
    documentId: document.id,
    file: document.fileName,
    status: document.status,
    vendor: text("vendor"),
    invoiceNumber: text("invoiceNumber"),
    issueDate: { iso: dates.iso.issueDate, printed: text("issueDate") },
    dueDate: { iso: dates.iso.dueDate, printed: text("dueDate") },
    currency: text("currency"),
    subtotalCents: cents("subtotal"),
    taxCents: cents("tax"),
    totalCents: cents("total"),
    lines,
    check: [...flagged, ...unclearDates.filter((label) => !flagged.includes(label))],
  };
}

/** "Total", or "Line 2 quantity" for a line item field. */
export function checkLabel(name: string): string {
  const { index } = parseFieldName(name);
  return index === undefined ? fieldLabel(name) : `Line ${index + 1} ${fieldLabel(name).toLowerCase()}`;
}

/** Integer cents as a plain decimal: 128450 → "1284.50", -35400 → "-354.00". No float noise. */
export function centsToDecimal(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** The date cell's text: ISO when known, otherwise exactly what was printed. */
export function dateText(date: ExportDate): string {
  return date.iso ?? date.printed ?? "";
}
