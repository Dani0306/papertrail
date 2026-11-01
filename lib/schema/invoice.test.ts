import { Output } from "ai";
import { describe, expect, it } from "vitest";
import { Invoice, flattenFields } from "./invoice";

const quoted = <T>(value: T, sourceQuote: string, confidence = 0.95) => ({ value, confidence, sourceQuote });
const absent = (confidence = 0.9) => ({ value: null, confidence, sourceQuote: null });

/** Cobalt Ridge sample (samples/synthetic-cobalt-ridge-inv-0587.pdf), as a correct extraction. */
function cobaltRidge() {
  return {
    vendor: quoted("Cobalt Ridge Print Co.", "Cobalt Ridge Print Co."),
    invoiceNumber: quoted("CR-2026-0587", "No. CR-2026-0587"),
    issueDate: quoted("28 Oct 2026", "28 Oct 2026"),
    dueDate: quoted("27 Nov 2026", "27 Nov 2026"),
    currency: quoted("EUR", "EUR (€)"),
    lineItems: [
      {
        description: quoted("Business cards, 400 gsm, soft-touch", "Business cards, 400 gsm, soft-touch"),
        qty: quoted(4, "4"),
        unitPrice: quoted(48, "€48.00"),
        lineTotal: quoted(192, "€192.00"),
      },
    ],
    subtotal: quoted(1016.5, "€1,016.50"),
    tax: quoted(213.47, "€213.47"),
    total: quoted(1229.97, "€1,229.97"),
  };
}

describe("Invoice schema", () => {
  it("accepts a complete extraction", () => {
    expect(Invoice.safeParse(cobaltRidge()).success).toBe(true);
  });

  it("accepts absent fields as null value and null quote", () => {
    expect(Invoice.safeParse({ ...cobaltRidge(), dueDate: absent(), lineItems: [] }).success).toBe(true);
  });

  it("rejects a value without evidence", () => {
    const result = Invoice.safeParse({ ...cobaltRidge(), total: { value: 1229.97, confidence: 0.9, sourceQuote: null } });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["total", "sourceQuote"]);
  });

  it("rejects a quote without a value, an empty string value and a blank quote", () => {
    expect(Invoice.safeParse({ ...cobaltRidge(), tax: { value: null, confidence: 0.4, sourceQuote: "VAT" } }).success).toBe(false);
    expect(Invoice.safeParse({ ...cobaltRidge(), vendor: quoted("", "Cobalt") }).success).toBe(false);
    expect(Invoice.safeParse({ ...cobaltRidge(), vendor: quoted("Cobalt", "  ") }).success).toBe(false);
  });

  it("rejects out-of-range confidence, a non-ISO currency and missing fields", () => {
    expect(Invoice.safeParse({ ...cobaltRidge(), total: quoted(1229.97, "€1,229.97", 1.2) }).success).toBe(false);
    expect(Invoice.safeParse({ ...cobaltRidge(), currency: quoted("€", "€") }).success).toBe(false);
    const missingTax: Partial<ReturnType<typeof cobaltRidge>> = cobaltRidge();
    delete missingTax.tax;
    expect(Invoice.safeParse(missingTax).success).toBe(false);
  });
});

describe("JSON schema sent to OpenAI", () => {
  type Node = Record<string, unknown>;

  async function jsonSchema(): Promise<Node> {
    const format = await Output.object({ schema: Invoice, name: "invoice" }).responseFormat;
    if (format?.type !== "json" || !format.schema) throw new Error("Expected a JSON response format");
    return format.schema as unknown as Node;
  }

  function objects(node: unknown, found: Node[] = []): Node[] {
    if (Array.isArray(node)) node.forEach((child) => objects(child, found));
    else if (node && typeof node === "object") {
      const record = node as Node;
      if (record.type === "object" || record.properties) found.push(record);
      Object.values(record).forEach((child) => objects(child, found));
    }
    return found;
  }

  it("meets strict mode: every property required and no additional properties", async () => {
    const all = objects(await jsonSchema());
    expect(all.length).toBeGreaterThan(5);
    for (const object of all) {
      const keys = Object.keys(object.properties as Node);
      expect(object.required).toEqual(expect.arrayContaining(keys));
      expect(object.additionalProperties).toBe(false);
    }
  });

  it("uses only keywords strict mode supports", async () => {
    const text = JSON.stringify(await jsonSchema());
    for (const keyword of ['"allOf"', '"not"', '"if"', '"minLength"', '"maxLength"']) {
      expect(text).not.toContain(keyword);
    }
    expect(text).toContain('"pattern"');
    expect(text).toContain('"minimum"');
  });

  // Prompt 006: without this, absent fields came back as null @ 1 in most runs and null @ 0 in one.
  it("tells the model what confidence means on a null value, on every field", async () => {
    const confidences = objects(await jsonSchema()).map((object) => (object.properties as Node).confidence as Node | undefined);
    const described = confidences.filter((node) => node !== undefined);
    expect(described.length).toBeGreaterThan(10);
    for (const node of described) expect(node.description).toMatch(/null value: how sure you are the field is absent/);
  });
});

describe("flattenFields", () => {
  it("lists scalar fields and addresses line items by index", () => {
    const names = flattenFields(Invoice.parse(cobaltRidge())).map((field) => field.name);
    expect(names).toContain("vendor");
    expect(names).toContain("lineItems[0].unitPrice");
    expect(names).toHaveLength(8 + 4);
  });
});
