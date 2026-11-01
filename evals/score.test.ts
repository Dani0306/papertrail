import { describe, expect, it } from "vitest";
import type { ExtractionResult } from "@/lib/extract/types";
import type { Invoice } from "@/lib/schema/invoice";
import { type GoldenFile, fieldKey, normalizeFor, scoreDocument } from "./score";

const golden: GoldenFile = {
  file: "synthetic-test.pdf",
  source: "test",
  dateOrder: "mdy",
  invoice: {
    vendor: { accept: ["Orchard Labs Consulting LLC", "Orchard Labs Consulting"] },
    invoiceNumber: "QA-2061",
    issueDate: "2026-10-09",
    dueDate: null,
    currency: "USD",
    lineItems: [
      { description: "Strategy workshop (1 day)", qty: 1, unitPrice: 2400, lineTotal: 2400 },
      { description: "Analytics setup, hours", qty: 12, unitPrice: 95, lineTotal: 1140 },
    ],
    subtotal: 3540,
    tax: 0,
    total: 3540,
  },
};

const f = <T>(value: T, confidence = 0.95) => ({ value, confidence, sourceQuote: value === null ? null : String(value) });

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    vendor: f("ORCHARD LABS  CONSULTING"),
    invoiceNumber: f("QA-2061"),
    issueDate: f("10/09/2026"), // US order: 9 October
    dueDate: f(null, 1),
    currency: f("usd"),
    lineItems: [
      { description: f("Strategy workshop (1 day)"), qty: f(1), unitPrice: f(2400), lineTotal: f(2400.0000001) },
      { description: f("Analytics setup, hours"), qty: f(12), unitPrice: f(95), lineTotal: f(1140) },
    ],
    subtotal: f(3540),
    tax: f(0),
    total: f(3540),
    ...overrides,
  };
}

const extracted = (inv: Invoice): ExtractionResult => ({ status: "extracted", invoice: inv, calls: [] });

describe("scoreDocument", () => {
  it("scores formatting differences as correct: case, spacing, date format, float noise, accepted alternatives", () => {
    const score = scoreDocument(golden, extracted(invoice()), 0.85);
    expect(score.fields.filter((field) => field.verdict !== "correct")).toEqual([]);
    expect(score).toMatchObject({ correct: 16, total: 16, silentErrors: 0, caughtErrors: 0 });
  });

  it("separates an error a person would see (flagged) from a silent one", () => {
    const score = scoreDocument(
      golden,
      extracted(invoice({ invoiceNumber: f("QA-2O61", 0.75), total: f(3450, 0.99) })),
      0.85,
    );
    const byName = Object.fromEntries(score.fields.map((field) => [field.name, field]));
    expect(byName.invoiceNumber).toMatchObject({ verdict: "wrong", flagged: true });
    expect(byName.total).toMatchObject({ verdict: "wrong", flagged: false });
    expect(score).toMatchObject({ correct: 14, caughtErrors: 1, silentErrors: 1 });
  });

  it("calls a value the document doesn't have hallucinated, and a missing one missed", () => {
    const score = scoreDocument(golden, extracted(invoice({ dueDate: f("11/08/2026"), tax: f(null, 0.4) })), 0.85);
    const byName = Object.fromEntries(score.fields.map((field) => [field.name, field.verdict]));
    expect(byName.dueDate).toBe("hallucinated");
    expect(byName.tax).toBe("missed");
    expect(score.hallucinated).toBe(1);
  });

  it("counts an extra line as hallucinated fields and a dropped line as missed", () => {
    const base = invoice();
    const extra = { description: f("Travel"), qty: f(1), unitPrice: f(50), lineTotal: f(50) };
    const more = scoreDocument(golden, extracted({ ...base, lineItems: [...base.lineItems, extra] }), 0.85);
    expect(more.total).toBe(20);
    expect(more.fields.filter((field) => field.name.startsWith("lineItems[2]")).map((field) => field.verdict)).toEqual([
      "hallucinated",
      "hallucinated",
      "hallucinated",
      "hallucinated",
    ]);

    const fewer = scoreDocument(golden, extracted({ ...base, lineItems: [base.lineItems[0]] }), 0.85);
    expect(fewer.fields.filter((field) => field.name.startsWith("lineItems[1]")).every((field) => field.verdict === "missed")).toBe(true);
    expect(fewer.correct).toBe(12);
  });

  it("scores a run that ended needs_human as every field missed, never partial", () => {
    const score = scoreDocument(golden, { status: "needs_human", reason: "x", calls: [] }, 0.85);
    expect(score.status).toBe("needs_human");
    // dueDate expects null, so "nothing" is right for it; every other field is missed.
    expect(score.correct).toBe(1);
    expect(score.fields.filter((field) => field.verdict === "missed")).toHaveLength(15);
    expect(score.silentErrors).toBe(15);
  });

  it("treats an unreadable date as wrong, not as equal to another unreadable date", () => {
    expect(normalizeFor("issueDate", "sometime in Oct", "mdy")).toBe("unreadable:sometime in Oct");
    expect(normalizeFor("issueDate", "2026-10-09", "dmy")).toBe("2026-10-09"); // golden ISO ignores the order
    expect(normalizeFor("total", "612.14", "mdy")).toBeNull(); // a string where a number belongs never matches
    expect(normalizeFor("lineItems.lineTotal", 2400.0000001, "mdy")).toBe(240000); // line amounts are amounts too
  });

  it("groups line item fields by key for the breakdown", () => {
    expect(fieldKey("lineItems[12].unitPrice")).toBe("lineItems.unitPrice");
    expect(fieldKey("total")).toBe("total");
  });
});
