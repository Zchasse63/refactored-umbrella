/**
 * Attach real Amazon competitors to 6 newly-created foodservice products
 * (3 wrapped wide-bore boba/smoothie straws + 3 can liners). AMAZON-ONLY rule:
 * every competitor is a real Amazon listing pulled + enriched via Keepa.
 * Non-destructive: never deletes or updates existing rows.
 *
 * Same proven flow as scripts/attach-niche-competitors.mts — search dumps enriched
 * candidates for a MANUAL like-for-like judge (match TYPE, bore/size class, wrap,
 * and pack-count within ~2x; reject wrong sizes/bundles/drawstring/accessories/cups),
 * then attach inserts the hand-picked ASINs with the full mapKeepaToCompetitor spread.
 *
 * Modes:
 *   npx tsx scripts/attach-market-format.mts verify
 *       — print approved-competitor count per target product
 *   npx tsx scripts/attach-market-format.mts search <out.json>
 *       — run each product's Finder queries (monthlySold desc), enrich top ASINs,
 *         dump {asin,title,brand,price,est_monthly_sales,review_count,rating} for review
 *   npx tsx scripts/attach-market-format.mts attach <keeps.json>
 *       — insert hand-picked ASINs; keeps.json shape: { "<external_ref>": ["ASIN", ...] }
 */
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

// load .env.local into process.env (tsx doesn't auto-load it)
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.trim().startsWith("#")) {
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

const { keepaFinder } = await import("@/lib/keepa/product-finder");
const { getKeepaProducts, mapKeepaToCompetitor } = await import("@/lib/keepa/client");

const OWNER = "1f467381-73d9-4df6-886d-0136fde445d4";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Target products + Finder title queries (in order). */
const TARGETS: { ref: string; queries: string[] }[] = [
  {
    ref: "foodservice:boba-straw-11mm-9in-multi-700",
    queries: ["boba straws 700", "jumbo smoothie straws wrapped 500", "wide boba straws wrapped 500"],
  },
  {
    ref: "foodservice:boba-straw-11mm-9-45in-black-400",
    queries: ["boba straws 400 black", "black smoothie straws wrapped", "black boba straws individually wrapped"],
  },
  {
    ref: "foodservice:boba-straw-11mm-9-45in-multi-300",
    queries: ["boba straws 300 wrapped", "multicolor smoothie straws 300", "wide boba straws wrapped 300"],
  },
  {
    ref: "foodservice:can-liner-33gal-twist-250",
    queries: ["33 gallon trash bags ties", "30-33 gallon can liners twist tie", "33 gallon trash bags with ties"],
  },
  {
    ref: "foodservice:can-liner-55-60gal-twist-150",
    queries: ["55 gallon trash bags with ties", "55-60 gallon can liners heavy duty", "60 gallon trash bags with ties"],
  },
  {
    ref: "foodservice:can-liner-55gal-contractor-flat-40",
    queries: ["55 gallon contractor trash bags", "55 gallon 2 mil contractor bags", "contractor bags 55 gallon heavy duty"],
  },
];

const MAX_PER_QUERY = 8; // top-N ASINs kept from each Finder query
const MAX_CANDIDATES = 14; // union cap per product before enrichment

async function loadTargets() {
  const refs = TARGETS.map((t) => t.ref);
  const { data, error } = await sb
    .from("products")
    .select("id, external_ref, name")
    .eq("line", "foodservice")
    .in("external_ref", refs);
  if (error) throw error;
  return TARGETS.map((t) => {
    const p = data!.find((x) => x.external_ref === t.ref);
    return { ...t, product: p ?? null };
  });
}

async function approvedCount(productId: string): Promise<number> {
  const { count, error } = await sb
    .from("competitors")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId)
    .eq("status", "approved");
  if (error) throw error;
  return count ?? 0;
}

async function verify() {
  for (const t of await loadTargets()) {
    if (!t.product) { console.log(`MISSING  ${t.ref} — no product row`); continue; }
    const n = await approvedCount(t.product.id);
    const { data: comps } = await sb
      .from("competitors")
      .select("asin, title")
      .eq("product_id", t.product.id)
      .eq("status", "approved");
    console.log(`\n${String(n).padStart(2)} approved  ${t.ref}  (${t.product.name})`);
    for (const c of comps ?? []) console.log(`     • ${(c as any).asin}  ${(c as any).title}`);
  }
}

async function search(outPath: string) {
  const sort = [["monthlySold", "desc"]] as [string, "asc" | "desc"][];
  const out: Record<string, { product_id: string; name: string; candidates: any[] }> = {};
  const seenQueries = new Map<string, string[]>(); // query → asins (dedupe across shared queries)

  for (const t of await loadTargets()) {
    if (!t.product) { console.log(`✗ ${t.ref} — no product row, skipping`); continue; }

    const union: string[] = [];
    for (const q of t.queries) {
      if (union.length >= MAX_CANDIDATES) break;
      let asins = seenQueries.get(q);
      if (!asins) {
        try {
          asins = (await keepaFinder({ title: q, sort })).slice(0, MAX_PER_QUERY);
        } catch (e: any) {
          console.log(`  ! finder "${q}" errored: ${e?.message ?? e}`);
          asins = [];
        }
        seenQueries.set(q, asins);
        await sleep(2000); // gentle on the 20-tokens/min plan
      }
      console.log(`  finder "${q}" → ${asins.length} asins`);
      for (const a of asins) if (!union.includes(a)) union.push(a);
    }
    const candidates = union.slice(0, MAX_CANDIDATES);
    if (!candidates.length) { console.log(`✗ ${t.ref} — 0 candidates from all queries`); out[t.ref] = { product_id: t.product.id, name: t.product.name, candidates: [] }; continue; }

    const { products: kp, tokensLeft } = await getKeepaProducts(candidates);
    const rows = kp.map((p) => {
      const c = mapKeepaToCompetitor(p);
      return {
        asin: c.asin, title: c.title, brand: c.brand, price: c.price,
        est_monthly_sales: c.est_monthly_sales, review_count: c.review_count, rating: c.rating,
      };
    });
    out[t.ref] = { product_id: t.product.id, name: t.product.name, candidates: rows };
    console.log(`✓ ${t.ref} — ${rows.length} candidates enriched (tokensLeft ${tokensLeft})`);
    await sleep(3000);
  }
  await writeFile(outPath, JSON.stringify(out, null, 2));
  console.log(`\nwrote candidates → ${outPath}`);
}

async function attach(keepsPath: string) {
  const keeps = JSON.parse(readFileSync(keepsPath, "utf8")) as Record<string, string[]>;
  const targets = await loadTargets();
  const allAsins = Array.from(new Set(Object.values(keeps).flat()));
  if (!allAsins.length) { console.log("nothing to attach"); return; }

  const byAsin = new Map<string, ReturnType<typeof mapKeepaToCompetitor>>();
  for (let i = 0; i < allAsins.length; i += 100) {
    const { products } = await getKeepaProducts(allAsins.slice(i, i + 100));
    for (const p of products) byAsin.set(p.asin, mapKeepaToCompetitor(p));
  }

  for (const [ref, asins] of Object.entries(keeps)) {
    const t = targets.find((x) => x.ref === ref);
    if (!t?.product) { console.log(`✗ ${ref} — not a known target product, skipping`); continue; }
    const { data: existing, error: exErr } = await sb
      .from("competitors").select("asin").eq("product_id", t.product.id);
    if (exErr) throw exErr;
    const have = new Set((existing ?? []).map((e: any) => e.asin));

    const rows: any[] = [];
    for (const asin of asins) {
      if (have.has(asin)) { console.log(`  • ${ref} — ${asin} already attached, skipping`); continue; }
      const cand = byAsin.get(asin);
      if (!cand) { console.log(`  ! ${ref} — ${asin} not returned by Keepa, skipping`); continue; }
      rows.push({
        product_id: t.product.id,
        status: "approved",
        ...cand,
        match_confidence: 0.9,
        match_reason: "market-format research",
        created_by: OWNER,
        enriched_at: new Date().toISOString(),
      });
    }
    if (!rows.length) { console.log(`✗ ${ref} — nothing new to insert`); continue; }
    const { error: insErr } = await sb.from("competitors").insert(rows);
    if (insErr) { console.log(`! ${ref} — insert err: ${insErr.message}`); continue; }
    console.log(`✓ ${ref} — attached ${rows.length}: ${rows.map((r) => r.asin).join(", ")}`);
  }
}

const [mode, arg] = process.argv.slice(2);
if (mode === "verify") await verify();
else if (mode === "search" && arg) await search(arg);
else if (mode === "attach" && arg) await attach(arg);
else {
  console.log("usage: npx tsx scripts/attach-market-format.mts verify | search <out.json> | attach <keeps.json>");
  process.exit(1);
}
process.exit(0);
