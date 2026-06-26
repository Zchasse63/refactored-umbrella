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
  { header: "Target Sell (ref)", key: "targetSell", width: 16, money: true },
  { header: "Voltage", key: "voltage", width: 18 },
  { header: "Image", key: "imageCol", width: 16 },
] as const;
