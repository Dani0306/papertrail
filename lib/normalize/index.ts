// The one place values are normalised before comparison: the eval scorer uses
// it now, and the export will. CLAUDE.md: a mismatch caused by formatting is a
// scorer bug, not a model error, so every rule here is tested.

/** How the document writes numeric dates. "10/09/2026" can't be read without it. */
export type DateOrder = "dmy" | "mdy" | "ymd";

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  // Spanish, for the Colombian sample's language.
  ene: 1, abr: 4, ago: 8, dic: 12,
};

/**
 * A printed date as ISO yyyy-mm-dd, or null if it can't be read. Numeric dates
 * follow `order`; dates with a month name or a leading 4-digit year don't need it.
 */
export function normalizeDate(input: string | null, order: DateOrder): string | null {
  if (input === null) return null;
  const text = input.trim().toLowerCase().replace(/\s+/g, " ");

  // 2026-10-24, 2026/10/24
  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text);
  if (match) return iso(+match[1], +match[2], +match[3]);

  // 14/10/2026, 10/30/2026, 14.10.2026, 14-10-2026
  match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(text);
  if (match) {
    const [a, b, year] = [+match[1], +match[2], +match[3]];
    return order === "mdy" ? iso(year, a, b) : iso(year, b, a);
  }

  // 28 Oct 2026, 21-OCT-2026, 27 de noviembre de 2026
  match = /^(\d{1,2})[ -](?:de )?([a-z]+)\.?[ ,-]*(?:de )?(\d{4})$/.exec(text);
  if (match) return iso(+match[3], month(match[2]), +match[1]);

  // Oct 22, 2026, October 27, 2026
  match = /^([a-z]+)\.? (\d{1,2}),? (\d{4})$/.exec(text);
  if (match) return iso(+match[3], month(match[1]), +match[2]);

  return null;
}

const NUMERIC_DMY_OR_MDY = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/;

/**
 * The order a document writes its numeric dates in, worked out from its own
 * dates, or null when they can't settle it. A part above 12 decides
 * (14/10/2026 is dmy, 10/30/2026 is mdy); a leading 4-digit year is ymd; month
 * names and ISO dates don't need an order. Conflicting evidence gives null:
 * an export must say "check" rather than pick one.
 */
export function inferDateOrder(dates: Array<string | null>): DateOrder | null {
  const votes = new Set<DateOrder>();
  let ambiguous = false;
  for (const raw of dates) {
    if (raw === null) continue;
    const text = raw.trim();
    if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(text)) {
      votes.add("ymd");
      continue;
    }
    const match = NUMERIC_DMY_OR_MDY.exec(text);
    if (!match) continue; // a month name or something unreadable: no evidence either way
    const [a, b] = [Number(match[1]), Number(match[2])];
    if (a > 12 && b <= 12) votes.add("dmy");
    else if (b > 12 && a <= 12) votes.add("mdy");
    else if (a !== b) ambiguous = true; // 10/09: either order; 05/05 reads the same both ways
  }
  // ymd only speaks for ISO-style dates; a document mixing it with day/month dates decides those separately.
  votes.delete("ymd");
  if (votes.size > 1) return null;
  if (votes.size === 1) return [...votes][0];
  return ambiguous ? null : "dmy"; // nothing numeric is ambiguous, so any order reads every date the same
}

/**
 * Every date of a document as ISO, using the order its own dates settle. A
 * numeric date that needs an order the document doesn't settle stays null and
 * is reported, so the export can show the printed text and ask for a check.
 */
export function normalizeDocumentDates<K extends string>(dates: Record<K, string | null>): {
  iso: Record<K, string | null>;
  unsettled: K[];
} {
  const order = inferDateOrder(Object.values(dates) as Array<string | null>);
  const iso = {} as Record<K, string | null>;
  const unsettled: K[] = [];
  for (const key of Object.keys(dates) as K[]) {
    const text = dates[key];
    if (text === null) {
      iso[key] = null;
      continue;
    }
    const needsOrder = NUMERIC_DMY_OR_MDY.test(text.trim());
    const value = needsOrder ? (order ? normalizeDate(text, order) : null) : normalizeDate(text, "dmy");
    iso[key] = value;
    if (value === null) unsettled.push(key);
  }
  return { iso, unsettled };
}

function month(name: string): number {
  return MONTHS[name.slice(0, 3)] ?? MONTHS[name.slice(0, 4)] ?? 0;
}

/** ISO date, or null when the parts aren't a real calendar date (31/02, month 13). */
function iso(year: number, monthNumber: number, day: number): string | null {
  const date = new Date(Date.UTC(year, monthNumber - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== monthNumber - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

/** Amounts compare as integer cents, never floats: 0.1 + 0.2 and 0.3 are the same 30 cents. */
export function toCents(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

/** Case-folded, Unicode-normalised, whitespace collapsed. Nothing else: "#000482" stays distinct from "000482". */
export function normalizeText(value: string | null): string | null {
  if (value === null) return null;
  const text = value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  return text === "" ? null : text;
}
