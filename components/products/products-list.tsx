"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { cn, money, pct, EMDASH } from "@/lib/utils";
import { DEFAULT_ASSUMPTIONS, LINE_OPEX_APPLIES, compute } from "@/lib/calc/economics";
import { saveSelection, saveQuote } from "@/app/actions";
import type { ProductView } from "@/lib/data/view";
import type { Role } from "@/lib/types";

type Edits = Record<string, { sell: number | null; quoted: number | null }>;

const LINE_SHORT: Record<string, string> = { appliance: "Appl", beauty: "Beauty", foodservice: "Food" };

function CellInput({
  value,
  onChange,
  onCommit,
  disabled,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  onCommit?: () => void;
  disabled?: boolean;
}) {
  return (
    <input
      type="number"
      step="0.01"
      value={value ?? ""}
      placeholder="—"
      disabled={disabled}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      onBlur={onCommit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className="numeric w-20 rounded border border-input bg-card px-1.5 py-0.5 text-right text-[12px] outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
    />
  );
}

export function ProductsList({ views, role }: { views: ProductView[]; role: Role }) {
  const [edits, setEdits] = useState<Edits>(() =>
    Object.fromEntries(views.map((v) => [v.product.external_ref, { sell: v.selection.target_sell_price, quoted: v.quotedLanded }])),
  );
  const [, startTransition] = useTransition();
  const [savingRef, setSavingRef] = useState<string | null>(null);

  const editSell = role === "partner";
  const editQuote = role === "owner";

  const rows = useMemo(
    () =>
      views.map((v) => {
        const e = edits[v.product.external_ref];
        const eco = compute({
          assumptions: DEFAULT_ASSUMPTIONS,
          sellPrice: e.sell,
          quotedLanded: e.quoted,
          actualLanded: v.product.our_cost,
          applyOpex: LINE_OPEX_APPLIES[v.product.line],
        });
        return { v, e, eco };
      }),
    [views, edits],
  );

  const setEdit = (ref: string, patch: Partial<{ sell: number | null; quoted: number | null }>) =>
    setEdits((s) => ({ ...s, [ref]: { ...s[ref], ...patch } }));

  const commitSell = (ref: string, tier: ProductView["selection"]["tier"]) =>
    startTransition(async () => {
      setSavingRef(ref);
      await saveSelection(ref, { tier, target_sell_price: edits[ref].sell });
      setSavingRef(null);
    });
  const commitQuote = (ref: string) =>
    startTransition(async () => {
      setSavingRef(ref);
      await saveQuote(ref, edits[ref].quoted);
      setSavingRef(null);
    });

  const totals = useMemo(() => {
    let pursue = 0, quoted = 0, pass = 0, fail = 0;
    for (const r of rows) {
      if (r.v.selection.tier === "pursue") pursue++;
      if (r.e.quoted != null) quoted++;
      if (r.eco.verdict?.pass) pass++;
      else if (r.eco.verdict && !r.eco.verdict.pass) fail++;
    }
    return { pursue, quoted, pass, fail };
  }, [rows]);

  return (
    <div>
      <p className="mb-2 text-[11px] text-muted-foreground">
        {role === "partner" ? "Edit target sell inline" : "Edit factory quote inline"} — net % and PASS/FAIL recompute live and save on blur.
      </p>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[760px] text-[12px]">
          <thead>
            <tr className="border-b border-border-strong bg-muted/40 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-semibold">Product</th>
              <th className="px-2 py-2 font-semibold">Line</th>
              <th className="px-2 py-2 font-semibold">Tier</th>
              <th className="px-2 py-2 text-right font-semibold">Target sell</th>
              <th className="px-2 py-2 text-right font-semibold">Landed</th>
              <th className="px-2 py-2 text-right font-semibold">Quote</th>
              <th className="px-2 py-2 text-right font-semibold">Net / status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ v, e, eco }, i) => (
              <tr key={v.product.external_ref} className={cn("border-b border-border last:border-0", i % 2 && "bg-muted/20", savingRef === v.product.external_ref && "bg-target-muted/40")}>
                <td className="px-3 py-1.5">
                  <Link href={`/p/${v.slug}`} className="font-sans font-medium hover:text-target">{v.product.name}</Link>
                  <div className="text-[10px] text-muted-foreground">{v.product.subsection ?? v.product.group_name}</div>
                </td>
                <td className="px-2 py-1.5 text-muted-foreground">{LINE_SHORT[v.product.line]}</td>
                <td className="px-2 py-1.5">
                  {v.selection.tier ? (
                    <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold capitalize", v.selection.tier === "pursue" ? "bg-target-muted text-target-muted-foreground" : "border border-border text-muted-foreground")}>{v.selection.tier}</span>
                  ) : <span className="text-muted-foreground/50">—</span>}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <CellInput value={e.sell} disabled={!editSell} onChange={(val) => setEdit(v.product.external_ref, { sell: val })} onCommit={() => commitSell(v.product.external_ref, v.selection.tier)} />
                </td>
                <td className="numeric px-2 py-1.5 text-right text-muted-foreground">{eco.targetLanded == null ? EMDASH : money(eco.targetLanded)}</td>
                <td className="px-2 py-1.5 text-right">
                  <CellInput value={e.quoted} disabled={!editQuote} onChange={(val) => setEdit(v.product.external_ref, { quoted: val })} onCommit={() => commitQuote(v.product.external_ref)} />
                </td>
                <td className="px-2 py-1.5 text-right">
                  {eco.verdict ? (
                    <span className={cn("numeric font-semibold", eco.verdict.pass ? "text-pass" : "text-fail")}>{pct(eco.quotedNetPct)} net · {eco.verdict.pass ? "PASS" : "FAIL"}</span>
                  ) : (
                    <span className="text-muted-foreground/50" title="No factory quote yet">{EMDASH}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-[12px] text-muted-foreground">
        <span className="numeric"><b className="text-foreground">{totals.pursue}</b> Pursue</span>
        <span className="numeric"><b className="text-foreground">{totals.quoted}</b> quoted</span>
        <span className="numeric text-pass"><b>{totals.pass}</b> PASS</span>
        <span className="numeric text-fail"><b>{totals.fail}</b> FAIL</span>
      </div>
    </div>
  );
}
