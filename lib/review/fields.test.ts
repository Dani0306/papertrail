import { describe, expect, it } from "vitest";
import {
  type ReviewField,
  NUMBER_HINT,
  editableText,
  effectiveValue,
  fieldLabel,
  fieldValueSchema,
  formatFieldValue,
  formatMoney,
  groupFields,
  isNumericField,
  parseCorrection,
  parseFieldName,
  reviewCounts,
  reviewFieldFromRow,
  validateCorrection,
} from "./fields";

const field = (name: string, value: ReviewField["value"], confidence = 0.95, corrected?: { value: ReviewField["value"] }): ReviewField => ({
  name,
  value,
  confidence,
  sourceQuote: value === null ? null : String(value),
  correctedValue: corrected?.value ?? null,
  correctedAt: corrected ? "2026-11-01T18:00:00.000Z" : null,
});

describe("field names and types", () => {
  it("parses line item names and labels every field", () => {
    expect(parseFieldName("lineItems[12].unitPrice")).toEqual({ index: 12, key: "unitPrice" });
    expect(parseFieldName("total")).toEqual({ key: "total" });
    expect(fieldLabel("invoiceNumber")).toBe("Invoice number");
    expect(fieldLabel("lineItems[0].qty")).toBe("Quantity");
  });

  it("takes each value type from the Invoice schema", () => {
    expect(isNumericField("total")).toBe(true);
    expect(isNumericField("lineItems[3].qty")).toBe(true);
    expect(isNumericField("vendor")).toBe(false);
    expect(isNumericField("lineItems[0].description")).toBe(false);
    expect(fieldValueSchema("lineItems")).toBeNull();
    expect(fieldValueSchema("poNumber")).toBeNull();
    expect(fieldValueSchema("lineItems[0].sku")).toBeNull();
    expect(fieldValueSchema("constructor")).toBeNull(); // no prototype lookups
  });
});

describe("parseCorrection", () => {
  it.each([
    ["1284.50", 1284.5],
    ["1,284.50", 1284.5],
    ["1,234,567", 1234567],
    ["-354", -354],
    [" 612.14 ", 612.14],
  ])("reads %s as %d for an amount", (input, expected) => {
    expect(parseCorrection("total", input, false)).toEqual({ ok: true, value: expected });
  });

  it.each(["1.284,50", "1 284", "12,34", "abc", "$612.14", "6l2.14"])("refuses %s instead of guessing", (input) => {
    expect(parseCorrection("total", input, false)).toEqual({ ok: false, error: NUMBER_HINT });
  });

  it("keeps text as typed, collapsing runs of spaces", () => {
    expect(parseCorrection("invoiceNumber", "  QA-2061 ", false)).toEqual({ ok: true, value: "QA-2061" });
    expect(parseCorrection("vendor", "Cobalt  Ridge   Print Co.", false)).toEqual({ ok: true, value: "Cobalt Ridge Print Co." });
  });

  it("upper-cases a currency and holds it to the schema's 3-letter rule", () => {
    expect(parseCorrection("currency", "usd", false)).toEqual({ ok: true, value: "USD" });
    expect(parseCorrection("currency", "euros", false)).toEqual({ ok: false, error: "Use the 3-letter currency code, e.g. USD." });
  });

  it("turns “Not on the document” into null, whatever was typed", () => {
    expect(parseCorrection("dueDate", "13/11/2026", true)).toEqual({ ok: true, value: null });
  });

  it("asks for a value rather than saving an empty one", () => {
    expect(parseCorrection("vendor", "   ", false).ok).toBe(false);
    expect(parseCorrection("nope", "x", false)).toEqual({ ok: false, error: "That field doesn't exist." });
  });
});

describe("validateCorrection (what the route runs)", () => {
  it("accepts values of the field's type and null", () => {
    expect(validateCorrection("total", 612.14)).toEqual({ ok: true, value: 612.14 });
    expect(validateCorrection("vendor", null)).toEqual({ ok: true, value: null });
  });

  it("rejects the wrong type, an empty string and unknown fields", () => {
    expect(validateCorrection("total", "612.14").ok).toBe(false);
    expect(validateCorrection("vendor", 5).ok).toBe(false);
    expect(validateCorrection("vendor", "").ok).toBe(false);
    expect(validateCorrection("lineItems", []).ok).toBe(false);
  });
});

describe("display", () => {
  it("formats money in the printed currency", () => {
    expect(formatMoney(1229.97, "EUR")).toBe("€1,229.97");
    expect(formatMoney(3128510, "COP").replace(/\s/g, " ")).toBe("COP 3,128,510");
    expect(formatMoney(3128510.5, "COP").replace(/\s/g, " ")).toBe("COP 3,128,510.5"); // never rounded away
    expect(formatMoney(-354, "USD")).toBe("-$354.00");
  });

  it("falls back to a plain number for a malformed code, or no code", () => {
    expect(formatMoney(10, "euros")).toBe("10.00 euros");
    expect(formatMoney(10, null)).toBe("10.00");
  });

  it("formats amounts as money, quantities as numbers, and leaves text and null alone", () => {
    expect(formatFieldValue("lineItems[0].unitPrice", 0.5, "GBP")).toBe("£0.50");
    expect(formatFieldValue("lineItems[0].qty", 1500, "GBP")).toBe("1,500");
    expect(formatFieldValue("vendor", "Kestrel", "USD")).toBe("Kestrel");
    expect(formatFieldValue("dueDate", null, "USD")).toBeNull();
  });

  it("prefills the editor with text that parses back to the same value", () => {
    for (const value of [1284.5, -354, 3128510]) {
      expect(parseCorrection("total", editableText(value), false)).toEqual({ ok: true, value });
    }
    expect(editableText(null)).toBe("");
  });
});

describe("corrections and counts", () => {
  it("uses the correction when there is one, including a correction to null", () => {
    expect(effectiveValue(field("total", 612.14))).toBe(612.14);
    expect(effectiveValue(field("total", 612.14, 0.7, { value: 621.14 }))).toBe(621.14);
    expect(effectiveValue(field("dueDate", "13/11/2026", 0.6, { value: null }))).toBeNull();
  });

  it("counts flagged fields not yet corrected as to review", () => {
    const fields = [
      field("vendor", "Quarry & Ash", 0.99),
      field("invoiceNumber", "QA-2O61", 0.75, { value: "QA-2061" }),
      field("total", 612.14, 0.72),
      field("dueDate", null, 1),
      field("tax", 45.34, 0.99, { value: 45.43 }),
    ];
    expect(reviewCounts(fields, 0.85)).toEqual({ fields: 5, flagged: 2, toReview: 1, corrected: 2 });
  });

  it("groups header fields, each line in order, then totals", () => {
    const groups = groupFields([
      field("total", 1),
      field("lineItems[1].qty", 2),
      field("vendor", "A"),
      field("lineItems[0].qty", 1),
      field("lineItems[0].description", "x"),
      field("currency", "USD"),
      field("subtotal", 1),
    ]);
    expect(groups.header.map((f) => f.name)).toEqual(["vendor", "currency"]);
    expect(groups.lineItems.map((line) => [line.index, line.fields.map((f) => f.name)])).toEqual([
      [0, ["lineItems[0].qty", "lineItems[0].description"]],
      [1, ["lineItems[1].qty"]],
    ]);
    expect(groups.totals.map((f) => f.name)).toEqual(["subtotal", "total"]);
  });
});

describe("reviewFieldFromRow", () => {
  it("maps a database row, keeping only string or number values", () => {
    expect(
      reviewFieldFromRow({ field_name: "total", value: 612.14, confidence: 0.72, source_quote: "$6l2.14", corrected_value: null, corrected_at: null }),
    ).toEqual({ name: "total", value: 612.14, confidence: 0.72, sourceQuote: "$6l2.14", correctedValue: null, correctedAt: null });
    expect(reviewFieldFromRow({ field_name: "vendor", value: { odd: true }, confidence: 1, source_quote: null, corrected_value: [1], corrected_at: null }).value).toBeNull();
  });
});
