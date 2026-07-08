import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getCatalog, getPipelineStatuses } from "@/lib/data/queries";
import {
  applyFilters,
  sortViews,
  EMPTY_FILTERS,
  type CatalogFilters,
  type CatalogSort,
  type PhotoFilter,
  type VoltageFilter,
  type QuoteFilter,
} from "@/lib/data/catalog-filter";
import { toCsv } from "@/lib/data/csv";
import type { Line, Tier } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GENERAL catalog export (BRIEF §11): any filtered catalog view → CSV. Read-only, so
// BOTH roles may export — unlike the owner-only factory RFQ. Mirrors app/api/rfq/route.ts
// for auth + error handling; reuses the SAME serializable filter model the UI uses.

const LINES = new Set<Line>(["appliance", "beauty", "foodservice"]);
const TIERS = new Set<string>(["pursue", "maybe", "pass", "unset"]);
const PHOTOS = new Set<PhotoFilter>(["all", "good", "needs"]);
const VOLTAGES = new Set<VoltageFilter>(["all", "us", "v220"]);
const QUOTES = new Set<QuoteFilter>(["all", "quoted", "none", "pass", "fail"]);
const SORTS = new Set<CatalogSort>([
  "relevance", "name", "target-desc", "target-asc", "net", "headroom", "needs-photo",
]);

/** Parse a serializable filter payload (query params or JSON body) into a validated
 *  CatalogFilters + sort, never throwing — anything unrecognized falls back to defaults
 *  (i.e. export everything). `get(key)` returns a raw string or null. */
function parseFilters(
  get: (key: string) => string | null,
): { filters: CatalogFilters; sort: CatalogSort } {
  const list = (key: string): string[] => {
    const raw = get(key);
    return raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
  };
  const numOrNull = (key: string): number | null => {
    const raw = get(key);
    if (raw == null || raw.trim() === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };

  const line = get("line");
  const photo = get("photo");
  const voltage = get("voltage");
  const quote = get("quote");
  const sortRaw = get("sort");

  const filters: CatalogFilters = {
    ...EMPTY_FILTERS,
    q: get("q")?.trim() ?? "",
    line: line && LINES.has(line as Line) ? (line as Line) : "all",
    categories: list("categories"),
    tiers: list("tiers").filter((t) => TIERS.has(t)) as (Tier | "unset")[],
    photo: photo && PHOTOS.has(photo as PhotoFilter) ? (photo as PhotoFilter) : "all",
    voltage: voltage && VOLTAGES.has(voltage as VoltageFilter) ? (voltage as VoltageFilter) : "all",
    quote: quote && QUOTES.has(quote as QuoteFilter) ? (quote as QuoteFilter) : "all",
    priceMin: numOrNull("priceMin"),
    priceMax: numOrNull("priceMax"),
  };
  const sort: CatalogSort = sortRaw && SORTS.has(sortRaw as CatalogSort) ? (sortRaw as CatalogSort) : "relevance";
  return { filters, sort };
}

const LINE_LABEL: Record<Line, string> = {
  appliance: "Appliance",
  beauty: "Beauty",
  foodservice: "Foodservice",
};

const HEADERS = [
  "Name",
  "Model",
  "Line",
  "Group",
  "Tier",
  "Target Sell",
  "Target Landed (DDP)",
  "Quoted",
  "Net %",
  "Pipeline status",
  "Voltage flag",
];

async function buildCsvResponse(
  get: (key: string) => string | null,
): Promise<Response> {
  const { filters, sort } = parseFilters(get);
  const [views, pipeline] = await Promise.all([getCatalog(), getPipelineStatuses()]);
  const selected = sortViews(applyFilters(views, filters), sort);

  const rows = selected.map((v) => {
    const p = v.product;
    const eco = v.economics;
    // liveNetPct is a fraction (0.16 → 16%). Emit as a percent number, 1 decimal.
    const netPct = eco.liveNetPct == null ? null : Math.round(eco.liveNetPct * 1000) / 10;
    const status = pipeline[p.external_ref]?.status ?? "new";
    return [
      p.name,
      p.model ?? "",
      LINE_LABEL[p.line] ?? p.line,
      p.group_name ?? "",
      v.selection.tier ?? "",
      v.selection.target_sell_price, // plain number (or null → blank)
      eco.targetLanded, // DDP negotiation number
      v.quotedLanded, // factory quote if any
      netPct,
      status,
      p.voltage_flag ? "220V" : "",
    ];
  });

  const csv = toCsv(HEADERS, rows);
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="portal-export-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

/** Auth mirrors the RFQ route, but export is read-only so EITHER role may run it. */
async function requireMember(): Promise<Response | null> {
  const sb = await createSupabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: membership } = await sb.from("memberships").select("role").eq("user_id", user.id).maybeSingle();
  if (!membership) return NextResponse.json({ error: "Not a member of this workspace" }, { status: 403 });
  return null;
}

export async function GET(req: NextRequest) {
  const denied = await requireMember();
  if (denied) return denied;
  try {
    const params = req.nextUrl.searchParams;
    // The catalog UI serializes the whole CatalogFilters object as one `f` JSON blob
    // (+ a `sort` param). Read it so "export this view" matches exactly what the user
    // filtered; individual flat params still work as a fallback.
    let blob: Record<string, unknown> = {};
    const f = params.get("f");
    if (f) { try { blob = JSON.parse(f) as Record<string, unknown>; } catch { /* malformed → export everything */ } }
    const get = (k: string): string | null => {
      if (k in blob && blob[k] != null) { const v = blob[k]; return Array.isArray(v) ? v.join(",") : String(v); }
      return params.get(k);
    };
    return await buildCsvResponse(get);
  } catch (e) {
    console.error("export build:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Couldn't build the export. Please try again." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireMember();
  if (denied) return denied;
  try {
    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      body = {}; // empty/invalid body → export everything, never a 400
    }
    const get = (key: string): string | null => {
      const val = body[key];
      if (val == null) return null;
      return Array.isArray(val) ? val.join(",") : String(val);
    };
    return await buildCsvResponse(get);
  } catch (e) {
    console.error("export build:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Couldn't build the export. Please try again." }, { status: 500 });
  }
}
