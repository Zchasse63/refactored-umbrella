/**
 * Competitor match verification — the structured Haiku judge that gates candidates
 * BEFORE they reach the UI (AI_LAYER.md §2, step 3). Cheap, strict, returns a
 * validated verdict. Server-only.
 */
import { z } from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, MODELS } from "./client";

export const VerdictSchema = z.object({
  is_match: z.boolean(),
  confidence: z.number(), // 0..1
  reason: z.string(),
  flags: z.array(z.string()), // e.g. ["accessory","wrong_capacity","bundle"]
});
export type Verdict = z.infer<typeof VerdictSchema>;

export async function verifyCompetitor(ourProduct: string, candidate: string): Promise<Verdict> {
  const res = await anthropic().messages.parse({
    model: MODELS.verify,
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content:
          `OUR PRODUCT:\n${ourProduct}\n\nCANDIDATE COMPETITOR (from Amazon):\n${candidate}\n\n` +
          `Is the candidate a true like-for-like competitor a buyer would cross-shop? ` +
          `Reject accessories, bundles, wrong size/capacity, or different use. Be strict.`,
      },
    ],
    output_config: { format: zodOutputFormat(VerdictSchema) },
  });
  return res.parsed_output!;
}
