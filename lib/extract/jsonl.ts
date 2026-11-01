import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

/** Appends one JSON record as a line, creating the folder on first use. */
export async function appendJsonl(path: string, record: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(record)}\n`, "utf8");
}
