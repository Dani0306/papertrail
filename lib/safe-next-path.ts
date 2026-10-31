/**
 * Returns `next` only when it is a same-site path, otherwise "/". Guards the
 * sign-in and callback redirects: "//evil.com" and "/\evil.com" start with "/"
 * but browsers treat them as another host.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/")) return "/";
  if (next.length > 1 && (next[1] === "/" || next[1] === "\\")) return "/";
  // Control characters (tabs, newlines) are stripped by browsers and can rebuild "//".
  if (/[\u0000-\u001f\u007f]/.test(next)) return "/";
  return next;
}
