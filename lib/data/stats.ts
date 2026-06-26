/** Pure dashboard aggregation over the already-fetched catalog. No I/O → unit-testable. */
import type { ProductView } from "@/lib/data/view";

export interface DashboardStats {
  total: number;
  pursue: number;
  maybe: number;
  pass: number;
  unset: number;
  withTarget: number;
  quoted: number;
  passCount: number;
  failCount: number;
  totalTargetSell: number;
  avgQuotedNetPct: number | null;
  photosGood: number;
  photosPending: number;
}

export function computeDashboardStats(views: ProductView[]): DashboardStats {
  const s: DashboardStats = {
    total: views.length,
    pursue: 0, maybe: 0, pass: 0, unset: 0,
    withTarget: 0, quoted: 0, passCount: 0, failCount: 0,
    totalTargetSell: 0, avgQuotedNetPct: null, photosGood: 0, photosPending: 0,
  };
  let netSum = 0, netN = 0;
  for (const v of views) {
    const tier = v.selection.tier;
    if (tier === "pursue") s.pursue++;
    else if (tier === "maybe") s.maybe++;
    else if (tier === "pass") s.pass++;
    else s.unset++;

    if (v.selection.target_sell_price != null) {
      s.withTarget++;
      s.totalTargetSell += v.selection.target_sell_price;
    }
    if (v.quotedLanded != null) s.quoted++;
    if (v.economics.verdict) v.economics.verdict.pass ? s.passCount++ : s.failCount++;
    if (v.economics.quotedNetPct != null) { netSum += v.economics.quotedNetPct; netN++; }

    if (v.product.photo_state === "good") s.photosGood++;
    else s.photosPending++;
  }
  s.avgQuotedNetPct = netN ? netSum / netN : null;
  return s;
}
