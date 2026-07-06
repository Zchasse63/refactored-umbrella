/**
 * Batch competitor discovery for any line, reusing the app's exact modules.
 * Run: npx tsx scripts/discover-line.mts <appliance|beauty|foodservice> [--limit N] [--missing]
 *   --missing : only products with 0 competitors (default fills gaps)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("="); if (i > 0 && !line.trim().startsWith("#")) { const k=line.slice(0,i).trim(); const v=line.slice(i+1).trim().replace(/^["']|["']$/g,""); if(!process.env[k]) process.env[k]=v; }
}
const { buildSearchProfile } = await import("@/lib/ai/build-profile");
const { keepaFinder } = await import("@/lib/keepa/product-finder");
const { getKeepaProducts, mapKeepaToCompetitor } = await import("@/lib/keepa/client");
const { verifyCompetitor } = await import("@/lib/ai/verify-competitor");
const OWNER = "1f467381-73d9-4df6-886d-0136fde445d4";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const sleep = (ms:number)=>new Promise(r=>setTimeout(r,ms));
const LINE = process.argv.find(a=>["appliance","beauty","foodservice"].includes(a)) ?? "appliance";
const li = process.argv.indexOf("--limit"); const LIMIT = li>=0 ? Number(process.argv[li+1]) : Infinity;
const { data: allP } = await sb.from("products").select("id, external_ref, name, line, specs").eq("line", LINE).order("name");
const { data: comps } = await sb.from("competitors").select("product_id");
const has = new Set((comps??[]).map((c:any)=>c.product_id));
let products = (allP??[]).filter((p:any)=>!has.has(p.id));   // only missing
products = products.slice(0, LIMIT);
console.log(`[${LINE}] discovering ${products.length} products (missing competitors)\n`);
let ok=0;
for (const prow of products as any[]) {
  const product = { name: prow.name, line: prow.line, specs: prow.specs ?? [] } as any;
  const ourDesc = `${product.name} | ${(product.specs||[]).map((s:any)=>`${s.label}: ${s.value}`).join("; ")}`;
  try {
    const profile = await buildSearchProfile(product, []);
    const sort = [["monthlySold","desc"]] as [string,"asc"|"desc"][];
    let asins = await keepaFinder({ title: profile.title, sort });
    if (!asins.length) { const short = profile.title.split(/\s+/).slice(0,3).join(" "); if (short && short.toLowerCase()!==profile.title.toLowerCase()) asins = await keepaFinder({ title: short, sort }); }
    asins = asins.slice(0,8);
    if (!asins.length) { console.log(`  ✗ ${product.name} — 0 candidates (title="${profile.title}")`); await sleep(3000); continue; }
    const { products: kp } = await getKeepaProducts(asins);
    const rows:any[]=[];
    for (const p of kp) {
      const cand = mapKeepaToCompetitor(p);
      let verdict; try { verdict = await verifyCompetitor(ourDesc, `${cand.title} (ASIN ${cand.asin}, $${cand.price ?? "?"})`); } catch { continue; }
      if (verdict.is_match && verdict.confidence >= 0.5) rows.push({ product_id: prow.id, status:"approved", ...cand, match_confidence: verdict.confidence, match_reason: verdict.reason, created_by: OWNER, enriched_at: new Date().toISOString() });
    }
    if (!rows.length) { console.log(`  ✗ ${product.name} — found ${kp.length}, kept 0`); await sleep(3000); continue; }
    const { error: insErr } = await sb.from("competitors").insert(rows);
    if (insErr) { console.log(`  ! ${product.name} — insert err: ${insErr.message}`); await sleep(3000); continue; }
    ok++; console.log(`  ✓ ${product.name} — found ${kp.length}, kept ${rows.length} (top: ${rows[0].title?.slice(0,40)})`);
  } catch (e:any) { console.log(`  ! ${product.name} — ERR ${e?.message ?? e}`); }
  await sleep(3000);
}
console.log(`\n[${LINE}] done — ${ok}/${products.length} got competitors`);
process.exit(0);
