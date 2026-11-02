import { describe, expect, it } from "vitest";
import { type ManualEntry, ManualEntry as Schema, manualFieldRows } from "./manual";

const NOW = new Date("2026-11-02T12:00:00Z");
const empty = { vendor: null, invoiceNumber: null, issueDate: null, dueDate: null, currency: null, subtotal: null, tax: null, total: null };
const entry = (overrides: Partial<ManualEntry["header"]> = {}, lineItems: ManualEntry["lineItems"] = []): ManualEntry => ({
  header: { ...empty, ...overrides },
  lineItems,
});

describe("manualFieldRows", () => {
  it("stores the person's values as corrections, with the model's value left empty", () => {
    const result = manualFieldRows(
      entry({ vendor: "Kestrel Coffee Roasters", total: 30.85, currency: "USD" }, [{ description: "Latte 12oz", qty: 2, unitPrice: null, lineTotal: 9.5 }]),
      NOW,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(12);
    expect(result.rows[0]).toEqual({
      position: 0,
      field_name: "vendor",
      value: null,
      confidence: 0,
      source_quote: null,
      corrected_value: "Kestrel Coffee Roasters",
      corrected_at: "2026-11-02T12:00:00.000Z",
    });
    expect(result.rows.find((row) => row.field_name === "lineItems[0].qty")?.corrected_value).toBe(2);
  });

  it("holds every value to its field's schema type and reports all problems at once", () => {
    const result = manualFieldRows(entry({ currency: "dollars", total: "30.85" as unknown as number }, [{ description: "", qty: 1, unitPrice: null, lineTotal: 1 }]), NOW);
    expect(result).toEqual({
      ok: false,
      errors: {
        currency: "Use the 3-letter currency code, e.g. USD.",
        total: "Use digits with a dot for decimals: 1284.50",
        "lineItems[0].description": "Use “Not on the document” instead of an empty value.",
      },
    });
  });

  it("refuses an entry with nothing in it", () => {
    expect(manualFieldRows(entry(), NOW)).toEqual({ ok: false, errors: { form: "Enter at least one field from the document." } });
  });
});

describe("ManualEntry", () => {
  it("rejects unknown fields and too many lines", () => {
    expect(Schema.safeParse({ header: { ...empty, poNumber: "x" }, lineItems: [] }).success).toBe(false);
    const line = { description: "x", qty: 1, unitPrice: 1, lineTotal: 1 };
    expect(Schema.safeParse({ header: empty, lineItems: Array(201).fill(line) }).success).toBe(false);
  });
});
