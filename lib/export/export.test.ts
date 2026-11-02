import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import type { ReviewField } from "@/lib/review/fields";
import { CSV_COLUMNS, text, toCsv } from "./csv";
import { type ExportDocument, centsToDecimal, checkLabel, toExportInvoice } from "./rows";
import { toXlsx } from "./xlsx";

const f = (name: string, value: ReviewField["value"], confidence = 0.95, correction?: { value: ReviewField["value"] }): ReviewField => ({
  name,
  value,
  confidence,
  sourceQuote: value === null ? null : String(value),
  correctedValue: correction?.value ?? null,
  correctedAt: correction ? "2026-11-02T10:00:00.000Z" : null,
});

const quarry: ExportDocument = {
  id: "doc-q",
  fileName: "synthetic-quarry-ash-ambiguous.pdf",
  status: "extracted",
  fields: [
    f("vendor", "QUARRY & ASH HARDWARE"),
    f("invoiceNumber", "QA-2O61", 0.75, { value: "QA-2061" }),
    f("issueDate", "2026-10-24"),
    f("dueDate", "2026-11-23"),
    f("currency", "USD"),
    f("subtotal", 566.8),
    f("tax", 45.34),
    f("total", 612.14, 0.72),
    f("lineItems[0].description", "Butt hinges, satin, 3 in"),
    f("lineItems[0].qty", 40),
    f("lineItems[0].unitPrice", 3.25),
    f("lineItems[0].lineTotal", 130),
    f("lineItems[1].description", "=HYPERLINK(\"x\")"),
    f("lineItems[1].qty", 12.75),
    f("lineItems[1].unitPrice", 0.1 + 0.2),
    f("lineItems[1].lineTotal", 3.83),
  ],
};

const orchard: ExportDocument = {
  id: "doc-o",
  fileName: "synthetic-pinecrest-credit-note.pdf",
  status: "escalated",
  fields: [
    f("vendor", "Ferretería, \"Andina\""),
    f("invoiceNumber", "CN-2026-031"),
    f("issueDate", "10/09/2026"),
    f("dueDate", "11/08/2026"),
    f("currency", "USD"),
    f("subtotal", -189.75),
    f("tax", 0),
    f("total", -189.75),
  ],
};

describe("toExportInvoice", () => {
  const invoice = toExportInvoice(quarry, 0.85);

  it("uses a person's correction over the model's value", () => {
    expect(invoice.invoiceNumber).toBe("QA-2061");
  });

  it("keeps amounts as integer cents, with no float noise", () => {
    expect([invoice.subtotalCents, invoice.taxCents, invoice.totalCents]).toEqual([56680, 4534, 61214]);
    expect(invoice.lines[1]).toMatchObject({ line: 2, qty: 12.75, unitPriceCents: 30, lineTotalCents: 383 });
  });

  it("lists what still needs a person: flagged and uncorrected only", () => {
    expect(invoice.check).toEqual(["Total"]);
  });

  it("writes ISO when the document settles its date order, and flags dates it can't settle", () => {
    expect(invoice.issueDate).toEqual({ iso: "2026-10-24", printed: "2026-10-24" });
    const ambiguous = toExportInvoice(orchard, 0.85);
    expect(ambiguous.issueDate).toEqual({ iso: null, printed: "10/09/2026" });
    expect(ambiguous.check).toEqual(["Issue date (day/month order unclear)", "Due date (day/month order unclear)"]);
  });

  it("labels line item fields by line", () => {
    expect(checkLabel("lineItems[2].unitPrice")).toBe("Line 3 unit price");
  });
});

describe("centsToDecimal", () => {
  it.each([
    [128450, "1284.50"],
    [-35400, "-354.00"],
    [5, "0.05"],
    [-5, "-0.05"],
    [312851000, "3128510.00"],
  ])("%i → %s", (cents, expected) => {
    expect(centsToDecimal(cents)).toBe(expected);
  });
});

describe("toCsv", () => {
  const csv = toCsv([toExportInvoice(quarry, 0.85), toExportInvoice(orchard, 0.85)]);
  const lines = csv.slice(1).split("\r\n");

  it("starts with a BOM, uses CRLF, and has a header plus one row per line item (one for a document without lines)", () => {
    expect(csv.startsWith("﻿document_id,")).toBe(true);
    expect(lines[0]).toBe(CSV_COLUMNS.join(","));
    expect(lines.filter(Boolean)).toHaveLength(1 + 2 + 1);
  });

  it("repeats the invoice on each line row, with amounts as plain decimals", () => {
    expect(lines[1]).toBe(
      "doc-q,synthetic-quarry-ash-ambiguous.pdf,extracted,QUARRY & ASH HARDWARE,QA-2061,2026-10-24,2026-11-23,USD,566.80,45.34,612.14,1,\"Butt hinges, satin, 3 in\",40,3.25,130.00,Total",
    );
  });

  it("quotes commas and quotes, and keeps negative amounts as numbers", () => {
    expect(lines[3]).toContain('"Ferretería, ""Andina"""');
    expect(lines[3]).toContain(",-189.75,0.00,-189.75,,,,,,");
  });

  it("defuses text a spreadsheet would run as a formula", () => {
    expect(lines[2]).toContain(`"'=HYPERLINK(""x"")"`);
    expect(text("-x")).toBe("'-x");
    expect(text("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(text("Total")).toBe("Total");
  });
});

describe("toXlsx", () => {
  const book = XLSX.read(toXlsx([toExportInvoice(quarry, 0.85), toExportInvoice(orchard, 0.85)]), { type: "buffer" });

  it("has an Invoices sheet and a Line items sheet", () => {
    expect(book.SheetNames).toEqual(["Invoices", "Line items"]);
    expect(XLSX.utils.sheet_to_json(book.Sheets.Invoices)).toHaveLength(2);
    expect(XLSX.utils.sheet_to_json(book.Sheets["Line items"])).toHaveLength(3);
  });

  it("writes amounts as numbers that sum, formatted with two decimals", () => {
    const total = book.Sheets.Invoices.K2;
    expect(total).toMatchObject({ t: "n", v: 612.14, w: "612.14" });
    expect(book.Sheets.Invoices.K3).toMatchObject({ t: "n", v: -189.75 });
  });

  it("writes known dates as real date cells and unclear ones as the printed text", () => {
    const issue = book.Sheets.Invoices.F2;
    expect(issue.t).toBe("n");
    expect(XLSX.SSF.format("yyyy-mm-dd", issue.v as number)).toBe("2026-10-24");
    expect(book.Sheets.Invoices.F3).toMatchObject({ t: "s", v: "10/09/2026" });
  });

  it("keeps a formula-looking description as plain text, never a formula", () => {
    const description = book.Sheets["Line items"].G3;
    expect(description).toMatchObject({ t: "s", v: '=HYPERLINK("x")' });
    expect(description.f).toBeUndefined();
  });
});
