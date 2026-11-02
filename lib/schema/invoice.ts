import { z } from "zod";

// The single definition of an extracted invoice. The AI SDK turns it into the
// strict JSON schema sent to the model, and the same schema validates the reply.
// Strict JSON Schema can't express the evidence rules below, so only Zod enforces
// them after the call; breaking one is what the repair retry is for.

const confidence = z
  .number()
  .min(0)
  .max(1)
  .describe(
    "0 to 1. With a value: how sure you are it's right; below 0.85 when any character is hard to read or the field is ambiguous. With a null value: how sure you are the field is absent; 1 when you checked and it isn't printed, below 0.85 only when it might be there but you can't read it.",
  );

const sourceQuote = z
  .string()
  .nullable()
  .describe("The exact text on the document the value was read from, copied character for character. null when value is null.");

type Evidence<T extends z.ZodType, C extends boolean> = z.ZodObject<
  C extends true
    ? { value: z.ZodNullable<T>; confidence: typeof confidence; sourceQuote: typeof sourceQuote }
    : { value: z.ZodNullable<T>; sourceQuote: typeof sourceQuote }
>;

/**
 * `{ value, confidence, sourceQuote }`: every extracted value carries its evidence.
 * `withConfidence: false` drops only `confidence`, for the prompt 014 A/B; the app always asks.
 */
export function evidenceField<T extends z.ZodType, C extends boolean = true>(value: T, description: string, withConfidence: C = true as C) {
  const shared = { value: value.nullable().describe("null when the document doesn't show this field. Never guess."), sourceQuote };
  return (withConfidence ? z.object({ value: shared.value, confidence, sourceQuote }) : z.object(shared))
    .describe(description)
    .superRefine((field, ctx) => {
      // Inside this generic helper TypeScript can't see `value` on the inferred type.
      const { value, sourceQuote } = field as unknown as { value: unknown; sourceQuote: string | null };
      if (typeof value === "string" && value.trim() === "") {
        ctx.addIssue({ code: "custom", path: ["value"], message: "Use null instead of an empty string." });
      }
      if (value !== null && (sourceQuote === null || sourceQuote.trim() === "")) {
        ctx.addIssue({
          code: "custom",
          path: ["sourceQuote"],
          message: "A value needs the exact text it was read from. Quote it, or set value to null.",
        });
      }
      if (value === null && sourceQuote !== null) {
        ctx.addIssue({ code: "custom", path: ["sourceQuote"], message: "sourceQuote must be null when value is null." });
      }
    }) as unknown as Evidence<T, C>;
}

/** The invoice schema, built once from one list of fields; only whether confidence is asked varies. */
function invoiceSchema<C extends boolean>(withConfidence: C) {
  const text = (description: string) => evidenceField(z.string(), description, withConfidence);
  const amount = (description: string) => evidenceField(z.number(), description, withConfidence);

  const LineItem = z.object({
    description: text("What was sold, as printed on the line."),
    qty: amount("Quantity on the line, as a number."),
    unitPrice: amount("Price per unit as a number, without currency symbol or thousands separators."),
    lineTotal: amount("Line amount as a number, without currency symbol or thousands separators."),
  });

  const Invoice = z.object({
    vendor: text("The business that issued the invoice."),
    invoiceNumber: text("The invoice's own number. Not a purchase order, customer or tax ID."),
    issueDate: text("The invoice date exactly as printed. Not a stamp, delivery or received date."),
    dueDate: text("The payment due date exactly as printed."),
    currency: evidenceField(
      z.string().regex(/^[A-Z]{3}$/),
      "ISO 4217 code of the printed currency, e.g. EUR for €. Do not convert amounts.",
      withConfidence,
    ),
    lineItems: z.array(LineItem).describe("Every billed line, in document order. Empty if none are listed."),
    subtotal: amount("Amount before tax, as a number."),
    tax: amount("Total tax amount, as a number."),
    total: amount("The final amount due, as a number."),
  });

  return { LineItem, Invoice };
}

export const { LineItem, Invoice } = invoiceSchema(true);

/** Eval-only (prompt 014): the same invoice without `confidence`, to measure what asking for it costs. */
export const InvoiceWithoutConfidence = invoiceSchema(false).Invoice;
export type InvoiceWithoutConfidence = z.infer<typeof InvoiceWithoutConfidence>;

export type Invoice = z.infer<typeof Invoice>;
export type LineItem = z.infer<typeof LineItem>;

export type FlatField = {
  /** `vendor`, `total`, or `lineItems[2].qty` for line items. */
  name: string;
  value: string | number | null;
  confidence: number;
  sourceQuote: string | null;
};

/** One entry per field, line items addressed by index; the shape extraction_fields will store. */
export function flattenFields(invoice: Invoice): FlatField[] {
  const { lineItems, ...scalars } = invoice;
  const fields: FlatField[] = Object.entries(scalars).map(([name, field]) => ({ name, ...field }));
  lineItems.forEach((item, index) => {
    for (const [name, field] of Object.entries(item)) {
      fields.push({ name: `lineItems[${index}].${name}`, ...field });
    }
  });
  return fields;
}
