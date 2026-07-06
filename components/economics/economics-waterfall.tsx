import { Check, X } from "lucide-react";
import { cn, money, pct, EMDASH } from "@/lib/utils";
import { COST_BUFFER, LABELS, type Economics, type LiveColumn } from "@/lib/calc/economics";

function ColHead({ label, sub, dotClass, live }: { label: string; sub: string; dotClass: string; live: boolean }) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-1 text-[9px] font-semibold uppercase tracking-wide">
        <span className={cn("inline-block size-1.5 rounded-full", dotClass)} aria-hidden />
        {label}
      </div>
      <div className="text-[9px] text-muted-foreground">{sub}</div>
      {live && <div className="mx-auto mt-0.5 h-px w-6 rounded-full bg-foreground/30" aria-hidden />}
    </div>
  );
}

function Cell({
  value,
  pctValue,
  tone,
  live,
  emphasize,
}: {
  value: number | null | undefined;
  pctValue?: number | null;
  tone: "target" | "quoted" | "actual";
  live?: boolean;
  emphasize?: boolean;
}) {
  const toneText = tone === "target" ? "text-target" : tone === "quoted" ? "text-quoted" : "text-actual";
  const toneFill =
    tone === "target" ? "bg-target-muted" : tone === "quoted" ? "bg-quoted-muted" : "bg-actual-muted";
  const empty = value == null;
  return (
    <div
      className={cn(
        "rounded-md py-1 text-center transition",
        emphasize && !empty && toneFill,
        live && !empty && "ring-2 ring-inset ring-foreground/20",
      )}
    >
      <div className={cn("numeric text-[13px]", empty ? "text-muted-foreground" : toneText)}>
        {empty ? EMDASH : money(value)}
      </div>
      {pctValue !== undefined && (
        <div className={cn("numeric text-[9px]", empty ? "text-muted-foreground" : "text-muted-foreground")}>
          {empty ? "" : pct(pctValue)}
        </div>
      )}
    </div>
  );
}

export function VerdictLamp({ eco }: { eco: Economics }) {
  if (!eco.verdict) return null;
  const { pass, headroom, gross, target } = eco.verdict;
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-1.5 rounded-md px-2 py-1 text-center text-[10px] font-semibold",
        pass ? "bg-pass-muted text-pass-muted-foreground animate-lamp-pulse" : "bg-fail-muted text-fail-muted-foreground",
      )}
      role="status"
    >
      {pass ? <Check className="size-3.5" aria-hidden /> : <X className="size-3.5" aria-hidden />}
      <span className="numeric">
        {pass ? "PASS" : "FAIL"} · {headroom >= 0 ? "+" : ""}
        {money(headroom)} headroom · gross {pct(gross)} {pass ? "≥" : "<"} {pct(target)}
      </span>
    </div>
  );
}

/** The shared 3-column landed-cost waterfall. Identical in PDP and on the board. */
export function EconomicsWaterfall({ eco }: { eco: Economics }) {
  const live: LiveColumn = eco.liveColumn;
  return (
    <div className="space-y-2">
      {/* sell + opex */}
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] text-muted-foreground">Target sell price</span>
        <span className="numeric text-base font-semibold">{eco.guarded ? EMDASH : money(eco.sellPrice)}</span>
      </div>
      <div className="flex items-baseline justify-between border-b border-border pb-2">
        <span className="text-[11px] text-muted-foreground">
          − Amazon opex <span className="numeric">({pct(eco.opexPct, 0)})</span>
        </span>
        <span className="numeric text-[12px] text-fail">{eco.opex == null ? EMDASH : `−${money(eco.opex)}`}</span>
      </div>

      {/* 3-column headers */}
      <div className="grid grid-cols-3 gap-1 pt-1">
        <ColHead label="Target" sub="our goal" dotClass="bg-target" live={live === "target"} />
        <ColHead label="Quoted" sub="factory" dotClass="bg-quoted" live={live === "quoted"} />
        <ColHead label="Actual" sub="booked" dotClass="bg-actual" live={live === "actual"} />
      </div>

      <div className="text-[9px] text-muted-foreground">− Landed cost (DDP)</div>
      <div className="grid grid-cols-3 gap-1">
        <Cell value={eco.targetLanded} tone="target" emphasize live={live === "target"} />
        <Cell value={eco.quotedLanded} tone="quoted" emphasize live={live === "quoted"} />
        <Cell value={eco.actualLanded} tone="actual" emphasize live={live === "actual"} />
      </div>

      <div className="text-[9px] text-muted-foreground">= Net / unit</div>
      <div className="grid grid-cols-3 gap-1">
        <Cell value={eco.targetNet} pctValue={eco.targetNetPct} tone="target" live={live === "target"} />
        <Cell value={eco.quotedNet} pctValue={eco.quotedNetPct} tone="quoted" live={live === "quoted"} />
        <Cell value={eco.actualNet} pctValue={eco.actualNetPct} tone="actual" live={live === "actual"} />
      </div>

      <VerdictLamp eco={eco} />

      <p className="text-[9px] leading-snug text-muted-foreground">
        {LABELS.net}. Live margin uses {live} · {LABELS.targetLandedCaption}.
      </p>
      {eco.actualLanded != null && (
        <p className="text-[9px] leading-snug text-muted-foreground">
          Booked cost includes a {pct(COST_BUFFER, 0)} landed buffer (freight/prep/variance).
        </p>
      )}
    </div>
  );
}
