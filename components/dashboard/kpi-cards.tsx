import { Card } from "@/components/ui/card";
import { cn, money, pct } from "@/lib/utils";
import type { DashboardStats } from "@/lib/data/stats";

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <Card className="p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("numeric mt-1 text-2xl font-semibold tabular-nums", tone)}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </Card>
  );
}

export function KpiCards({ stats: s }: { stats: DashboardStats }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <Kpi label="Products" value={String(s.total)} sub={`${s.withTarget} with a target set`} />
      <Kpi label="Pursue" value={String(s.pursue)} tone="text-target" sub={`${s.maybe} maybe · ${s.pass} pass`} />
      <Kpi label="Quoted" value={String(s.quoted)} tone="text-quoted" sub="factory quotes in" />
      <Kpi
        label="Quote verdicts"
        value={`${s.passCount} / ${s.failCount}`}
        tone={s.failCount > s.passCount ? "text-fail" : "text-pass"}
        sub="PASS / FAIL"
      />
      <Kpi label="Target sell value" value={money(s.totalTargetSell)} sub="sum of set targets" />
      <Kpi label="Avg quoted net" value={s.avgQuotedNetPct == null ? "—" : pct(s.avgQuotedNetPct)} sub="across quoted items" />
      <Kpi label="Photos" value={`${s.photosGood}`} sub={`${s.photosPending} pending`} />
      <Kpi label="Unset tier" value={String(s.unset)} sub="awaiting a prospect call" />
    </div>
  );
}
