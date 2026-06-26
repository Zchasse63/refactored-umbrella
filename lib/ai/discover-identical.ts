/**
 * Secondary discovery — Sonnet + the web-search tool finds the IDENTICAL factory
 * product if a competitor already lists it on Amazon (the direct price signal), and
 * catches brand-new items Keepa hasn't indexed (AI_LAYER.md §2, step 2 secondary).
 * ASINs must come from a live /dp/ page Claude actually read — never model memory.
 * Server-only.
 */
import { anthropic, MODELS } from "./client";
import type { Product } from "@/lib/types";

export interface IdenticalCandidate {
  title: string;
  asin: string;
}

const standoutSpecs = (p: Product) =>
  p.specs
    .filter((s) => /(model|capacity|power|voltage|material|wattage)/i.test(s.label))
    .map((s) => `${s.label}: ${s.value}`)
    .join("; ");

export async function discoverIdentical(product: Product): Promise<IdenticalCandidate[]> {
  const res = await anthropic().messages.create({
    model: MODELS.reason,
    max_tokens: 2048,
    tools: [{ type: "web_search_20260209", name: "web_search" }],
    messages: [
      {
        role: "user",
        content:
          `Search Amazon US for the IDENTICAL product to this factory item — same unit, possibly ` +
          `rebranded — using the model number and standout specs.\n\n` +
          `NAME: ${product.name}\n${product.model ? `MODEL: ${product.model}\n` : ""}` +
          `STANDOUT SPECS: ${standoutSpecs(product) || "n/a"}\n\n` +
          `Only include an ASIN if you actually saw it on a live amazon.com /dp/ page — never invent one. ` +
          `Reply with ONLY a JSON array of { "title": string, "asin": string } (empty array if no genuine match).`,
      },
    ],
  });
  const text = res.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("\n");
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]) as IdenticalCandidate[];
    return arr.filter((c) => c?.asin && /^[A-Z0-9]{10}$/.test(c.asin));
  } catch {
    return [];
  }
}
