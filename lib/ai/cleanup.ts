/**
 * Copy cleanup — Sonnet rewrites machine-translated factory copy (Chinese → English)
 * into clean, natural, professional product copy (AI_LAYER.md §3). Produces a tidy
 * display name, an extracted model code, a one-line summary, and rewritten feature
 * bullets. Honest: it never invents specs or numbers not present in the source.
 * Server-only. Results are persisted to products.{name_clean,model,summary,features_clean}.
 */
import { z } from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, MODELS } from "./client";
import type { Product } from "@/lib/types";

export const CleanCopySchema = z.object({
  name_clean: z.string(), // tidy display name, model code removed, proper title case
  model: z.string().nullable(), // model/SKU code if one is embedded in the raw name, else null
  summary: z.string(), // one natural English sentence: what it is + its key benefit
  features_clean: z.array(z.string()), // 3–6 fluent, concise feature bullets
});
export type CleanCopy = z.infer<typeof CleanCopySchema>;

export interface CleanupInput {
  name: string;
  line: string;
  specs: { label: string; value: string }[];
  features: string[];
}

const PROMPT = (p: CleanupInput) => {
  const specs = p.specs.map((s) => `${s.label}: ${s.value}`).join("; ") || "(none)";
  const features = p.features.length ? p.features.map((f, i) => `${i + 1}. ${f}`).join("\n") : "(none)";
  return (
    `You are an e-commerce copy editor. This product's copy was machine-translated from ` +
    `Chinese and reads awkwardly. Rewrite it into clean, natural, professional US-English ` +
    `suitable for a real marketplace product page. Do NOT invent any specification, number, ` +
    `material, or claim that is not present in the source. Keep it factual and concise.\n\n` +
    `RAW NAME: ${p.name}\n` +
    `CATEGORY: ${p.line}\n` +
    `SPECS: ${specs}\n` +
    `RAW FEATURES:\n${features}\n\n` +
    `Return:\n` +
    `- name_clean: a tidy product title in title case. Remove any embedded model/SKU code ` +
    `(e.g. "FH-A10", "RKT17AW", "AMOS-AS-FH12Q") and trailing marketing words. Keep it short ` +
    `and natural, e.g. "Electric Lunch Box for Car & Office".\n` +
    `- model: the model/SKU code if one is embedded in the raw name, otherwise null.\n` +
    `- summary: ONE fluent sentence describing what the product is and its main benefit. ` +
    `No marketing fluff, no translated phrasing like "plug-in scenarios".\n` +
    `- features_clean: 3 to 6 concise bullet points rewritten in fluent, natural English. ` +
    `Fix grammar, capitalization and awkward translation; merge redundant points; drop empty ` +
    `filler. Each bullet is a clean phrase or short sentence with no trailing punctuation artifacts.`
  );
};

export async function cleanProductCopy(p: CleanupInput): Promise<CleanCopy> {
  const res = await anthropic().messages.parse({
    model: MODELS.reason,
    max_tokens: 1200,
    messages: [{ role: "user", content: PROMPT(p) }],
    output_config: { format: zodOutputFormat(CleanCopySchema) },
  });
  return res.parsed_output!;
}

export type { Product };
