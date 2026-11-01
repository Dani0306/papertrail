import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import type { InvoiceFile } from "@/lib/extract/types";
import { type UploadType, uploadProblem } from "@/lib/uploads";

const MEDIA_TYPES: Record<string, UploadType> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

export const SAMPLE_EXTENSIONS = Object.keys(MEDIA_TYPES);

/**
 * `npm run x --flag v` hands `--flag` to npm, not the script: the script sees
 * only `v`, and npm sets npm_config_flag. Returns a fix-it message if that
 * happened, so a typo'd command can't silently run a paid call with defaults.
 */
export function swallowedFlagProblem(script: string, flags: string[]): string | null {
  const swallowed = flags.filter((flag) => process.env[`npm_config_${flag}`] !== undefined);
  if (swallowed.length === 0) return null;
  const example = swallowed.map((flag) => `--${flag} <value>`).join(" ");
  return `npm kept ${swallowed.map((flag) => `--${flag}`).join(", ")} for itself. Put -- before the script's arguments: npm run ${script} -- ${script === "extract" ? "<file> " : ""}${example}`;
}

/**
 * Reads a document for extraction under the same rules as the upload box
 * (type and 10 MB), so scripts accept exactly what the app accepts.
 */
export async function readInvoiceFile(path: string): Promise<{ file: InvoiceFile } | { problem: string }> {
  const fileName = basename(path);
  const size = await stat(path).then((s) => s.size, () => -1);
  if (size < 0) return { problem: `Can't read ${path}.` };

  const mediaType = MEDIA_TYPES[extname(path).toLowerCase()] ?? "";
  const problem = uploadProblem({ name: fileName, type: mediaType, size });
  if (problem) return { problem: `${fileName}: ${problem}` };

  const bytes = new Uint8Array(await readFile(path));
  return { file: { bytes, mediaType: mediaType as UploadType, fileName } };
}
