/**
 * Anthropic client + model tiers for the AI layer (AI_LAYER.md). Server-only.
 * Haiku for the high-volume structured verify judge; Sonnet for query-build / web
 * search; Opus reserved for the hardest reasoning.
 */
import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;
export function anthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  return (_client ??= new Anthropic());
}

export const MODELS = {
  verify: "claude-haiku-4-5",
  reason: "claude-sonnet-4-6",
  deep: "claude-opus-4-8",
} as const;
