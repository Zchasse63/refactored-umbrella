/**
 * Pure RFQ row builder. The headline deliverable: turn a selection into the line the
 * factory negotiates against. RFQ SAFETY (BUILD_PLAN §12): the only price printed is the
 * TARGET LANDED COST (DDP) — never the gross margin or net%. Kept pure for unit tests.
 */
import type { ProductView } from "@/lib/data/view";

export interface RfqRow {
  index: number;
  name: string;
  model: string | null;
  line: string;
  category: string | null;
  keySpecs: string;
  targetLanded: number | null; // DDP — the negotiation number
  moqAsk: number | null;
  targetSell: number | null; // reference only
  voltage: string;
  imagePath: string | null; // only when export_ok (clean, US-safe image)
}

export function buildRfqRow(v: ProductView, index: number, moqAsk: number | null): RfqRow {
  const p = v.product;
  const keySpecs = p.specs.slice(0, 4).map((s) => `${s.label}: ${s.value}`).join("; ");
  return {
    index,
    name: p.name,
    model: p.model ?? null,
    line: p.line,
    category: p.group_name ?? null,
    keySpecs,
    // RFQ SAFETY: targetLanded only. Never economics.grossMarginTarget / quotedNetPct.
    targetLanded: v.economics.targetLanded,
    moqAsk,
    targetSell: v.selection.target_sell_price,
    voltage: p.voltage_flag ? "220V — verify for US" : "",
    imagePath: p.export_ok ? p.primary_image_path : null,
  };
}

export const RFQ_COLUMNS = [
  { header: "#", key: "index", width: 5 },
  { header: "Product", key: "name", width: 40 },
  { header: "Model / SKU", key: "model", width: 18 },
  { header: "Category", key: "category", width: 22 },
  { header: "Key Specs", key: "keySpecs", width: 50 },
  { header: "Target Landed Cost (DDP)", key: "targetLanded", width: 22, money: true },
  { header: "MOQ Ask", key: "moqAsk", width: 12 },
  // ↓ the factory fills these two in and sends the file back (quote-import round-trip)
  { header: "Factory Quote (DDP)", key: "factoryQuote", width: 20, money: true, factoryFill: true },
  { header: "Factory MOQ", key: "factoryMoq", width: 14, factoryFill: true },
  { header: "Target Sell (ref)", key: "targetSell", width: 16, money: true },
  { header: "Voltage", key: "voltage", width: 18 },
  { header: "Image", key: "imageCol", width: 16 },
] as const;

/** Header text → import field, for parsing a returned RFQ regardless of column order. */
export const RFQ_IMPORT_HEADERS = {
  model: ["Model / SKU", "Model/SKU", "Model", "SKU"],
  quote: ["Factory Quote (DDP)", "Factory Quote", "Quote (DDP)", "Quoted DDP"],
  moq: ["Factory MOQ", "MOQ"],
} as const;

export interface ImportedQuote {
  model: string;
  quote: number | null;
  moq: number | null;
}

export function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Parse a returned RFQ sheet (rows of cells) into the factory's quotes, by header name. */
export function parseReturnedRfq(rows: (string | number | null)[][]): ImportedQuote[] {
  const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
  // Exact alias match first (precise); then startsWith on ONLY the distinctive canonical
  // header (names[0]) to tolerate appended units/notes like "Factory Quote (DDP) USD".
  // Canonical-only avoids the "MOQ Ask" column wrongly matching the bare "MOQ" alias.
  const findCol = (cells: string[], names: readonly string[]) => {
    const aliases = names.map((n) => n.toLowerCase());
    const exact = cells.findIndex((c) => aliases.includes(c));
    if (exact >= 0) return exact;
    const canonical = aliases[0];
    return cells.findIndex((c) => c.startsWith(canonical));
  };

  let header = -1;
  let col = { model: -1, quote: -1, moq: -1 };
  for (let i = 0; i < rows.length; i++) {
    const cells = (rows[i] ?? []).map(norm);
    const m = findCol(cells, RFQ_IMPORT_HEADERS.model);
    if (m >= 0) {
      header = i;
      col = { model: m, quote: findCol(cells, RFQ_IMPORT_HEADERS.quote), moq: findCol(cells, RFQ_IMPORT_HEADERS.moq) };
      break;
    }
  }
  if (header < 0) return [];

  const out: ImportedQuote[] = [];
  for (let i = header + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const model = String(r[col.model] ?? "").trim();
    if (!model) continue;
    const quote = col.quote >= 0 ? toNum(r[col.quote]) : null;
    const moq = col.moq >= 0 ? toNum(r[col.moq]) : null;
    if (quote == null && moq == null) continue; // factory left this row blank
    out.push({ model, quote, moq });
  }
  return out;
}
