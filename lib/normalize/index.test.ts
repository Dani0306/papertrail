import { describe, expect, it } from "vitest";
import { normalizeDate, normalizeText, toCents } from "./index";

describe("normalizeDate", () => {
  it.each([
    // Every format the samples print.
    ["2026-10-24", "ymd", "2026-10-24"],
    ["14/10/2026", "dmy", "2026-10-14"],
    ["10/30/2026", "mdy", "2026-10-30"],
    ["28 Oct 2026", "dmy", "2026-10-28"],
    ["Oct 22, 2026", "mdy", "2026-10-22"],
    ["October 27, 2026", "mdy", "2026-10-27"],
    ["21-OCT-2026", "dmy", "2026-10-21"],
    ["  Nov 21, 2026 ", "mdy", "2026-11-21"],
    ["15 de octubre de 2026", "dmy", "2026-10-15"],
    ["14.10.2026", "dmy", "2026-10-14"],
  ] as const)("reads %s (%s) as %s", (input, order, expected) => {
    expect(normalizeDate(input, order)).toBe(expected);
  });

  it("uses the document's order for an ambiguous numeric date", () => {
    expect(normalizeDate("10/09/2026", "mdy")).toBe("2026-10-09");
    expect(normalizeDate("10/09/2026", "dmy")).toBe("2026-09-10");
  });

  it("returns null for something that isn't a real date, rather than guessing", () => {
    expect(normalizeDate("31/02/2026", "dmy")).toBeNull();
    expect(normalizeDate("13/30/2026", "mdy")).toBeNull();
    expect(normalizeDate("next Tuesday", "dmy")).toBeNull();
    expect(normalizeDate("Smarch 3, 2026", "mdy")).toBeNull();
    expect(normalizeDate(null, "dmy")).toBeNull();
  });
});

describe("toCents", () => {
  it("compares amounts as integer cents", () => {
    expect(toCents(0.1 + 0.2)).toBe(toCents(0.3));
    expect(toCents(1284.5)).toBe(128450);
    expect(toCents(-354)).toBe(-35400);
    expect(toCents(3128510)).toBe(312851000);
  });

  it("keeps null and refuses non-finite numbers", () => {
    expect(toCents(null)).toBeNull();
    expect(toCents(Number.NaN)).toBeNull();
  });
});

describe("normalizeText", () => {
  it("folds case and collapses whitespace, nothing more", () => {
    expect(normalizeText("  HARBOR &  PINE\nSTATIONERS ")).toBe("harbor & pine stationers");
    expect(normalizeText("#000482")).not.toBe(normalizeText("000482"));
    expect(normalizeText("Ｑuarry")).toBe("quarry"); // NFKC folds full-width letters
  });

  it("treats empty text as absent", () => {
    expect(normalizeText("   ")).toBeNull();
    expect(normalizeText(null)).toBeNull();
  });
});
