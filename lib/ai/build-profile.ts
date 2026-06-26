/**
 * Search-profile builder — Sonnet turns a product's specs (+ learned exclude terms)
 * into a Keepa Product Finder selection (AI_LAYER.md §2, step 1). The category node
 * is resolved separately from Keepa's category search; Claude only picks the keywords,
 * price band, and exclusions. Server-only.
 */
import { z } from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, MODELS } from "./client";
import type { Product } from "@/lib/types";

export const ProfileSchema = z.object({
  category_keyword: z.string(), // fed to Keepa search_for_categories
  title: z.string(), // Finder title keyword(s)
  exclude_terms: z.array(z.string()),
  price_low: z.number().nullable(), // USD; null = open
  price_high: z.number().nullable(),
});
export type SearchProfile = z.infer<typeof ProfileSchema>;

export async function buildSearchProfile(
  product: Product,
  learnedExcludes: string[] = [],
): Promise<SearchProfile> {
  const specs = product.specs.map((s) => `${s.label}: ${s.value}`).join("; ");
  const res = await anthropic().messages.parse({
    model: MODELS.reason,
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content:
          `Build an Amazon competitor search profile for this factory product so we can find ` +
          `its real top-selling competitive set on Amazon US.\n\n` +
          `NAME: ${product.name}\nLINE: ${product.line}\nSPECS: ${specs}\n` +
          `ALREADY-REJECTED (exclude these): ${learnedExcludes.join(", ") || "none"}\n\n` +
          `Return: a category keyword for category lookup, concise title search terms, ` +
          `a sensible USD price band, and exclude terms (accessories, wrong sizes, bundles).`,
      },
    ],
    output_config: { format: zodOutputFormat(ProfileSchema) },
  });
  return res.parsed_output!;
}
