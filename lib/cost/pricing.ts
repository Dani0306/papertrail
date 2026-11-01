// Prices copied from the pricing page, never estimated. Update the table and the
// date together, and only from the page itself.
export const PRICING_SOURCE = "https://developers.openai.com/api/docs/pricing";
export const PRICING_READ_ON = "2026-11-01";

/** USD per 1M tokens, standard tier, short context. */
export const PRICES: Record<string, { input: number; cachedInput: number; output: number }> = {
  "gpt-6-luna": { input: 0.1, cachedInput: 0.01, output: 0.5 },
  "gpt-6.1-sol": { input: 2.0, cachedInput: 0.1, output: 10.0 },
};

/** The token counts cost depends on; reasoning tokens are already inside outputTokens. */
export type BilledTokens = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
};

export class UnknownModelPriceError extends Error {
  constructor(model: string) {
    super(`No price for "${model}" in lib/cost/pricing.ts. Copy it from ${PRICING_SOURCE} first.`);
    this.name = "UnknownModelPriceError";
  }
}

/** Uncached input at the input rate, cache hits at the cached rate, all output at the output rate. */
export function callCostUsd(model: string, tokens: BilledTokens): number {
  const price = PRICES[model];
  if (!price) throw new UnknownModelPriceError(model);
  const uncached = Math.max(0, tokens.inputTokens - tokens.cachedInputTokens);
  const perMillion =
    uncached * price.input + tokens.cachedInputTokens * price.cachedInput + tokens.outputTokens * price.output;
  // Prices are per 1M tokens. Keep 8 decimals so a $0.0016 call doesn't round to zero.
  return Math.round((perMillion / 1e6) * 1e8) / 1e8;
}
