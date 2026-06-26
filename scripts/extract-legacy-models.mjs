/**
 * Free, deterministic backfill of model_clean for legacy appliances (no AI; the
 * Anthropic account is out of credits). Conservative: only writes a model when a
 * clear code is found, else leaves it null (better blank than wrong on a sourcing tool).
 *
 *   node scripts/extract-legacy-models.mjs           # PREVIEW only (no write)
 *   node scripts/extract-legacy-models.mjs --apply   # write model_clean
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

for (const line of fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!(m[1] in process.env)) process.env[m[1]] = v;
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const APPLY = process.argv.includes("--apply");

const MEASUREMENT = /^\d+(\.\d+)?(l|ml|w|v|kg|g|cu|cm|mm|in)$/i;

function extractModel(name) {
  const s = String(name || "").replace(/^RoyalStar\s+/i, "").replace(/\(ti\)/gi, " ").replace(/·/g, " ").trim();
  const isCode = (t) => /\d/.test(t) && t.length >= 2 && !MEASUREMENT.test(t) && (/[A-Z]/i.test(t) || /^\d{3,4}$/.test(t));

  const matches = [];
  for (const m of s.matchAll(/[A-Z0-9]+(?:[-/][A-Z0-9]+)*/g)) matches.push({ t: m[0].replace(/[-/]+$/, ""), i: m.index });
  const cands = matches.filter((x) => isCode(x.t));
  if (!cands.length) return null;
  cands.sort((a, b) => (b.t.includes("-") - a.t.includes("-")) || b.t.length - a.t.length);

  // drop a trailing "-E"/"-B"/… that is really the capitalized initial of the next word ("-Electric")
  let code = cands[0].t.replace(/-[A-Z]$/, "");
  // if the code starts with a digit, prepend an immediately-preceding all-letter prefix (XDM 228 -> XDM-228)
  if (/^\d/.test(code)) {
    const before = s.slice(0, cands[0].i).match(/([A-Z]{1,4})[\s-]*$/);
    if (before) code = `${before[1]}-${code}`;
  }
  return code;
}

const { data, error } = await sb.from("products")
  .select("id, external_ref, name")
  .eq("line", "appliance").is("model", null).is("model_clean", null);
if (error) throw error;

let hit = 0;
const rows = data.map((p) => {
  const model = extractModel(p.name);
  if (model) hit++;
  return { id: p.id, name: p.name, model };
});

console.log(`PREVIEW — ${hit}/${rows.length} got a model:\n`);
for (const r of rows) console.log(`  ${r.model ? r.model.padEnd(14) : "(none)".padEnd(14)} ⟵ ${r.name}`);

if (APPLY) {
  let done = 0;
  for (const r of rows.filter((r) => r.model)) {
    const { error: e } = await sb.from("products").update({ model_clean: r.model }).eq("id", r.id);
    if (e) console.error("FAIL", r.id, e.message);
    else done++;
  }
  console.log(`\nAPPLIED model_clean to ${done} products.`);
}
process.exit(0);
