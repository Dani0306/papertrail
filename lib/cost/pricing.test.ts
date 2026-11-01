import { describe, expect, it } from "vitest";
import { UnknownModelPriceError, callCostUsd } from "./pricing";

describe("callCostUsd", () => {
  it("prices input and output per 1M tokens", () => {
    // 3,000 × $0.10/M + 2,000 × $0.50/M = $0.0003 + $0.001
    expect(callCostUsd("gpt-6-luna", { inputTokens: 3000, cachedInputTokens: 0, outputTokens: 2000 })).toBe(0.0013);
  });

  it("bills cache hits at the cached rate, not twice", () => {
    // 1,000 uncached × $0.10/M + 2,000 cached × $0.01/M + 500 × $0.50/M
    expect(callCostUsd("gpt-6-luna", { inputTokens: 3000, cachedInputTokens: 2000, outputTokens: 500 })).toBe(0.00037);
  });

  it("uses each model's own prices", () => {
    expect(callCostUsd("gpt-6.1-sol", { inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 1_000_000 })).toBe(12);
  });

  it("is zero for zero tokens and never negative", () => {
    expect(callCostUsd("gpt-6-luna", { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 })).toBe(0);
    expect(callCostUsd("gpt-6-luna", { inputTokens: 10, cachedInputTokens: 50, outputTokens: 0 })).toBe(0.0000005);
  });

  it("refuses to guess a price for an unknown model", () => {
    expect(() => callCostUsd("gpt-9-imaginary", { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 })).toThrow(
      UnknownModelPriceError,
    );
  });
});
