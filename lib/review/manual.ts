import { z } from "zod";
import { type FieldValue, validateCorrection } from "./fields";

// A person entering a needs_human document by hand. Each value meets the same
// Zod field type the model's output does. The rows keep value null and
// confidence 0 (the model returned nothing) and carry the person's entry as a
// correction, so review, export and the eval treat it like any other correction.

export const HEADER_FIELDS = ["vendor", "invoiceNumber", "issueDate", "dueDate", "currency", "subtotal", "tax", "total"] as const;
export const LINE_FIELDS = ["description", "qty", "unitPrice", "lineTotal"] as const;
export const MAX_LINES = 200;

const Value = z.union([z.string(), z.number(), z.null()]);

export const ManualEntry = z
  .object({
    header: z.object(Object.fromEntries(HEADER_FIELDS.map((name) => [name, Value])) as Record<(typeof HEADER_FIELDS)[number], typeof Value>).strict(),
    lineItems: z
      .array(z.object(Object.fromEntries(LINE_FIELDS.map((name) => [name, Value])) as Record<(typeof LINE_FIELDS)[number], typeof Value>).strict())
      .max(MAX_LINES),
  })
  .strict();
export type ManualEntry = z.infer<typeof ManualEntry>;

export type ManualFieldRow = {
  position: number;
  field_name: string;
  value: null;
  confidence: 0;
  source_quote: null;
  corrected_value: FieldValue;
  corrected_at: string;
};

export type ManualRowsResult = { ok: true; rows: ManualFieldRow[] } | { ok: false; errors: Record<string, string> };

/** Every field validated against its own type; all problems reported at once, keyed by field name. */
export function manualFieldRows(entry: ManualEntry, now: Date): ManualRowsResult {
  const named: Array<[string, FieldValue]> = [
    ...HEADER_FIELDS.map((name): [string, FieldValue] => [name, entry.header[name]]),
    ...entry.lineItems.flatMap((line, index) => LINE_FIELDS.map((name): [string, FieldValue] => [`lineItems[${index}].${name}`, line[name]])),
  ];
  const errors: Record<string, string> = {};
  const rows: ManualFieldRow[] = [];
  for (const [position, [name, raw]] of named.entries()) {
    const checked = validateCorrection(name, raw);
    if (!checked.ok) errors[name] = checked.error;
    else rows.push({ position, field_name: name, value: null, confidence: 0, source_quote: null, corrected_value: checked.value, corrected_at: now.toISOString() });
  }
  if (rows.every((row) => row.corrected_value === null) && Object.keys(errors).length === 0) {
    errors.form = "Enter at least one field from the document.";
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, rows };
}
