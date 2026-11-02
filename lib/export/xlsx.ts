import * as XLSX from "xlsx";
import { type ExportInvoice, dateText } from "./rows";

// A workbook with an Invoices sheet (one row per document) and a Line items
// sheet (the same rows as the CSV). Amounts are numeric cells formatted
// #,##0.00 so they sum; dates are real date cells when the document settles
// their order, text otherwise. Server-only in practice: only the route imports it.

const MONEY = "#,##0.00";
const DATE = "yyyy-mm-dd";
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

type Cell = XLSX.CellObject;

export function toXlsx(invoices: ExportInvoice[]): Buffer {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet(invoiceHeader, invoices.map(invoiceRow)), "Invoices");
  XLSX.utils.book_append_sheet(book, sheet(lineHeader, invoices.flatMap(lineRows)), "Line items");
  return XLSX.write(book, { bookType: "xlsx", type: "buffer" }) as Buffer;
}

const invoiceHeader = ["Document", "File", "Status", "Vendor", "Invoice number", "Issue date", "Due date", "Currency", "Subtotal", "Tax", "Total", "Lines", "Check"];
const lineHeader = ["Document", "File", "Vendor", "Invoice number", "Currency", "Line", "Description", "Qty", "Unit price", "Line total", "Check"];

function invoiceRow(invoice: ExportInvoice): Cell[] {
  return [
    str(invoice.documentId),
    str(invoice.file),
    str(invoice.status),
    str(invoice.vendor),
    str(invoice.invoiceNumber),
    date(invoice.issueDate),
    date(invoice.dueDate),
    str(invoice.currency),
    money(invoice.subtotalCents),
    money(invoice.taxCents),
    money(invoice.totalCents),
    { t: "n", v: invoice.lines.length },
    str(invoice.check.join("; ")),
  ];
}

function lineRows(invoice: ExportInvoice): Cell[][] {
  const head = [str(invoice.documentId), str(invoice.file), str(invoice.vendor), str(invoice.invoiceNumber), str(invoice.currency)];
  const check = str(invoice.check.join("; "));
  if (invoice.lines.length === 0) return [[...head, blank(), blank(), blank(), blank(), blank(), check]];
  return invoice.lines.map((line) => [
    ...head,
    { t: "n", v: line.line },
    str(line.description),
    line.qty === null ? blank() : { t: "n", v: line.qty },
    money(line.unitPriceCents),
    money(line.lineTotalCents),
    check,
  ]);
}

function sheet(header: string[], rows: Cell[][]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet([header.map(str), ...rows]);
  ws["!cols"] = header.map((name) => ({ wch: Math.max(10, name.length + 2) }));
  return ws;
}

function str(value: string | null): Cell {
  return value === null || value === "" ? blank() : { t: "s", v: value };
}

function blank(): Cell {
  return { t: "z" };
}

/** Exact cents as a number cell; 1284.5 is stored exactly as Excel stores it, and shown as 1,284.50. */
function money(cents: number | null): Cell {
  return cents === null ? blank() : { t: "n", v: cents / 100, z: MONEY };
}

/** A real date cell (an Excel serial, no time zone) when ISO is known; the printed text otherwise. */
function date(value: { iso: string | null; printed: string | null }): Cell {
  if (!value.iso) return str(dateText(value));
  const [year, month, day] = value.iso.split("-").map(Number);
  return { t: "n", v: (Date.UTC(year, month - 1, day) - EXCEL_EPOCH) / 86_400_000, z: DATE };
}
