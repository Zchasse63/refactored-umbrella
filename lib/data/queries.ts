import "server-only";
import { cache } from "react";
import { createSupabaseServer } from "@/lib/supabase/server";
import { buildView, emptySelection, type ProductView } from "@/lib/data/view";
import { DEFAULT_ASSUMPTIONS } from "@/lib/calc/economics";
import { cleanSpecs } from "@/lib/data/clean";
import { estimateFbaFee, type FbaEstimate } from "@/lib/calc/fba";
import type { Assumptions, Competitor, Decision, PipelineStatus, Product, Selection } from "@/lib/types";

const num = (v: unknown): number | null => (v == null ? null : Number(v));

function rowToProduct(r: any): Product {
  // Prefer AI-cleaned COPY (name/features) where present — factory marketing text is noisy.
  // Model is the exception: the raw sell-sheet model number is authoritative, so it wins and
  // model_clean is only a fallback when the import had no model.
  const cleanFeatures: string[] = Array.isArray(r.features_clean) && r.features_clean.length
    ? r.features_clean
    : (r.features ?? []);
  return {
    external_ref: r.external_ref,
    line: r.line,
    brand: r.brand,
    source: r.source,
    name: r.name_clean || r.name,
    model: r.model || r.model_clean,
    group_name: r.group_name,
    subsection: r.subsection,
    categories: r.categories ?? [],
    specs: cleanSpecs(r.specs),
    features: cleanFeatures,
    summary: r.summary ?? null,
    source_url: r.source_url,
    msrp: num(r.msrp),
    our_cost: num(r.our_cost),
    our_cost_source: r.our_cost_source,
    photo_state: r.photo_state,
    image_has_chinese: !!r.image_has_chinese,
    voltage_flag: !!r.voltage_flag,
    export_ok: !!r.export_ok,
    primary_image_path: r.primary_image_path,
  };
}

function rowToSelection(s: any, ref: string): Selection {
  return {
    product_external_ref: ref,
    tier: s.tier,
    priority: s.priority,
    target_sell_price: num(s.target_sell_price),
    target_landed_cost: num(s.target_landed_cost),
    calc_inputs: s.calc_inputs,
    notes: s.notes,
  };
}

export async function getAssumptions(): Promise<Assumptions> {
  const sb = createSupabaseServer();
  const { data } = await sb.from("assumptions").select("gross_margin, cost_stack").eq("id", 1).single();
  if (!data) return DEFAULT_ASSUMPTIONS;
  return { grossMargin: Number(data.gross_margin), costStack: data.cost_stack };
}

export async function getCatalog(): Promise<ProductView[]> {
  const sb = createSupabaseServer();
  const [{ data: products }, { data: selections }, { data: quotes }, assumptions, fbaEstimates] = await Promise.all([
    sb.from("products").select("*").order("line").order("name"),
    sb.from("selections").select("*"),
    sb.from("factory_quotes").select("product_id, landed_cost_ddp").eq("is_selected", true),
    getAssumptions(),
    getFbaEstimates(),
  ]);
  const selByProduct = new Map((selections ?? []).map((s: any) => [s.product_id, s]));
  const quoteByProduct = new Map((quotes ?? []).map((q: any) => [q.product_id, Number(q.landed_cost_ddp)]));
  return (products ?? []).map((r: any) => {
    const product = rowToProduct(r);
    const s = selByProduct.get(r.id);
    const selection = s ? rowToSelection(s, product.external_ref) : emptySelection(product.external_ref);
    const fba = fbaEstimates[product.external_ref] ?? null;
    return buildView(product, selection, quoteByProduct.get(r.id) ?? null, assumptions, fba);
  });
}

export async function getProductViewBySlug(slug: string): Promise<ProductView | null> {
  const sb = createSupabaseServer();
  const refs = ["appliance", "beauty", "foodservice"].map((l) => `${l}:${slug}`);
  const { data: product } = await sb.from("products").select("*").in("external_ref", refs).maybeSingle();
  if (!product) return null;
  const [{ data: sel }, { data: quote }, assumptions, { data: comps }] = await Promise.all([
    sb.from("selections").select("*").eq("product_id", product.id).maybeSingle(),
    sb.from("factory_quotes").select("landed_cost_ddp").eq("product_id", product.id).eq("is_selected", true).maybeSingle(),
    getAssumptions(),
    sb.from("competitors").select("package_length_mm, package_width_mm, package_height_mm, package_weight_g").eq("product_id", product.id).eq("status", "approved"),
  ]);
  const p = rowToProduct(product);
  const selection = sel ? rowToSelection(sel, p.external_ref) : emptySelection(p.external_ref);
  const fba = estimateFbaFee((comps ?? []).map((c: any) => ({ length_mm: c.package_length_mm, width_mm: c.package_width_mm, height_mm: c.package_height_mm, weight_g: c.package_weight_g })));
  return buildView(p, selection, quote ? Number(quote.landed_cost_ddp) : null, assumptions, fba);
}

export async function getCompetitors(ref: string): Promise<Competitor[]> {
  const sb = createSupabaseServer();
  const refs = ["appliance", "beauty", "foodservice"].map((l) => `${l}:${ref.split(":")[1]}`);
  const { data: product } = await sb.from("products").select("id").in("external_ref", refs).maybeSingle();
  if (!product) return [];
  const { data } = await sb
    .from("competitors")
    .select("*")
    .eq("product_id", product.id)
    .order("est_monthly_sales", { ascending: false, nullsFirst: false });
  return (data ?? []).map((c: any) => ({
    id: c.id,
    product_external_ref: ref,
    status: c.status,
    title: c.title,
    brand: c.brand,
    marketplace: c.marketplace,
    asin: c.asin,
    retail_url: c.retail_url,
    price: num(c.price),
    currency: c.currency,
    rating: num(c.rating),
    review_count: c.review_count,
    bsr: c.bsr,
    est_monthly_sales: c.est_monthly_sales,
    monthly_sales_source: c.monthly_sales_source,
    image_url: c.image_url,
    match_confidence: num(c.match_confidence),
    match_reason: c.match_reason,
    source: c.source,
    package_length_mm: c.package_length_mm ?? null,
    package_width_mm: c.package_width_mm ?? null,
    package_height_mm: c.package_height_mm ?? null,
    package_weight_g: c.package_weight_g ?? null,
  }));
}

/** Per-product estimated FBA fee from approved competitors' package dims, keyed by external_ref. */
export async function getFbaEstimates(): Promise<Record<string, FbaEstimate>> {
  const sb = createSupabaseServer();
  const { data } = await sb
    .from("competitors")
    .select("package_length_mm, package_width_mm, package_height_mm, package_weight_g, product:product_id(external_ref)")
    .eq("status", "approved");
  const byRef = new Map<string, { length_mm: number | null; width_mm: number | null; height_mm: number | null; weight_g: number | null }[]>();
  for (const r of (data ?? []) as any[]) {
    const ref = r.product?.external_ref;
    if (!ref) continue;
    if (!byRef.has(ref)) byRef.set(ref, []);
    byRef.get(ref)!.push({ length_mm: r.package_length_mm, width_mm: r.package_width_mm, height_mm: r.package_height_mm, weight_g: r.package_weight_g });
  }
  const out: Record<string, FbaEstimate> = {};
  for (const [ref, dims] of byRef) {
    const est = estimateFbaFee(dims);
    if (est) out[ref] = est;
  }
  return out;
}

/** Selected factory MOQ per product (seeds the RFQ MOQ-ask), keyed by external_ref. */
export async function getFactoryMoqs(): Promise<Record<string, number | null>> {
  const sb = createSupabaseServer();
  const { data } = await sb
    .from("factory_quotes")
    .select("moq, product:product_id(external_ref)")
    .eq("is_selected", true);
  const out: Record<string, number | null> = {};
  for (const r of (data ?? []) as any[]) {
    const ref = r.product?.external_ref;
    if (ref) out[ref] = r.moq == null ? null : Number(r.moq);
  }
  return out;
}

export interface ProductWithPipeline extends ProductView {
  pipelineStatus: PipelineStatus;
  pipelineDecision: Decision | null;
}

/** Catalog enriched with each product's pipeline stage (for the /pipeline board). */
export async function getCatalogWithPipeline(): Promise<ProductWithPipeline[]> {
  const [views, pipeline] = await Promise.all([getCatalog(), getPipelineStatuses()]);
  return views.map((v) => {
    const p = pipeline[v.product.external_ref];
    return {
      ...v,
      pipelineStatus: (p?.status ?? "new") as PipelineStatus,
      pipelineDecision: (p?.decision ?? null) as Decision | null,
    };
  });
}

/** Pipeline stage per product, keyed by external_ref (serializable Record for client props). */
export async function getPipelineStatuses(): Promise<Record<string, { status: string; decision: string | null }>> {
  const sb = createSupabaseServer();
  const { data } = await sb.from("pipeline_status").select("status, decision, product:product_id(external_ref)");
  const out: Record<string, { status: string; decision: string | null }> = {};
  for (const r of (data ?? []) as any[]) {
    const ref = r.product?.external_ref;
    if (ref) out[ref] = { status: r.status, decision: r.decision };
  }
  return out;
}

/** Current user's role (for UI affordances). cache() dedupes the auth + membership
 *  round-trips when several server components ask for the role within one request. */
export const getViewerRole = cache(async (): Promise<"owner" | "partner" | null> => {
  const sb = createSupabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from("memberships").select("role").eq("user_id", user.id).maybeSingle();
  return (data?.role as "owner" | "partner") ?? null;
});
