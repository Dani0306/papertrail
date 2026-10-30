import { describe, expect, it } from "vitest";
import { requestOrigin } from "./request-origin";

function request(url: string, headers: Record<string, string> = {}) {
  return new Request(url, { headers });
}

describe("requestOrigin", () => {
  it("uses the request URL when no proxy headers are present", () => {
    expect(requestOrigin(request("http://localhost:3000/auth/sign-in"))).toBe("http://localhost:3000");
  });

  it("prefers the forwarded host and protocol", () => {
    const req = request("http://internal:8080/auth/callback", {
      "x-forwarded-host": "papertrail.vercel.app",
      "x-forwarded-proto": "https",
    });
    expect(requestOrigin(req)).toBe("https://papertrail.vercel.app");
  });

  it("keeps http for a local server that forwards its own host", () => {
    const req = request("http://localhost:3100/auth/sign-in", { "x-forwarded-host": "localhost:3100" });
    expect(requestOrigin(req)).toBe("http://localhost:3100");
  });

  it("takes the first value of a comma-separated header", () => {
    const req = request("http://internal/", {
      "x-forwarded-host": "papertrail.vercel.app, internal",
      "x-forwarded-proto": "https,http",
    });
    expect(requestOrigin(req)).toBe("https://papertrail.vercel.app");
  });
});
