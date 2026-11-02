import { type ExportInvoice, centsToDecimal, dateText } from "./rows";

// One row per line item with the invoice repeated, UTF-8 with a BOM and CRLF so
// Excel opens accents correctly. RFC 4180 quoting.

export const CSV_COLUMNS = [
  "document_id",
  "file",
  "status",
  "vendor",
  "invoice_number",
  "issue_date",
  "due_date",
  "currency",
  "subtotal",
  "tax",
  "total",
  "line",
  "description",
  "qty",
  "unit_price",
  "line_total",
  "check",
] as const;

const BOM = "﻿";

export function toCsv(invoices: ExportInvoice[]): string {
  const rows: string[][] = [[...CSV_COLUMNS]];
  for (const invoice of invoices) {
    const head = [
      text(invoice.documentId),
      text(invoice.file),
      invoice.status,
      text(invoice.vendor),
      text(invoice.invoiceNumber),
      text(dateText(invoice.issueDate)),
      text(dateText(invoice.dueDate)),
      text(invoice.currency),
      amount(invoice.subtotalCents),
      amount(invoice.taxCents),
      amount(invoice.totalCents),
    ];
    const check = text(invoice.check.join("; "));
    if (invoice.lines.length === 0) rows.push([...head, "", "", "", "", "", check]);
    for (const line of invoice.lines) {
      rows.push([
        ...head,
        String(line.line),
        text(line.description),
        line.qty === null ? "" : String(line.qty),
        amount(line.unitPriceCents),
        amount(line.lineTotalCents),
        check,
      ]);
    }
  }
  return BOM + rows.map((row) => row.map(quote).join(",")).join("\r\n") + "\r\n";
}

function amount(cents: number | null): string {
  return cents === null ? "" : centsToDecimal(cents);
}

/**
 * Text that a spreadsheet would run as a formula (=, +, -, @, tab, CR) gets a
 * leading apostrophe. Only text cells: amounts are written as numbers above.
 */
export function text(value: string | null): string {
  if (value === null) return "";
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function quote(cell: string): string {
  return /[",\r\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell;
}
