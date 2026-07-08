"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";
import { buildSearchProfile } from "@/lib/ai/build-profile";
import { verifyCompetitor } from "@/lib/ai/verify-competitor";
import { keepaFinder, searchCategories } from "@/lib/keepa/product-finder";
import { getKeepaProducts, mapKeepaToCompetitor } from "@/lib/keepa/client";
import type { Assumptions, CalcInputs, Decision, PipelineStatus, Product, Tier } from "@/lib/types";

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

/** Money inputs must be a sane positive dollar amount (or null = cleared). */
function badMoney(v: number | null | undefined): boolean {
  return v != null && (!Number.isFinite(v) || v <= 0 || v > 99999);
}

/** Partner: save prospect tier + target sell + notes + per-product calc override.
 *  RLS gates to the partner role. calc_inputs persists the "what-if" so it stops
 *  evaporating on refresh; the DB trigger (migration 0019) owns target_landed_cost
 *  derivation, using the OVERRIDE margin when set. */
export async function saveSelection(
  ref: string,
  patch: { tier?: Tier | null; target_sell_price?: number | null; notes?: string | null; calc_inputs?: CalcInputs | null },
): Promise<Result> {
  const r = await resolveProduct(ref);
  if (!r.ok) return { error: r.error };
  if ("target_sell_price" in patch && badMoney(patch.target_sell_price ?? null)) return { error: "Target sell must be a positive dollar amount." };
  if (patch.notes != null && patch.notes.length > 4000) return { error: "Note is too long (4000 char max)." };
  // PARTIAL-PATCH semantics (audit v2 critical): the upsert payload carries ONLY the keys
  // present in the patch, so a notes-only save can never wipe tier / target sell / landed
  // target that another surface set. Omitted columns are untouched on conflict-update.
  const row: Record<string, unknown> = {
    product_id: r.productId,
    partner_user_id: r.user.id, // RLS WITH CHECK pins this to auth.uid(); doubles as last-editor attribution
    updated_by: r.user.id,
  };
  if ("tier" in patch) row.tier = patch.tier ?? null;
  if ("notes" in patch) row.notes = patch.notes ?? null;
  if ("calc_inputs" in patch) row.calc_inputs = patch.calc_inputs ?? null;
  if ("target_sell_price" in patch) row.target_sell_price = patch.target_sell_price ?? null;
  // target_landed_cost is NOT set here: the DB trigger selections_derive_landed (migration
  // 0019) derives it whenever target_sell_price or calc_inputs change, with the same
  // override semantics as resolveAssumptions. The trigger sees the POST-merge row, so the
  // derivation is atomic — no read-then-upsert race, no stale-half recompute.
  // ONE shared selection per product (migration 0015): the partner side speaks with one
  // voice — any partner may edit; partner_user_id/updated_by attribute the last editor.
  const { error } = await r.sb.from("selections").upsert(row, { onConflict: "product_id" });
  if (error) {
    console.error("saveSelection:", error.message);
    return { error: "Couldn't save. Please try again." };
  }
  revalidate(ref);
  return { ok: true };
}

/**
 * Owner: save global assumptions (cost stack + gross margin) and RIPPLE the change —
 * recompute target_landed_cost for every persisted selection that isn't per-product
 * overridden. This is the BRIEF's "change once → all products recompute" feature.
 */
export async function saveAssumptions(next: Assumptions): Promise<Result> {
  const sb = createSupabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: "Not signed in" };
  const { data: mem } = await sb.from("memberships").select("role").eq("user_id", user.id).maybeSingle();
  if (mem?.role !== "owner") return { error: "Only the owner can change global assumptions." };

  const gm = Number(next.grossMargin);
  if (!Number.isFinite(gm) || gm <= 0 || gm >= 1) return { error: "Gross margin must be between 0 and 1 (e.g. 0.65)." };
  const stack = (next.costStack ?? []).map((l) => ({ ...l, pct: Number(l.pct) }));
  if (stack.some((l) => !Number.isFinite(l.pct) || l.pct < 0 || l.pct > 1)) return { error: "Each cost-stack line must be a fraction between 0 and 1." };

  const { error: upErr } = await sb.from("assumptions").update({ gross_margin: gm, cost_stack: stack, updated_by: user.id }).eq("id", 1);
  if (upErr) { console.error("saveAssumptions:", upErr.message); return { error: "Couldn't save assumptions." }; }

  // Ripple: recompute persisted target landed for non-overridden selections at the new
  // margin — via the SECURITY DEFINER RPC (migration 0017). The old per-row loop ran as
  // the OWNER against selections whose write policy is partner-only, so it matched zero
  // rows and failed silently (audit v2). The RPC is set-based and owner-gated internally.
  const { error: ripErr } = await sb.rpc("ripple_target_landed", { p_gross_margin: gm });
  if (ripErr) {
    console.error("saveAssumptions ripple:", ripErr.message);
    return { error: "Assumptions saved, but recomputing landed targets failed — reload and retry." };
  }
  for (const p of ["/catalog", "/products", "/board", "/dashboard", "/exports", "/settings/assumptions"]) revalidatePath(p);
  return { ok: true };
}

/**
 * Owner: set (or clear) the selected factory quote (DDP). RLS gates to the owner role.
 * `landed = null` is the explicit "clear quote" action — it deselects with no replacement.
 */
export async function saveQuote(
  ref: string,
  landed: number | null,
  meta?: { moq?: number | null; lead_time_days?: number | null; supplier?: string | null },
): Promise<Result> {
  const r = await resolveProduct(ref);
  if (!r.ok) return { error: r.error };
  if (badMoney(landed)) return { error: "Quote must be a positive dollar amount." };
  const moq = meta?.moq ?? null;
  const lead = meta?.lead_time_days ?? null;
  if (moq != null && (!Number.isFinite(moq) || moq <= 0)) return { error: "MOQ must be a positive whole number." };
  if (lead != null && (!Number.isFinite(lead) || lead < 0)) return { error: "Lead time must be zero or more days." };
  // Atomic deselect+insert in one transaction (set_selected_quote RPC): a re-quote can
  // never strand a product mid-swap. landed=null deselects only (intended clear path).
  const { error } = await r.sb.rpc("set_selected_quote", {
    p_product_id: r.productId,
    p_landed: landed,
    p_moq: moq != null ? Math.round(moq) : null,
    p_lead_time: lead != null ? Math.round(lead) : null,
    p_supplier: meta?.supplier?.trim() || null,
  });
  if (error) {
    console.error("saveQuote:", error.message);
    return { error: "Couldn't save the quote. Please try again." };
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
    console.error("movePipeline:", error.message);
    return { error: "Couldn't move the card. Please try again." };
  }
  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
  revalidatePath("/board");
  return { ok: true };
}

/** Post a comment on a product (either role; RLS pins user_id = auth.uid()). */
export async function saveComment(ref: string, body: string): Promise<Result> {
  const r = await resolveProduct(ref);
  if (!r.ok) return { error: r.error };
  const text = body.trim();
  if (!text) return { error: "Comment is empty." };
  if (text.length > 4000) return { error: "Comment is too long (4000 char max)." };
  const { error } = await r.sb.from("comments").insert({ product_id: r.productId, user_id: r.user.id, body: text });
  if (error) { console.error("saveComment:", error.message); return { error: "Couldn't post the comment." }; }
  revalidate(ref);
  return { ok: true };
}

/** Delete your own comment (RLS own_comment_d gates to the author). */
export async function deleteComment(ref: string, id: string): Promise<Result> {
  const sb = createSupabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: "Not signed in" };
  const { error } = await sb.from("comments").delete().eq("id", id).eq("user_id", user.id);
  if (error) { console.error("deleteComment:", error.message); return { error: "Couldn't delete the comment." }; }
  revalidate(ref);
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
    // ── Learn-loop inputs (AI_LAYER §2): past reject reasons feed the exclude list, and
    //    previously-rejected ASINs are filtered so a bad match can't keep coming back.
    const { data: fb } = await r.sb
      .from("competitor_feedback")
      .select("reason_text")
      .eq("product_id", r.productId)
      .eq("verdict", "not_a_fit") // the CHECK's vocabulary — 'reject' matched nothing (audit v2)
      .not("reason_text", "is", null)
      .limit(30);
    const learnedExcludes = Array.from(new Set((fb ?? []).map((f: any) => f.reason_text).filter(Boolean))).slice(0, 12) as string[];
    const { data: rej } = await r.sb.from("competitors").select("asin").eq("product_id", r.productId).eq("status", "rejected");
    const rejectedAsins = new Set((rej ?? []).map((x: any) => x.asin).filter(Boolean));

    const profile = await buildSearchProfile(product, learnedExcludes);

    // Persist a versioned search profile (owner-writable) so the recipe is inspectable + reusable.
    const { data: prevProf } = await r.sb
      .from("search_profiles")
      .select("version")
      .eq("product_id", r.productId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    // Best-effort category-node resolution (KEEPA §step 0): narrows the search when it works,
    // silently skipped when it doesn't — the title fallback chain below still covers recall.
    let categories_include: number[] | undefined;
    let categoryNode: number | null = null;
    try {
      const catRes = (await searchCategories(profile.category_keyword)) as any;
      const firstId = catRes?.categories && Object.keys(catRes.categories)[0];
      if (firstId && Number.isFinite(Number(firstId))) { categoryNode = Number(firstId); categories_include = [categoryNode]; }
    } catch { /* category lookup is best-effort */ }
    // product_id is UNIQUE (one live profile per product) — a plain insert violated it on
    // every re-discovery and the unchecked await hid that, freezing profiles at v1 (audit v2).
    const { error: profErr } = await r.sb.from("search_profiles").upsert({
      product_id: r.productId,
      query: profile.title,
      include_terms: [profile.title],
      exclude_terms: profile.exclude_terms ?? [],
      category_node: categoryNode,
      version: (prevProf?.version ?? 0) + 1,
      updated_by: r.user.id,
    }, { onConflict: "product_id" });
    if (profErr) console.error("discoverCompetitors search_profiles:", profErr.message); // profile persistence is best-effort

    const gte = Number.isFinite(profile.price_low) ? Math.round((profile.price_low as number) * 100) : undefined;
    const lte = Number.isFinite(profile.price_high) ? Math.round((profile.price_high as number) * 100) : undefined;
    const sort: [string, "asc" | "desc"][] = [["monthlySold", "desc"]];
    // Graceful fallback: category → title+price → title-only → trimmed title. An over-tight
    // AI price band, wrong category node, or over-specific title can each zero out a valid
    // search, so we widen step by step before giving up.
    let asins = categories_include
      ? await keepaFinder({ title: profile.title, categories_include, current_AMAZON_gte: gte, current_AMAZON_lte: lte, sort })
      : [];
    if (!asins.length) asins = await keepaFinder({ title: profile.title, current_AMAZON_gte: gte, current_AMAZON_lte: lte, sort });
    if (!asins.length) asins = await keepaFinder({ title: profile.title, sort });
    if (!asins.length) {
      const short = profile.title.split(/\s+/).slice(0, 3).join(" ");
      if (short && short.toLowerCase() !== profile.title.toLowerCase()) asins = await keepaFinder({ title: short, sort });
    }
    asins = asins.filter((a) => !rejectedAsins.has(a)).slice(0, 6);
    if (!asins.length) return { ok: true, found: 0, kept: 0 };

    const { products: kp } = await getKeepaProducts(asins);
    const rows: Record<string, unknown>[] = [];
    for (const p of kp) {
      const cand = mapKeepaToCompetitor(p);
      if (rejectedAsins.has(cand.asin)) continue;
      let verdict;
      try {
        verdict = await verifyCompetitor(ourDesc, `${cand.title} (ASIN ${cand.asin}, $${cand.price ?? "?"})`);
      } catch {
        continue;
      }
      // REVIEW GATE (AI_LAYER §2): high-confidence auto-approves; borderline lands as a
      // candidate the owner confirms/rejects — no silent auto-approval feeding the margin math.
      if (!verdict.is_match || verdict.confidence < 0.5) continue;
      const status = verdict.confidence >= 0.75 ? "approved" : "candidate";
      {
        rows.push({
          product_id: r.productId,
          status,
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
          price_avg90: cand.price_avg90,
          price_min90: cand.price_min90,
          price_max90: cand.price_max90,
          bsr_avg90: cand.bsr_avg90,
          bsr_best: cand.bsr_best,
          reviews_added_90d: cand.reviews_added_90d,
          variations_count: cand.variations_count,
          buy_box_is_fba: cand.buy_box_is_fba,
          buy_box_price: cand.buy_box_price,
          offer_count: cand.offer_count,
          listed_since: cand.listed_since,
          fba_pick_pack_fee: cand.fba_pick_pack_fee,
          referral_pct: cand.referral_pct,
          created_by: r.user.id,
          enriched_at: new Date().toISOString(),
        });
      }
    }
    // Insert-first replacement: NEVER delete the existing competitor set before the new
    // one is safely persisted. If discovery verified zero candidates, keep what's there
    // (a failed re-run must not wipe a product's competitors and its derived FBA fee).
    if (!rows.length) {
      revalidate(ref);
      return { ok: true, found: kp.length, kept: 0 };
    }
    // Replace only the prior approved/candidate set — PRESERVE rejected rows (they exist
    // solely to keep their ASIN out of future discovery).
    const { data: existing } = await r.sb
      .from("competitors")
      .select("id")
      .eq("product_id", r.productId)
      .in("status", ["approved", "candidate"]);
    const oldIds = (existing ?? []).map((e: { id: string }) => e.id);
    const { error: insErr } = await r.sb.from("competitors").insert(rows);
    if (insErr) {
      console.error("discoverCompetitors insert:", insErr.message); // old set left intact
      return { error: "Discovery couldn't save its results. Your existing competitors are unchanged." };
    }
    if (oldIds.length) await r.sb.from("competitors").delete().in("id", oldIds);
    revalidate(ref);
    const kept = rows.filter((x) => x.status === "approved").length;
    return { ok: true, found: kp.length, kept };
  } catch (e) {
    console.error("discoverCompetitors:", e instanceof Error ? e.message : e);
    return { error: "Discovery failed. Please try again." };
  }
}

/** Owner: confirm a borderline candidate competitor → it joins the approved set + margin math. */
export async function approveCompetitor(ref: string, competitorId: string): Promise<Result> {
  const r = await resolveProduct(ref);
  if (!r.ok) return { error: r.error };
  const { data: m } = await r.sb.from("memberships").select("role").eq("user_id", r.user.id).maybeSingle();
  if (m?.role !== "owner") return { error: "Only the owner can review competitors." };
  const { error } = await r.sb.from("competitors").update({ status: "approved" }).eq("id", competitorId).eq("product_id", r.productId);
  if (error) { console.error("approveCompetitor:", error.message); return { error: "Couldn't approve." }; }
  revalidate(ref);
  return { ok: true };
}

/**
 * Owner: reject a competitor. Writes competitor_feedback (the reject reason becomes a
 * learned exclude next discovery) and marks the row 'rejected' so its ASIN is kept out of
 * future searches instead of silently reappearing. This is what closes the learn-loop.
 */
export async function rejectCompetitor(ref: string, competitorId: string, reason: string): Promise<Result> {
  const r = await resolveProduct(ref);
  if (!r.ok) return { error: r.error };
  const { data: m } = await r.sb.from("memberships").select("role").eq("user_id", r.user.id).maybeSingle();
  if (m?.role !== "owner") return { error: "Only the owner can review competitors." };
  const text = (reason ?? "").trim().slice(0, 200) || "not a like-for-like competitor";
  // 'not_a_fit' is the CHECK constraint's vocabulary — the old 'reject' violated it and the
  // unchecked await swallowed the failure, so NO feedback row was ever written (audit v2).
  const { error: fbErr } = await r.sb.from("competitor_feedback").insert({
    competitor_id: competitorId,
    product_id: r.productId,
    user_id: r.user.id,
    verdict: "not_a_fit",
    reason_code: "not_match",
    reason_text: text,
  });
  if (fbErr) console.error("rejectCompetitor feedback:", fbErr.message); // learn-loop is best-effort; the reject itself still proceeds
  const { error } = await r.sb.from("competitors").update({ status: "rejected" }).eq("id", competitorId).eq("product_id", r.productId);
  if (error) { console.error("rejectCompetitor:", error.message); return { error: "Couldn't reject." }; }
  revalidate(ref);
  return { ok: true };
}
