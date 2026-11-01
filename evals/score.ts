import { confidenceLevel } from "@/lib/design/confidence";
import type { ExtractionResult } from "@/lib/extract/types";
import { type DateOrder, normalizeDate, normalizeText, toCents } from "@/lib/normalize";
import { type FlatField, flattenFields } from "@/lib/schema/invoice";

// Scores one extraction against its golden file, field by field. Pure: the eval
// script runs the model, this decides what was right. Never imported by the app.

export type Expected = string | number | null | { accept: Array<string | number | null> };

export type GoldenFile = {
  file: string;
  source: string;
  dateOrder: DateOrder;
  invoice: {
    vendor: Expected;
    invoiceNumber: Expected;
    issueDate: Expected;
    dueDate: Expected;
    currency: Expected;
    lineItems: Array<{ description: Expected; qty: Expected; unitPrice: Expected; lineTotal: Expected }>;
    subtotal: Expected;
    tax: Expected;
    total: Expected;
  };
};

export type Verdict = "correct" | "wrong" | "missed" | "hallucinated";

export type FieldScore = {
  name: string;
  /** vendor, issueDate, lineItems.qty: the per-field breakdown groups by this. */
  key: string;
  verdict: Verdict;
  expected: Array<string | number | null>;
  got: string | number | null;
  confidence: number | null;
  /** Below the threshold, so a person would have looked at it. */
  flagged: boolean;
};

export type DocumentScore = {
  file: string;
  status: ExtractionResult["status"];
  fields: FieldScore[];
  correct: number;
  total: number;
  /** Wrong, missed or hallucinated, and not flagged: the error nobody would see. */
  silentErrors: number;
  /** Wrong, missed or hallucinated, but flagged for a person. */
  caughtErrors: number;
  hallucinated: number;
};

const DATE_KEYS = new Set(["issueDate", "dueDate"]);
const NUMBER_KEYS = new Set(["subtotal", "tax", "total", "qty", "unitPrice", "lineTotal"]);

/** The comparable form of a value for one field key; dates use the document's order. */
export function normalizeFor(key: string, value: string | number | null, order: DateOrder): string | number | null {
  if (value === null) return null;
  const leaf = key.split(".").at(-1)!; // lineItems.lineTotal → lineTotal
  if (NUMBER_KEYS.has(leaf)) return typeof value === "number" ? toCents(value) : null;
  if (DATE_KEYS.has(leaf)) {
    // Golden dates are already ISO; the model's are as printed.
    const iso = typeof value === "string" ? normalizeDate(value, /^\d{4}-/.test(value) ? "ymd" : order) : null;
    // An unreadable date compares as its text, so it is wrong, not equal to another unreadable one.
    return iso ?? `unreadable:${String(value)}`;
  }
  return normalizeText(String(value));
}

export function scoreDocument(
  golden: GoldenFile,
  result: ExtractionResult,
  threshold: number,
): DocumentScore {
  const expected = expectedFields(golden);
  const predicted = new Map<string, FlatField>(
    result.status === "extracted" ? flattenFields(result.invoice).map((field) => [field.name, field]) : [],
  );
  const names = [...new Set([...expected.keys(), ...predicted.keys()])];

  const fields: FieldScore[] = names.map((name) => {
    const key = fieldKey(name);
    const accept = expected.get(name) ?? [null]; // a predicted line the document doesn't have expects nothing
    const field = predicted.get(name);
    const got = field?.value ?? null;
    const gotNormal = normalizeFor(key, got, golden.dateOrder);
    const acceptNormal = accept.map((value) => normalizeFor(key, value, golden.dateOrder));
    const expectsNull = acceptNormal.every((value) => value === null);

    let verdict: Verdict;
    if (acceptNormal.includes(gotNormal)) verdict = "correct";
    else if (gotNormal === null) verdict = "missed";
    else if (expectsNull) verdict = "hallucinated";
    else verdict = "wrong";

    const confidence = field?.confidence ?? null;
    return {
      name,
      key,
      verdict,
      expected: accept,
      got,
      confidence,
      flagged: field ? confidenceLevel(field.value, field.confidence, threshold) === "review" : false,
    };
  });

  const errors = fields.filter((field) => field.verdict !== "correct");
  return {
    file: golden.file,
    status: result.status,
    fields,
    correct: fields.length - errors.length,
    total: fields.length,
    silentErrors: errors.filter((field) => !field.flagged).length,
    caughtErrors: errors.filter((field) => field.flagged).length,
    hallucinated: fields.filter((field) => field.verdict === "hallucinated").length,
  };
}

/** Expected values by flattened field name, the same names flattenFields() produces. */
export function expectedFields(golden: GoldenFile): Map<string, Array<string | number | null>> {
  const { lineItems, ...scalars } = golden.invoice;
  const fields = new Map<string, Array<string | number | null>>();
  for (const [name, value] of Object.entries(scalars)) fields.set(name, acceptList(value));
  lineItems.forEach((item, index) => {
    for (const [name, value] of Object.entries(item)) fields.set(`lineItems[${index}].${name}`, acceptList(value));
  });
  return fields;
}

function acceptList(value: Expected): Array<string | number | null> {
  return value !== null && typeof value === "object" ? value.accept : [value];
}

/** `lineItems[3].qty` → `lineItems.qty`. */
export function fieldKey(name: string): string {
  return name.replace(/^lineItems\[\d+\]\./, "lineItems.");
}
