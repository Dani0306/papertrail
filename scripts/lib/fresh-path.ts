import { access } from "node:fs/promises";
import { resolve } from "node:path";

/** `<base>.json`, or `<base>-2.json`, `-3`… if an earlier run already took the name. */
export async function freshPath(base: string): Promise<string> {
  for (let n = 1; ; n++) {
    const path = resolve(`${base}${n === 1 ? "" : `-${n}`}.json`);
    const taken = await access(path).then(() => true, () => false);
    if (!taken) return path;
  }
}
