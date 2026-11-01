import { z } from "zod";
import { confidenceLevel } from "@/lib/design/confidence";
import { Invoice, LineItem } from "@/lib/schema/invoice";

// Pure helpers for the review screen and the corrections route: what a field is
// called, what type its value has (from the Invoice schema, never redeclared),
// how a typed correction is parsed, and how values are shown.

export type FieldValue = string | number | null;

/** One extraction_fields row as the review screen uses it. */
export type ReviewField = {
  name: string;
  value: FieldValue;
  confidence: number;
  sourceQuote: string | null;
  correctedValue: FieldValue;
  /** Set when a person corrected the field, even to null ("not on the document"). */
  correctedAt: string | null;
};

/** An extraction_fields row (snake case, jsonb values) as a ReviewField. */
export function reviewFieldFromRow(row: {
  field_name: string;
  value: unknown;
  confidence: number;
  source_quote: string | null;
  corrected_value: unknown;
  corrected_at: string | null;
}): ReviewField {
  return {
    name: row.field_name,
    value: asFieldValue(row.value),
    confidence: row.confidence,
    sourceQuote: row.source_quote,
    correctedValue: asFieldValue(row.corrected_value),
    correctedAt: row.corrected_at,
  };
}

function asFieldValue(value: unknown): FieldValue {
  return typeof value === "string" || typeof value === "number" ? value : null;
}

const HEADER_FIELDS = ["vendor", "invoiceNumber", "issueDate", "dueDate", "currency"] as const;
const TOTAL_FIELDS = ["subtotal", "tax", "total"] as const;
const MONEY_FIELDS = new Set(["subtotal", "tax", "total", "unitPrice", "lineTotal"]);

const LABELS: Record<string, string> = {
  vendor: "Vendor",
  invoiceNumber: "Invoice number",
  issueDate: "Issue date",
  dueDate: "Due date",
  currency: "Currency",
  subtotal: "Subtotal",
  tax: "Tax",
  total: "Total",
  description: "Description",
  qty: "Quantity",
  unitPrice: "Unit price",
  lineTotal: "Line total",
};

const LINE_ITEM_NAME = /^lineItems\[(\d+)\]\.(\w+)$/;

/** `lineItems[2].qty` → { index: 2, key: "qty" }; `total` → { key: "total" }. */
export function parseFieldName(name: string): { index?: number; key: string } {
  const match = LINE_ITEM_NAME.exec(name);
  return match ? { index: Number(match[1]), key: match[2] } : { key: name };
}

export function fieldLabel(name: string): string {
  return LABELS[parseFieldName(name).key] ?? name;
}

/** The Zod type of a field's value, straight from the Invoice schema. null for an unknown name. */
export function fieldValueSchema(name: string): z.ZodType<FieldValue> | null {
  const { index, key } = parseFieldName(name);
  if (index === undefined) {
    if (key === "lineItems" || !Object.hasOwn(Invoice.shape, key)) return null;
    return Invoice.shape[key as Exclude<keyof typeof Invoice.shape, "lineItems">].shape.value;
  }
  if (!Object.hasOwn(LineItem.shape, key)) return null;
  return LineItem.shape[key as keyof typeof LineItem.shape].shape.value;
}

/** Amount and quantity fields take numbers; the rest are text. */
export function isNumericField(name: string): boolean {
  const schema = fieldValueSchema(name);
  return schema instanceof z.ZodNullable && schema.unwrap() instanceof z.ZodNumber;
}

// Plain digits with a dot for decimals, optionally grouped with commas: 1284.50,
// 1,284.50, -354. Anything else (1.284,50, 1 284) is refused, not guessed.
const NUMBER_INPUT = /^-?(\d+|\d{1,3}(,\d{3})+)(\.\d+)?$/;

export const NUMBER_HINT = "Use digits with a dot for decimals: 1284.50";

export type ParsedCorrection = { ok: true; value: FieldValue } | { ok: false; error: string };

/**
 * What a person typed, as the field's value. `absent` means "not on the
 * document" (null). The result is then checked by validateCorrection, which the
 * route also runs, so the browser and the server apply the same rule.
 */
export function parseCorrection(name: string, input: string, absent: boolean): ParsedCorrection {
  if (fieldValueSchema(name) === null) return { ok: false, error: "That field doesn't exist." };
  if (absent) return validateCorrection(name, null);

  const trimmed = input.trim();
  if (trimmed === "") return { ok: false, error: "Type a value, or tick “Not on the document”." };
  if (isNumericField(name)) {
    if (!NUMBER_INPUT.test(trimmed)) return { ok: false, error: NUMBER_HINT };
    return validateCorrection(name, Number(trimmed.replaceAll(",", "")));
  }
  return validateCorrection(name, parseFieldName(name).key === "currency" ? trimmed.toUpperCase() : trimmed.replace(/\s+/g, " "));
}

/** The server-side check: the value fits the field's schema type. */
export function validateCorrection(name: string, value: unknown): ParsedCorrection {
  const schema = fieldValueSchema(name);
  if (!schema) return { ok: false, error: "That field doesn't exist." };
  if (typeof value === "string" && value.trim() === "") return { ok: false, error: "Use “Not on the document” instead of an empty value." };
  const parsed = schema.safeParse(value);
  if (parsed.success) return { ok: true, value: parsed.data };
  if (parseFieldName(name).key === "currency") return { ok: false, error: "Use the 3-letter currency code, e.g. USD." };
  return { ok: false, error: isNumericField(name) ? NUMBER_HINT : "That value isn't valid for this field." };
}

/** The value a person sees and exports: the correction if there is one, else the model's. */
export function effectiveValue(field: Pick<ReviewField, "value" | "correctedValue" | "correctedAt">): FieldValue {
  return field.correctedAt !== null ? field.correctedValue : field.value;
}

export function formatMoney(value: number, currency: string | null): string {
  try {
    // Up to 6 decimals so nothing is rounded away (COP shows none by default, 1.5 would read as 2).
    if (currency) return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 6 }).format(value);
  } catch {
    // A malformed code (not three letters) falls through to a plain number.
  }
  const plain = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  return currency ? `${plain} ${currency}` : plain;
}

/** How a value is shown in the review screen. null stays null ("Not found"). */
export function formatFieldValue(name: string, value: FieldValue, currency: string | null): string | null {
  if (value === null) return null;
  if (typeof value === "number") {
    return MONEY_FIELDS.has(parseFieldName(name).key) ? formatMoney(value, currency) : new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(value);
  }
  return value;
}

/** The text a field's editor starts with: plain digits for numbers, so it parses back as typed. */
export function editableText(value: FieldValue): string {
  return value === null ? "" : String(value);
}

export type FieldGroups = {
  header: ReviewField[];
  lineItems: Array<{ index: number; fields: ReviewField[] }>;
  totals: ReviewField[];
};

/** Header fields, then one group per line in order, then the totals. */
export function groupFields(fields: ReviewField[]): FieldGroups {
  const byName = new Map(fields.map((field) => [field.name, field]));
  const pick = (names: readonly string[]) => names.flatMap((name) => byName.get(name) ?? []);
  const lines = new Map<number, ReviewField[]>();
  for (const field of fields) {
    const { index } = parseFieldName(field.name);
    if (index !== undefined) lines.set(index, [...(lines.get(index) ?? []), field]);
  }
  return {
    header: pick(HEADER_FIELDS),
    lineItems: [...lines.entries()].sort(([a], [b]) => a - b).map(([index, lineFields]) => ({ index, fields: lineFields })),
    totals: pick(TOTAL_FIELDS),
  };
}

export type ReviewCounts = { fields: number; flagged: number; toReview: number; corrected: number };

/** `toReview`: below the threshold and not yet corrected, so it falls as a person fixes fields. */
export function reviewCounts(fields: ReviewField[], threshold: number): ReviewCounts {
  const flagged = fields.filter((field) => confidenceLevel(field.value, field.confidence, threshold) === "review");
  return {
    fields: fields.length,
    flagged: flagged.length,
    toReview: flagged.filter((field) => field.correctedAt === null).length,
    corrected: fields.filter((field) => field.correctedAt !== null).length,
  };
}
