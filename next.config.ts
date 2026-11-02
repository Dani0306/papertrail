import type { NextConfig } from "next";

// Sent on every response. Kept to what can't break the app: no script CSP, which
// would need nonces under Partial Prerendering. frame-ancestors/X-Frame-Options
// stop another site framing the review screen (its edit buttons) for clickjacking;
// the referrer policy keeps the preview's signed URL path out of Referer headers.
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
