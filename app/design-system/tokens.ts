import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";

export type Swatch = { token: string; step: string; hex: string };

/**
 * Reads the colour tokens straight out of globals.css so the showcase can never
 * drift from the real values. Runs at build time; the page is static.
 */
export function readColorTokens(): Record<string, Swatch[]> {
  const css = readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");
  const families: Record<string, Swatch[]> = {};
  for (const [, token, hex] of css.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-f]{3,8});/gi)) {
    const match = token.match(/^([a-z]+)(?:-(\d+))?$/);
    if (!match) continue;
    const [, family, step = family] = match;
    (families[family] ??= []).push({ token, step, hex });
  }
  return families;
}
