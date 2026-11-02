import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Invoice, LineItem } from "@/lib/schema/invoice";
import type { Expected, GoldenFile } from "./score";

// Guards the ground truth itself: a typo here would make every reported number wrong.

const goldens: GoldenFile[] = readdirSync("evals/golden")
  .filter((name) => name.endsWith(".json"))
  .map((name) => JSON.parse(readFileSync(`evals/golden/${name}`, "utf8")) as GoldenFile);

const values = (expected: Expected) => (expected !== null && typeof expected === "object" ? expected.accept : [expected]);
const cents = (value: Expected) => Math.round((values(value)[0] as number) * 100);

/** The source's visible text: HTML without tags or styles, or the PDF content stream. */
function sourceText(golden: GoldenFile): string {
  const raw = readFileSync(golden.source.replace(/ \(.*\)$/, ""), golden.source.endsWith(".pdf (content stream)") ? "latin1" : "utf8");
  return raw
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\s+/g, " ");
}

/** The ways an amount can be printed: 1,284.50 · 1284.50 · 1.284,50 (Colombian) · 1284.5. */
function printedForms(amount: number): string[] {
  const abs = Math.abs(amount);
  const en = abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return [en, en.replaceAll(",", ""), en.replaceAll(",", "#").replace(".", ",").replaceAll("#", "."), String(abs)];
}

describe("golden files", () => {
  it("cover every sample, one file each", () => {
    const samples = readdirSync("samples").filter((name) => /\.(pdf|png|jpe?g|webp)$/.test(name)).sort();
    expect(goldens.map((golden) => golden.file).sort()).toEqual(samples);
  });

  it.each(goldens.map((golden) => [golden.file, golden] as const))("%s: field names match the Invoice schema", (_, golden) => {
    expect(Object.keys(golden.invoice).sort()).toEqual(Object.keys(Invoice.shape).sort());
    for (const line of golden.invoice.lineItems) expect(Object.keys(line).sort()).toEqual(Object.keys(LineItem.shape).sort());
    expect(["dmy", "mdy", "ymd"]).toContain(golden.dateOrder);
  });

  it.each(goldens.map((golden) => [golden.file, golden] as const))("%s: lines sum to the subtotal and subtotal + tax = total, in cents", (_, golden) => {
    const { lineItems, subtotal, tax, total } = golden.invoice;
    expect(lineItems.reduce((sum, line) => sum + cents(line.lineTotal), 0)).toBe(cents(subtotal));
    expect(cents(subtotal) + cents(tax)).toBe(cents(total));
  });

  it.each(goldens.map((golden) => [golden.file, golden] as const))("%s: every amount and description is printed in the source", (_, golden) => {
    const text = sourceText(golden);
    const { lineItems, subtotal, tax, total } = golden.invoice;
    // Quarry & Ash prints its total as $6l2.14 (rule 3: the golden value is the intended 612.14).
    const amounts = [subtotal, tax, ...(golden.file.includes("quarry") ? [] : [total])];
    for (const line of lineItems) amounts.push(line.lineTotal, ...(line.unitPrice === null ? [] : [line.unitPrice]));
    for (const amount of amounts) {
      const forms = printedForms(values(amount)[0] as number);
      expect(forms.some((form) => text.includes(form)), `${values(amount)[0]} not found as any of ${forms.join(" | ")}`).toBe(true);
    }
    for (const line of lineItems) {
      const main = String(values(line.description)[0]);
      expect(text.includes(main), `"${main}" not in the source`).toBe(true);
    }
  });
});
