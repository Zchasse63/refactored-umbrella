"use client";

import { useMemo, useState, useTransition } from "react";
import { RotateCcw, Check, Loader2, AlertCircle } from "lucide-react";
import { cn, pct } from "@/lib/utils";
import { DEFAULT_ASSUMPTIONS, opexPct } from "@/lib/calc/economics";
import { saveAssumptions } from "@/app/actions";
import type { Assumptions, CostLine } from "@/lib/types";

/**
 * Global cost-stack + target-margin editor (BRIEF §10). Owner-only. Saving ripples the
 * new target landed cost across every non-overridden product (server action). Read-only
 * mirror for the partner so both see the shared model.
 */
export function AssumptionsEditor({ initial, canEdit }: { initial: Assumptions; canEdit: boolean }) {
  const [gm, setGm] = useState(initial.grossMargin);
  const [stack, setStack] = useState<CostLine[]>(initial.costStack);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const opx = useMemo(() => opexPct(stack), [stack]);
  const dirty = gm !== initial.grossMargin || JSON.stringify(stack) !== JSON.stringify(initial.costStack);
  const landedPct = 1 - gm;
  const netPct = Math.max(0, 1 - landedPct - opx);

  const setLine = (key: string, pctVal: number) =>
    setStack((s) => s.map((l) => (l.key === key ? { ...l, pct: pctVal / 100 } : l)));

  const save = () =>
    start(async () => {
      setErr(null);
      const r = await saveAssumptions({ grossMargin: gm, costStack: stack });
      if ("error" in r) setErr(r.error);
      else { setSaved(true); setTimeout(() => setSaved(false), 2500); }
    });

  return (
    <div className="max-w-xl space-y-4">
      {/* Target gross margin */}
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-baseline justify-between">
          <label htmlFor="gm" className="text-[13px] font-semibold">Target gross margin <span className="font-normal text-muted-foreground">(COGS vs price)</span></label>
          <span className="numeric text-[15px] font-semibold text-target">{pct(gm)}</span>
        </div>
        <input
          id="gm"
          type="range"
          min={30}
          max={85}
          step={1}
          disabled={!canEdit}
          value={Math.round(gm * 100)}
          onChange={(e) => setGm(Number(e.target.value) / 100)}
          className="mt-2 w-full accent-target disabled:opacity-50"
        />
        <p className="mt-1 text-[12px] text-muted-foreground">
          ⇒ landed cost ceiling <span className="numeric font-medium text-foreground">{pct(landedPct)}</span> of price — that is the <span className="font-medium">target landed (DDP)</span> we negotiate to.
        </p>
      </section>

      {/* Amazon opex cost stack */}
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-[13px] font-semibold">Amazon variable opex</span>
          <span className="numeric text-[15px] font-semibold">{pct(opx)}</span>
        </div>
        <div className="space-y-2">
          {stack.map((l) => (
            <div key={l.key} className="flex items-center gap-3">
              <span className="w-28 shrink-0 text-[12px] text-muted-foreground">{l.label}</span>
              <input
                type="range"
                min={0}
                max={40}
                step={1}
                disabled={!canEdit}
                value={Math.round(l.pct * 100)}
                onChange={(e) => setLine(l.key, Number(e.target.value))}
                className="flex-1 accent-quoted disabled:opacity-50"
                aria-label={l.label}
              />
              <span className="numeric w-10 text-right text-[12px] tabular-nums">{pct(l.pct)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Net preview — the terminology guard: gross and net never adjacent, always labeled */}
      <section className="rounded-lg border border-border bg-muted/30 p-4 text-[13px]">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Net margin at the landed ceiling</span>
          <span className="numeric text-[15px] font-semibold text-pass">{pct(netPct)} <span className="text-[11px] font-normal text-muted-foreground">net</span></span>
        </div>
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
          {pct(gm)} <b>gross</b> (landed ≤ {pct(landedPct)}) − {pct(opx)} opex ⇒ ≈{pct(netPct)} <b>net</b> of price. Gross and net are different numbers — don&apos;t conflate them.
        </p>
      </section>

      {canEdit ? (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={!dirty || pending}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : saved ? <Check className="size-3.5" /> : null}
            {saved ? "Saved — all products recomputed" : "Save & recompute all products"}
          </button>
          {dirty && !pending && (
            <button type="button" onClick={() => { setGm(initial.grossMargin); setStack(initial.costStack); setErr(null); }} className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
              <RotateCcw className="size-3" /> Reset
            </button>
          )}
          <button type="button" onClick={() => { setGm(DEFAULT_ASSUMPTIONS.grossMargin); setStack(DEFAULT_ASSUMPTIONS.costStack); }} className="ml-auto text-[11px] text-muted-foreground hover:text-foreground">
            Load defaults (49% opex / 65% gross)
          </button>
        </div>
      ) : (
        <p className="text-[12px] text-muted-foreground">The owner governs the global model — read-only for the partner.</p>
      )}

      {err && (
        <p role="alert" className="flex items-center gap-1.5 text-[12px] font-medium text-fail">
          <AlertCircle className="size-3.5" /> {err}
        </p>
      )}
      <p className="text-[11px] text-muted-foreground">
        Saving updates the shared model and recomputes the target landed cost for every product that isn&apos;t using a per-product override.
      </p>
    </div>
  );
}
