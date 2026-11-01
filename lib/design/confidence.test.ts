import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CONFIDENCE_THRESHOLD,
  confidenceLevel,
  confidenceThreshold,
  formatConfidence,
} from "./confidence";

describe("confidenceLevel", () => {
  it("is ok for a confident value", () => {
    expect(confidenceLevel("INV-2041", 0.97)).toBe("ok");
  });

  it("treats a confidence exactly at the threshold as ok", () => {
    expect(confidenceLevel("INV-2041", DEFAULT_CONFIDENCE_THRESHOLD)).toBe("ok");
  });

  it("flags a value below the threshold", () => {
    expect(confidenceLevel("1.240,00", 0.62)).toBe("review");
  });

  it("is missing when the model is confident the field is absent", () => {
    expect(confidenceLevel(null, 0.95)).toBe("missing");
    expect(confidenceLevel("   ", 0.95)).toBe("missing");
  });

  it("flags an absent field when the model is unsure it is absent", () => {
    expect(confidenceLevel(null, 0.4)).toBe("review");
  });

  it("flags an unreadable confidence", () => {
    expect(confidenceLevel("INV-2041", Number.NaN)).toBe("review");
  });

  it("keeps zero as a value, not as missing", () => {
    expect(confidenceLevel(0, 0.99)).toBe("ok");
  });

  it("uses a custom threshold", () => {
    expect(confidenceLevel("ACME", 0.8, 0.75)).toBe("ok");
    expect(confidenceLevel("ACME", 0.8, 0.9)).toBe("review");
  });
});

describe("formatConfidence", () => {
  it("formats as a whole percentage", () => {
    expect(formatConfidence(0.624)).toBe("62%");
    expect(formatConfidence(1)).toBe("100%");
  });

  it("clamps out-of-range values and handles NaN", () => {
    expect(formatConfidence(1.2)).toBe("100%");
    expect(formatConfidence(-0.1)).toBe("0%");
    expect(formatConfidence(Number.NaN)).toBe("—");
  });
});

describe("confidenceThreshold", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reads PAPERTRAIL_CONFIDENCE_THRESHOLD", () => {
    vi.stubEnv("PAPERTRAIL_CONFIDENCE_THRESHOLD", "0.9");
    expect(confidenceThreshold()).toBe(0.9);
  });

  it("falls back to the default when unset or out of range", () => {
    for (const value of ["", "abc", "0", "1.5", "-0.2"]) {
      vi.stubEnv("PAPERTRAIL_CONFIDENCE_THRESHOLD", value);
      expect(confidenceThreshold()).toBe(DEFAULT_CONFIDENCE_THRESHOLD);
    }
  });
});
