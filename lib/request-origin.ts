/**
 * The origin the visitor actually used. Behind Vercel (or `next start`) the
 * request URL can carry an internal host, so the forwarded host and protocol win.
 */
export function requestOrigin(request: Request): string {
  const url = new URL(request.url);
  const host = firstValue(request.headers.get("x-forwarded-host"));
  if (!host) return url.origin;
  const protocol = firstValue(request.headers.get("x-forwarded-proto")) ?? url.protocol.slice(0, -1);
  return `${protocol}://${host}`;
}

// Proxies may append: "a.example, b.example". The first entry is the client-facing one.
function firstValue(header: string | null): string | null {
  return header?.split(",")[0]?.trim() || null;
}
