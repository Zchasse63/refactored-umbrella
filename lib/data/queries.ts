import "server-only";
import { cache } from "react";
import { createSupabaseServer } from "@/lib/supabase/server";
import { buildView, emptySelection, type ProductView } from "@/lib/data/view";
import { DEFAULT_ASSUMPTIONS } from "@/lib/calc/economics";
import { cleanSpecs } from "@/lib/data/clean";
import { estimateFbaFee, type FbaEstimate } from "@/lib/calc/fba";
import type { Assumptions, Competitor, Decision, PipelineStatus, Product, Selection } from "@/lib/types";

const num = (v: unknown): number | null => (v == null ? null : Number(v));

// PostgREST silently caps a response at 1,000 rows — any query that can exceed that must page.
const PAGE = 1000;

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
    updated_at: s.updated_at ?? null,
  };
}

export interface CommentView {
  id: string;
  body: string;
  created_at: string;
  author: string;
  role: string | null;
  isMine: boolean;
}

/** Comments thread for a product, newest last, with author display name + role. */
export const getComments = cache(async (ref: string): Promise<CommentView[]> => {
  const sb = await createSupabaseServer();
  const [{ data: { user } }, { data: product }] = await Promise.all([
    sb.auth.getUser(),
    sb.from("products").select("id").eq("external_ref", ref).maybeSingle(),
  ]);
  if (!product) return [];
  const { data: rows } = await sb
    .from("comments")
    .select("id, body, created_at, user_id")
    .eq("product_id", product.id)
    .order("created_at", { ascending: true });
  if (!rows?.length) return [];
  const { data: members } = await sb.from("memberships").select("user_id, display_name, role");
  const byUser = new Map((members ?? []).map((m: any) => [m.user_id, m]));
  return rows.map((c: any) => {
    const m = byUser.get(c.user_id);
    return {
      id: c.id,
      body: c.body,
      created_at: c.created_at,
      author: m?.display_name ?? (m?.role === "owner" ? "Owner" : "Partner"),
      role: m?.role ?? null,
      isMine: user?.id === c.user_id,
    };
  });
});

/** The selected factory quote's non-price detail (MOQ / lead time / supplier) for pre-fill. */
export async function getSelectedQuoteMeta(ref: string): Promise<{ moq: number | null; lead_time_days: number | null; supplier: string | null }> {
  const sb = await createSupabaseServer();
  const { data: product } = await sb.from("products").select("id").eq("external_ref", ref).maybeSingle();
  if (!product) return { moq: null, lead_time_days: null, supplier: null };
  const { data } = await sb
    .from("factory_quotes")
    .select("moq, lead_time_days, supplier")
    .eq("product_id", product.id)
    .eq("is_selected", true)
    .maybeSingle();
  return { moq: data?.moq ?? null, lead_time_days: data?.lead_time_days ?? null, supplier: data?.supplier ?? null };
}

export interface QuoteHistoryItem {
  id: string;
  landed_cost_ddp: number;
  moq: number | null;
  lead_time_days: number | null;
  supplier: string | null;
  quote_date: string | null; // date column — "YYYY-MM-DD"
  is_selected: boolean;
}

/** Every factory-quote revision for a product, newest first (`is_selected` marks the
 *  one the economics run on). Powers the PDP quote-history strip. */
export async function getQuoteHistory(ref: string): Promise<QuoteHistoryItem[]> {
  const sb = await createSupabaseServer();
  const { data: product } = await sb.from("products").select("id").eq("external_ref", ref).maybeSingle();
  if (!product) return [];
  const { data } = await sb
    .from("factory_quotes")
    .select("id, landed_cost_ddp, moq, lead_time_days, supplier, quote_date, is_selected, created_at")
    .eq("product_id", product.id)
    .order("quote_date", { ascending: false })
    .order("created_at", { ascending: false });
  return (data ?? []).map((q: any) => ({
    id: q.id,
    landed_cost_ddp: Number(q.landed_cost_ddp),
    moq: q.moq == null ? null : Number(q.moq),
    lead_time_days: q.lead_time_days == null ? null : Number(q.lead_time_days),
    supplier: q.supplier ?? null,
    quote_date: q.quote_date ?? null,
    is_selected: !!q.is_selected,
  }));
}

export async function getAssumptions(): Promise<Assumptions> {
  const sb = await createSupabaseServer();
  const { data } = await sb.from("assumptions").select("gross_margin, cost_stack").eq("id", 1).single();
  if (!data) return DEFAULT_ASSUMPTIONS;
  return { grossMargin: Number(data.gross_margin), costStack: data.cost_stack };
}

export async function getCatalog(): Promise<ProductView[]> {
  const sb = await createSupabaseServer();
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
  const sb = await createSupabaseServer();
  const refs = ["appliance", "beauty", "foodservice"].map((l) => `${l}:${slug}`);
  const { data: product } = await sb.from("products").select("*").in("external_ref", refs).maybeSingle();
  if (!product) return null;
  const [{ data: sel }, { data: quote }, assumptions, { data: comps }] = await Promise.all([
    sb.from("selections").select("*").eq("product_id", product.id).maybeSingle(),
    sb.from("factory_quotes").select("landed_cost_ddp").eq("product_id", product.id).eq("is_selected", true).maybeSingle(),
    getAssumptions(),
    sb.from("competitors").select("package_length_mm, package_width_mm, package_height_mm, package_weight_g, fba_pick_pack_fee").eq("product_id", product.id).eq("status", "approved"),
  ]);
  const p = rowToProduct(product);
  const selection = sel ? rowToSelection(sel, p.external_ref) : emptySelection(p.external_ref);
  const fba = estimateFbaFee(
    (comps ?? []).map((c: any) => ({ length_mm: c.package_length_mm, width_mm: c.package_width_mm, height_mm: c.package_height_mm, weight_g: c.package_weight_g })),
    (comps ?? []).map((c: any) => num(c.fba_pick_pack_fee)),
  );
  return buildView(p, selection, quote ? Number(quote.landed_cost_ddp) : null, assumptions, fba);
}

export async function getCompetitors(ref: string): Promise<Competitor[]> {
  const sb = await createSupabaseServer();
  const refs = ["appliance", "beauty", "foodservice"].map((l) => `${l}:${ref.split(":")[1]}`);
  const { data: product } = await sb.from("products").select("id").in("external_ref", refs).maybeSingle();
  if (!product) return [];
  const { data } = await sb
    .from("competitors")
    .select("*")
    .eq("product_id", product.id)
    .neq("status", "rejected") // rejected rows are kept only to exclude the ASIN from re-discovery
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
    price_avg90: num(c.price_avg90),
    price_min90: num(c.price_min90),
    price_max90: num(c.price_max90),
    bsr_avg90: c.bsr_avg90 ?? null,
    bsr_best: c.bsr_best ?? null,
    reviews_added_90d: c.reviews_added_90d ?? null,
    variations_count: c.variations_count ?? null,
    buy_box_is_fba: c.buy_box_is_fba ?? null,
    buy_box_price: num(c.buy_box_price),
    offer_count: c.offer_count ?? null,
    listed_since: c.listed_since ?? null,
    fba_pick_pack_fee: num(c.fba_pick_pack_fee),
    referral_pct: num(c.referral_pct),
    enriched_at: c.enriched_at ?? null,
  }));
}

/** Per-product estimated FBA fee from approved competitors' package dims, keyed by external_ref. */
export async function getFbaEstimates(): Promise<Record<string, FbaEstimate>> {
  const sb = await createSupabaseServer();
  // Approved competitors exceed the 1,000-row cap, so page through them all. The stable
  // id order keeps pages from shuffling mid-iteration.
  const rows: any[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await sb
      .from("competitors")
      .select("package_length_mm, package_width_mm, package_height_mm, package_weight_g, fba_pick_pack_fee, product:product_id(external_ref)")
      .eq("status", "approved")
      .order("id")
      .range(offset, offset + PAGE - 1);
    if (error) {
      // All-or-nothing: a missing estimate makes compute() fall back to the flat 15% FBA
      // line (the designed, visibly-labeled absence path). A partial map would mix real
      // fees with silently degraded ones, so on any page error return nothing.
      console.error("getFbaEstimates page:", error.message);
      return {};
    }
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE) break;
  }
  type Dim = { length_mm: number | null; width_mm: number | null; height_mm: number | null; weight_g: number | null };
  const byRef = new Map<string, { dims: Dim[]; fees: (number | null)[] }>();
  for (const r of rows) {
    const ref = r.product?.external_ref;
    if (!ref) continue;
    if (!byRef.has(ref)) byRef.set(ref, { dims: [], fees: [] });
    const g = byRef.get(ref)!;
    g.dims.push({ length_mm: r.package_length_mm, width_mm: r.package_width_mm, height_mm: r.package_height_mm, weight_g: r.package_weight_g });
    g.fees.push(num(r.fba_pick_pack_fee));
  }
  const out: Record<string, FbaEstimate> = {};
  for (const [ref, { dims, fees }] of byRef) {
    const est = estimateFbaFee(dims, fees);
    if (est) out[ref] = est;
  }
  return out;
}

/** Selected factory MOQ per product (seeds the RFQ MOQ-ask), keyed by external_ref. */
export async function getFactoryMoqs(): Promise<Record<string, number | null>> {
  const sb = await createSupabaseServer();
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
  const sb = await createSupabaseServer();
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
  const sb = await createSupabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from("memberships").select("role").eq("user_id", user.id).maybeSingle();
  return (data?.role as "owner" | "partner") ?? null;
});
