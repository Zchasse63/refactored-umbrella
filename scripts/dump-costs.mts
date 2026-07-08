/**
 * Dump the foodservice cost map (external_ref → base cost) as JSON on stdout.
 * Base cost = our_cost when set, else the Greenway FOB extrapolation (estimateFobCost).
 * Run: npx tsx scripts/dump-costs.mts   — stdout is the JSON map ONLY; logs go to stderr.
 * Exits nonzero if the map comes back empty so callers can hard-fail instead of shipping blanks.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("="); if (i > 0 && !line.trim().startsWith("#")) { const k=line.slice(0,i).trim(); const v=line.slice(i+1).trim().replace(/^["']|["']$/g,""); if(!process.env[k]) process.env[k]=v; }
}
const { estimateFobCost } = await import("@/lib/calc/fob");
const round2 = (n: number) => Math.round(n * 100) / 100;
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const { data: prods, error } = await sb.from("products").select("external_ref, group_name, specs, our_cost").eq("line", "foodservice").order("name");
if (error) { console.error(`! products fetch failed: ${error.message}`); process.exit(1); }
const costs: Record<string, number> = {};
for (const p of (prods ?? []) as any[]) {
  const base = p.our_cost != null ? Number(p.our_cost) : estimateFobCost(p.group_name, p.specs ?? [])?.fobPerPack;
  if (base != null && Number.isFinite(base)) costs[p.external_ref] = round2(base);
  else console.error(`  ✗ ${p.external_ref} — no cost (our_cost empty, no FOB estimate)`);
}
if (!Object.keys(costs).length) { console.error("! cost map is empty — refusing to dump"); process.exit(1); }
console.error(`✓ ${Object.keys(costs).length}/${(prods ?? []).length} foodservice costs`);
console.log(JSON.stringify(costs));
process.exit(0);
