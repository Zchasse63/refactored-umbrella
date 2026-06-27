"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";
import { targetLanded, DEFAULT_GROSS_MARGIN } from "@/lib/calc/economics";
import { buildSearchProfile } from "@/lib/ai/build-profile";
import { verifyCompetitor } from "@/lib/ai/verify-competitor";
import { keepaFinder } from "@/lib/keepa/product-finder";
import { getKeepaProducts, mapKeepaToCompetitor } from "@/lib/keepa/client";
import type { Decision, PipelineStatus, Product, Tier } from "@/lib/types";

type Result = { ok: true } | { error: string };

async function resolveProduct(ref: string) {
  const sb = createSupabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in" };
  const { data: product } = await sb.from("products").select("id").eq("external_ref", ref).maybeSingle();
  if (!product) return { ok: false as const, error: "Product not found" };
  return { ok: true as const, sb, user, productId: product.id };
}

function revalidate(ref: string) {
  revalidatePath("/catalog");
  revalidatePath("/products");
  revalidatePath(`/p/${ref.split(":")[1]}`);
}

/** Partner: save prospect tier + target sell (RLS gates to the partner role). */
export async function saveSelection(
  ref: string,
  patch: { tier?: Tier | null; target_sell_price?: number | null },
): Promise<Result> {
  const r = await resolveProduct(ref);
  if (!r.ok) return { error: r.error };
  const sell = patch.target_sell_price ?? null;
  const target_landed_cost = sell != null ? targetLanded(sell, DEFAULT_GROSS_MARGIN) : null;
  const { error } = await r.sb.from("selections").upsert(
    {
      product_id: r.productId,
      partner_user_id: r.user.id,
      tier: patch.tier ?? null,
      target_sell_price: sell,
      target_landed_cost,
      updated_by: r.user.id,
    },
    { onConflict: "product_id,partner_user_id" },
  );
  if (error) return { error: error.message };
  revalidate(ref);
  return { ok: true };
}

/** Owner: save a factory quote (DDP) as the selected quote (RLS gates to the owner role). */
export async function saveQuote(ref: string, landed: number | null): Promise<Result> {
  const r = await resolveProduct(ref);
  if (!r.ok) return { error: r.error };
  // clear any prior selected quote, then add the new one (one selected per product)
  await r.sb.from("factory_quotes").update({ is_selected: false }).eq("product_id", r.productId).eq("is_selected", true);
  if (landed != null) {
    const { error } = await r.sb.from("factory_quotes").insert({
      product_id: r.productId,
      landed_cost_ddp: landed,
      is_selected: true,
      created_by: r.user.id,
    });
    if (error) return { error: error.message };
  }
  revalidate(ref);
  return { ok: true };
}

/**
 * Move a product across the shared pipeline. The DB trigger pipeline_transition_guard
 * (public.can_transition) is the source of truth for legality; this also pre-checks so
 * the UI can fail fast. RLS gates the write to members; the trigger gates the transition.
 */
export async function movePipeline(
  ref: string,
  newStatus: PipelineStatus,
  decision: Decision | null = null,
): Promise<Result> {
  const r = await resolveProduct(ref);
  if (!r.ok) return { error: r.error };
  const patch: Record<string, unknown> = { status: newStatus, updated_by: r.user.id };
  // carry the decision only while in the decision stage; clear it when leaving
  patch.decision = newStatus === "decision" ? decision : null;
  const { error } = await r.sb.from("pipeline_status").update(patch).eq("product_id", r.productId);
  if (error) {
    if (/illegal pipeline transition/i.test(error.message)) return { error: "Move not allowed for your role" };
    return { error: error.message };
  }
  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
  revalidatePath("/board");
  return { ok: true };
}

/**
 * Owner-triggered competitor discovery (AI_LAYER §2). Bounded + defensive:
 * Claude builds a search profile → Keepa Product Finder returns real top-selling
 * ASINs → Keepa enriches → Claude verifies fit → approved matches are stored.
 * Capped to a few candidates to respect the 20-tokens/min Keepa plan.
 */
export async function discoverCompetitors(
  ref: string,
): Promise<{ ok: true; found: number; kept: number } | { error: string }> {
  const r = await resolveProduct(ref);
  if (!r.ok) return { error: r.error };
  const { data: m } = await r.sb.from("memberships").select("role").eq("user_id", r.user.id).maybeSingle();
  if (m?.role !== "owner") return { error: "Only the owner can run discovery." };

  const { data: prow } = await r.sb.from("products").select("name, line, specs").eq("id", r.productId).single();
  if (!prow) return { error: "Product not found." };
  const product = { name: prow.name, line: prow.line, specs: prow.specs ?? [] } as Product;
  const ourDesc = `${product.name} | ${(product.specs || []).map((s) => `${s.label}: ${s.value}`).join("; ")}`;

  try {
    const profile = await buildSearchProfile(product, []);
    const asins = (
      await keepaFinder({
        title: profile.title,
        current_AMAZON_gte: profile.price_low != null ? Math.round(profile.price_low * 100) : undefined,
        current_AMAZON_lte: profile.price_high != null ? Math.round(profile.price_high * 100) : undefined,
        sort: [["monthlySold", "desc"]],
      })
    ).slice(0, 5);
    if (!asins.length) return { ok: true, found: 0, kept: 0 };

    const { products: kp } = await getKeepaProducts(asins);
    const rows: Record<string, unknown>[] = [];
    for (const p of kp) {
      const cand = mapKeepaToCompetitor(p);
      let verdict;
      try {
        verdict = await verifyCompetitor(ourDesc, `${cand.title} (ASIN ${cand.asin}, $${cand.price ?? "?"})`);
      } catch {
        continue;
      }
      if (verdict.is_match && verdict.confidence >= 0.5) {
        rows.push({
          product_id: r.productId,
          status: "approved",
          title: cand.title ?? cand.asin,
          brand: cand.brand,
          marketplace: "amazon",
          asin: cand.asin,
          retail_url: cand.retail_url,
          price: cand.price,
          currency: "USD",
          rating: cand.rating,
          review_count: cand.review_count,
          bsr: cand.bsr,
          est_monthly_sales: cand.est_monthly_sales,
          monthly_sales_source: cand.monthly_sales_source,
          image_url: cand.image_url,
          match_confidence: verdict.confidence,
          match_reason: verdict.reason,
          source: "keepa",
          package_length_mm: cand.package_length_mm,
          package_width_mm: cand.package_width_mm,
          package_height_mm: cand.package_height_mm,
          package_weight_g: cand.package_weight_g,
          created_by: r.user.id,
          enriched_at: new Date().toISOString(),
        });
      }
    }
    await r.sb.from("competitors").delete().eq("product_id", r.productId);
    if (rows.length) {
      const { error } = await r.sb.from("competitors").insert(rows);
      if (error) return { error: error.message };
    }
    revalidate(ref);
    return { ok: true, found: kp.length, kept: rows.length };
  } catch (e) {
    return { error: (e instanceof Error ? e.message : "Discovery failed").slice(0, 200) };
  }
}
