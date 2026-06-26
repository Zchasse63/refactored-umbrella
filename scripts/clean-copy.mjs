/**
 * One-off backfill: rewrite machine-translated factory copy into clean English and
 * persist to products.{name_clean,model,summary,features_clean}. Runs locally against
 * the production Supabase (service role) + Anthropic — a bulk job that would exceed a
 * serverless function timeout. Idempotent: re-running overwrites the cleaned columns.
 *
 *   node scripts/clean-copy.mjs            # clean all products
 *   node scripts/clean-copy.mjs --missing  # only products without a summary yet
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

// ── load .env.local (KEY=VALUE) without extra deps ──
for (const line of fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!(m[1] in process.env)) process.env[m[1]] = v;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE) throw new Error("missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
if (!process.env.ANTHROPIC_API_KEY) throw new Error("missing ANTHROPIC_API_KEY");

const sb = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
const ai = new Anthropic();
const ONLY_MISSING = process.argv.includes("--missing");
// Backfill just the AI-extracted model code (into model_clean) for legacy appliances
// whose mapper-owned `model` is null (and was wiped/never set by re-seed).
const MODELS_ONLY = process.argv.includes("--legacy-models");

const PROMPT = (p) => {
  const specs = (p.specs ?? []).map((s) => `${s.label}: ${s.value}`).join("; ") || "(none)";
  const features = (p.features ?? []).length
    ? p.features.map((f, i) => `${i + 1}. ${f}`).join("\n")
    : "(none)";
  return (
    `You are an e-commerce copy editor. This product's copy was machine-translated from ` +
    `Chinese and reads awkwardly. Rewrite it into clean, natural, professional US-English ` +
    `suitable for a real marketplace product page. Do NOT invent any specification, number, ` +
    `material, or claim that is not present in the source. Keep it factual and concise.\n\n` +
    `RAW NAME: ${p.name}\nCATEGORY: ${p.line}\nSPECS: ${specs}\nRAW FEATURES:\n${features}\n\n` +
    `Return ONLY a JSON object (no prose, no code fence) with these keys:\n` +
    `- name_clean: tidy product title in title case; remove any embedded model/SKU code ` +
    `(e.g. "FH-A10", "RKT17AW", "AMOS-AS-FH12Q") and trailing marketing words; short and natural.\n` +
    `- model: the model/SKU code embedded in the raw name, or null if there is none.\n` +
    `- summary: ONE fluent sentence — what the product is and its main benefit. No fluff, ` +
    `no translated phrasing like "plug-in scenarios".\n` +
    `- features_clean: array of 3 to 6 concise bullet strings in fluent natural English; ` +
    `fix grammar/capitalization, merge redundancy, drop filler; no trailing punctuation artifacts.`
  );
};

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const a = raw.indexOf("{");
  const b = raw.lastIndexOf("}");
  if (a < 0 || b < 0) throw new Error("no JSON in response");
  return JSON.parse(raw.slice(a, b + 1));
}

async function cleanOne(p) {
  const msg = await ai.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1200,
    messages: [{ role: "user", content: PROMPT(p) }],
  });
  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const j = extractJson(text);
  return {
    name_clean: String(j.name_clean || "").trim() || null,
    model: j.model ? String(j.model).trim() : null,
    summary: String(j.summary || "").trim() || null,
    features_clean: Array.isArray(j.features_clean)
      ? j.features_clean.map((s) => String(s).trim()).filter(Boolean)
      : [],
  };
}

async function run() {
  let q = sb.from("products").select("id, external_ref, name, line, specs, features").order("line").order("name");
  if (MODELS_ONLY) q = q.eq("line", "appliance").is("model", null).is("model_clean", null);
  else if (ONLY_MISSING) q = q.is("summary", null);
  const { data: products, error } = await q;
  if (error) throw error;
  const mode = MODELS_ONLY ? " (legacy model backfill)" : ONLY_MISSING ? " (missing only)" : "";
  console.log(`Cleaning ${products.length} products${mode}...`);

  const CONC = 6;
  let idx = 0, done = 0, failed = 0;
  async function worker() {
    while (idx < products.length) {
      const p = products[idx++];
      try {
        const c = await cleanOne(p);
        // model goes to model_clean (durable; seed never touches it). model_clean only when extracted.
        const upd = MODELS_ONLY
          ? {}
          : { name_clean: c.name_clean, summary: c.summary, features_clean: c.features_clean };
        if (c.model) upd.model_clean = c.model;
        if (Object.keys(upd).length) {
          const { error: uerr } = await sb.from("products").update(upd).eq("id", p.id);
          if (uerr) throw uerr;
        }
        done++;
      } catch (e) {
        failed++;
        console.error(`  FAIL ${p.external_ref}: ${e.message}`);
      }
      if ((done + failed) % 10 === 0) console.log(`  ${done + failed}/${products.length} (${failed} failed)`);
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  console.log(`Done. ${done} cleaned, ${failed} failed.`);
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
