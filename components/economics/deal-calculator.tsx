"use client";

import { useMemo, useState, useTransition } from "react";
import { User, Factory, SlidersHorizontal, RotateCcw, Lock, Check, Loader2 } from "lucide-react";
import { cn, money, pct, EMDASH } from "@/lib/utils";
import { DEFAULT_ASSUMPTIONS, LABELS, compute, opexPct } from "@/lib/calc/economics";
import type { Assumptions } from "@/lib/types";
import type { FbaEstimate } from "@/lib/calc/fba";
import type { FobEstimate } from "@/lib/calc/fob";
import type { CostLine, Role, Tier } from "@/lib/types";
import { saveSelection, saveQuote } from "@/app/actions";
import { EconomicsWaterfall } from "./economics-waterfall";

function NumberField({
  value,
  onChange,
  prefix,
  suffix,
  className,
  step = "0.01",
  disabled,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  prefix?: string;
  suffix?: string;
  className?: string;
  step?: string;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center rounded-md border border-input bg-card focus-within:ring-2 focus-within:ring-ring",
        disabled && "opacity-60",
        className,
      )}
    >
      {prefix && <span className="pl-2 text-[12px] text-muted-foreground">{prefix}</span>}
      <input
        type="number"
        inputMode="decimal"
        step={step}
        disabled={disabled}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className="numeric w-full bg-transparent px-2 py-1 text-right text-[13px] outline-none disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      {suffix && <span className="pr-2 text-[12px] text-muted-foreground">{suffix}</span>}
    </div>
  );
}

const TIERS: Tier[] = ["pursue", "maybe", "pass"];

export function DealCalculator({
  productRef,
  role,
  initialSell,
  initialTier,
  initialQuoted,
  applyOpex = true,
  actualLanded = null,
  fbaEstimate = null,
  fobEstimate = null,
  assumptions = null,
}: {
  productRef: string;
  role: Role;
  initialSell: number | null;
  initialTier: Tier | null;
  initialQuoted: number | null;
  applyOpex?: boolean;
  actualLanded?: number | null;
  fbaEstimate?: FbaEstimate | null;
  fobEstimate?: FobEstimate | null;
  /** LIVE global assumptions from the DB — the client must never fall back to compiled-in
   *  constants when the server provides these (split-brain guard). */
  assumptions?: Assumptions | null;
}) {
  const base = assumptions ?? DEFAULT_ASSUMPTIONS;
  const [sell, setSell] = useState<number | null>(initialSell);
  const [tier, setTier] = useState<Tier | null>(initialTier);
  const [quoted, setQuoted] = useState<number | null>(initialQuoted);
  const [gm, setGm] = useState(base.grossMargin);
  const [stack, setStack] = useState<CostLine[]>(base.costStack);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState<"targets" | "quote" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const editTargets = role === "partner";
  const editQuote = role === "owner";
  const overridden = gm !== base.grossMargin || stack !== base.costStack;
  const opx = applyOpex ? opexPct(stack) : 0;

  const eco = useMemo(
    () => compute({ assumptions: { grossMargin: gm, costStack: stack }, sellPrice: sell, quotedLanded: quoted, actualLanded, applyOpex, fbaPerUnit: fbaEstimate?.fee ?? null }),
    [gm, stack, sell, quoted, actualLanded, applyOpex, fbaEstimate],
  );

  const setLine = (key: string, pctVal: number) =>
    setStack((s) => s.map((l) => (l.key === key ? { ...l, pct: pctVal / 100 } : l)));

  const persistTargets = () =>
    startTransition(async () => {
      setErr(null);
      const r = await saveSelection(productRef, { tier, target_sell_price: sell });
      if ("error" in r) setErr(r.error);
      else { setSaved("targets"); setTimeout(() => setSaved(null), 2000); }
    });
  const persistQuote = () =>
    startTransition(async () => {
      setErr(null);
      const r = await saveQuote(productRef, quoted);
      if ("error" in r) setErr(r.error);
      else { setSaved("quote"); setTimeout(() => setSaved(null), 2000); }
    });

  return (
    <div className="space-y-3">
      <EconomicsWaterfall eco={eco} />

      {fobEstimate && (
        <div className="rounded-md border border-target/30 bg-target-muted/40 p-2.5 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-foreground">Est. FOB cost</span>
            <span className="numeric font-semibold">{money(fobEstimate.fobPerPack)}/pack</span>
          </div>
          <p className="mt-0.5 leading-snug text-muted-foreground">
            No factory quote yet — <span className="font-medium">extrapolated</span> from the Greenway cost model ({fobEstimate.method}). Used as the landed cost until a real quote lands.
          </p>
        </div>
      )}

      {fbaEstimate && (
        <div className="rounded-md border border-quoted/30 bg-quoted-muted/40 p-2.5 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-foreground">Est. FBA fee</span>
            <span className="numeric font-semibold">{money(fbaEstimate.fee)}/unit</span>
          </div>
          <p className="mt-0.5 leading-snug text-muted-foreground">
            {fbaEstimate.source === "amazon-actual" ? (
              <>Median of {fbaEstimate.n} competitor{fbaEstimate.n === 1 ? "" : "s"}&apos; actual Amazon FBA fee{fbaEstimate.n === 1 ? "" : "s"}</>
            ) : (
              <>{fbaEstimate.tierLabel} · estimated from {fbaEstimate.n} competitor box{fbaEstimate.n === 1 ? "" : "es"} ({fbaEstimate.lengthIn}×{fbaEstimate.widthIn}×{fbaEstimate.heightIn}″, {fbaEstimate.weightLb} lb)</>
            )}{" "}
            — replaces the flat 15% FBA line in the math.
          </p>
        </div>
      )}

      {/* Targets — partner side (violet) */}
      <div className="rounded-md border border-border bg-card p-2.5">
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-partner">
            <User className="size-3" aria-hidden /> Targets
          </span>
          {!editTargets && <Lock className="size-3 text-muted-foreground" aria-label="Partner edits this" />}
        </div>
        <div className="mb-2 flex gap-1">
          {TIERS.map((t) => (
            <button
              key={t}
              type="button"
              disabled={!editTargets}
              onClick={() => setTier(t)}
              className={cn(
                "flex-1 rounded-md py-1 text-[10px] font-semibold capitalize transition disabled:opacity-60",
                tier === t ? "bg-target-muted text-target-muted-foreground" : "border border-border text-muted-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <label className="mb-1.5 flex items-center justify-between gap-2 text-[12px]">
          <span className="text-muted-foreground">Target sell</span>
          <NumberField value={sell} onChange={setSell} prefix="$" className="w-28" disabled={!editTargets} />
        </label>
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-muted-foreground">Target landed ← derived</span>
          <span className="numeric">{eco.targetLanded == null ? EMDASH : money(eco.targetLanded)}</span>
        </div>
        {editTargets && (
          <button type="button" onClick={persistTargets} disabled={pending} className="mt-2 flex w-full items-center justify-center gap-1 rounded-md bg-primary py-1.5 text-[12px] font-medium text-primary-foreground disabled:opacity-60">
            {pending && saved !== "quote" ? <Loader2 className="size-3 animate-spin" /> : saved === "targets" ? <Check className="size-3" /> : null}
            {saved === "targets" ? "Saved" : "Save targets"}
          </button>
        )}
      </div>

      {/* Factory quote — owner side (amber) */}
      <div className="rounded-md border border-border bg-card p-2.5">
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-quoted">
            <Factory className="size-3" aria-hidden /> Factory quote
          </span>
          {!editQuote && <Lock className="size-3 text-muted-foreground" aria-label="Owner edits this" />}
        </div>
        <label className="flex items-center justify-between gap-2 text-[12px]">
          <span className="text-muted-foreground">Quoted DDP</span>
          <NumberField value={quoted} onChange={setQuoted} prefix="$" className="w-28" disabled={!editQuote} />
        </label>
        {editQuote ? (
          <button type="button" onClick={persistQuote} disabled={pending} className="mt-2 flex w-full items-center justify-center gap-1 rounded-md bg-primary py-1.5 text-[12px] font-medium text-primary-foreground disabled:opacity-60">
            {pending && saved !== "targets" ? <Loader2 className="size-3 animate-spin" /> : saved === "quote" ? <Check className="size-3" /> : null}
            {saved === "quote" ? "Saved" : "Save quote"}
          </button>
        ) : (
          quoted == null && <p className="mt-1 text-[10px] text-muted-foreground">Awaiting quote from the owner.</p>
        )}
      </div>

      {err && <p className="rounded-md bg-fail-muted px-2 py-1 text-[11px] text-fail-muted-foreground">{err}</p>}

      {/* Assumptions / CostStackEditor — local what-if preview */}
      <div className="rounded-md border border-border bg-card p-2.5">
        <button type="button" onClick={() => setShowAssumptions((s) => !s)} className="flex w-full items-center justify-between text-[11px] font-medium">
          <span className="flex items-center gap-1.5">
            <SlidersHorizontal className="size-3" aria-hidden /> Assumptions
            {overridden && <span className="rounded-full bg-partner-muted px-1.5 py-0.5 text-[9px] font-semibold text-partner-muted-foreground">Overriding global</span>}
          </span>
          <span className="numeric text-[11px] text-muted-foreground">opex {pct((applyOpex ? eco.opexPct : 0) ?? opx, 0)}</span>
        </button>
        {showAssumptions && (
          <div className="mt-2.5 space-y-2.5">
            <label className="flex items-center justify-between gap-2 text-[12px]">
              <span className="text-muted-foreground">{LABELS.grossMargin}</span>
              <NumberField value={Math.round(gm * 100)} onChange={(v) => setGm((v ?? 0) / 100)} suffix="%" className="w-20" step="1" />
            </label>
            <div className="rounded-md bg-muted/50 px-2 py-1 text-[10px] text-muted-foreground">
              ⇒ landed ≤ {pct(1 - gm, 0)} of price = <span className="numeric">{sell ? money(eco.targetLanded) : EMDASH}</span> target landed (DDP)
            </div>
            <div className="space-y-1.5">
              <div className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{LABELS.opex}</div>
              {stack.map((l) => (
                <label key={l.key} className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="text-muted-foreground">{l.label}</span>
                  {fbaEstimate && l.key === "fba" ? (
                    <span className="numeric text-[11px] text-quoted" title="FBA line replaced by the competitor-derived estimate">
                      est. {money(fbaEstimate.fee)}/u
                    </span>
                  ) : (
                    <NumberField value={Math.round(l.pct * 100)} onChange={(v) => setLine(l.key, v ?? 0)} suffix="%" className="w-20" step="1" />
                  )}
                </label>
              ))}
              <div className="flex items-center justify-between border-t border-border pt-1.5 text-[11px] font-medium">
                <span>= variable opex</span>
                <span className={cn("numeric", (eco.opexPct ?? opx) > 0.6 ? "text-fail" : "text-quoted")}>{pct((applyOpex ? eco.opexPct : 0) ?? opx, 0)}</span>
              </div>
            </div>
            <p className="rounded-md bg-muted/50 px-2 py-1 text-[10px] leading-snug text-muted-foreground">
              {pct(gm, 0)} gross = COGS ÷ price (landed ≤ {pct(1 - gm, 0)}). Opex {pct(opx, 0)} is <span className="font-semibold">separate</span> → net ≈ {pct(eco.liveNetPct ?? 0, 0)}, not {pct(gm, 0)}.
            </p>
            {overridden && (
              <button type="button" onClick={() => { setGm(base.grossMargin); setStack(base.costStack); }} className="flex items-center gap-1 text-[11px] text-partner">
                <RotateCcw className="size-3" aria-hidden /> Reset to global
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
