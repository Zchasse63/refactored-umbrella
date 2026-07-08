"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Search, SearchX } from "lucide-react";
import { cn, money, pct, EMDASH } from "@/lib/utils";
import { Select } from "@/components/ui/select";
import { TierBadge } from "@/components/ui/tier-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { LINE_OPEX_APPLIES, compute } from "@/lib/calc/economics";
import { applyFilters, sortViews, EMPTY_FILTERS, isFiltered, lineFacets, type CatalogFilters, type CatalogSort } from "@/lib/data/catalog-filter";
import { saveSelection, saveQuote } from "@/app/actions";
import type { ProductView } from "@/lib/data/view";
import type { Assumptions, Role } from "@/lib/types";

type Edits = Record<string, { sell: number | null; quoted: number | null }>;

const LINE_SHORT: Record<string, string> = { appliance: "Appl", beauty: "Beauty", foodservice: "Food" };

function CellInput({
  value,
  onChange,
  onCommit,
  disabled,
  ariaLabel,
  error,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  onCommit?: () => void;
  disabled?: boolean;
  ariaLabel?: string;
  error?: boolean;
}) {
  return (
    <input
      type="number"
      step="0.01"
      min="0"
      value={value ?? ""}
      placeholder="—"
      disabled={disabled}
      aria-label={ariaLabel}
      aria-invalid={error || undefined}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      onBlur={onCommit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className={cn(
        "numeric w-20 rounded border bg-card px-1.5 py-0.5 text-right text-[12px] outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none",
        error ? "border-fail ring-1 ring-fail/40" : "border-input",
      )}
    />
  );
}

export function ProductsList({ views, role, assumptions }: { views: ProductView[]; role: Role; assumptions: Assumptions }) {
  const [edits, setEdits] = useState<Edits>({});
  const [saveErrs, setSaveErrs] = useState<Record<string, string | null>>({});
  const [, startTransition] = useTransition();
  const [savingRef, setSavingRef] = useState<string | null>(null);
  const [filters, setFilters] = useState<CatalogFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<CatalogSort>("relevance");

  const editSell = role === "partner";
  const editQuote = role === "owner";

  const filtered = useMemo(() => sortViews(applyFilters(views, filters), sort), [views, filters, sort]);
  const lines = useMemo(() => lineFacets(views), [views]);
  const setF = (patch: Partial<CatalogFilters>) => setFilters((f) => ({ ...f, ...patch }));

  // Edits map holds ONLY rows the user touched; everything else falls back to server
  // values, so a revalidate that adds/changes rows can never strand a stale entry.
  const effEdit = (v: ProductView) =>
    edits[v.product.external_ref] ?? { sell: v.selection.target_sell_price, quoted: v.quotedLanded };

  const rows = useMemo(
    () =>
      filtered.map((v) => {
        const e = effEdit(v);
        const edited = e.sell !== v.selection.target_sell_price || e.quoted !== v.quotedLanded;
        // Unedited rows use the SERVER-computed economics verbatim (single source of truth);
        // edited rows recompute with the exact same inputs the server used.
        const eco = edited
          ? compute({
              assumptions,
              sellPrice: e.sell,
              quotedLanded: e.quoted,
              actualLanded: v.product.our_cost ?? v.fobEstimate?.fobPerPack ?? null,
              applyOpex: LINE_OPEX_APPLIES[v.product.line],
              fbaPerUnit: v.fbaEstimate?.fee ?? null,
            })
          : v.economics;
        return { v, e, eco };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, edits, assumptions],
  );

  const setEdit = (v: ProductView, patch: Partial<{ sell: number | null; quoted: number | null }>) =>
    setEdits((s) => ({ ...s, [v.product.external_ref]: { ...effEdit(v), ...patch } }));

  // Commit ONLY real changes: every save appends a revision (quotes are append-style via
  // set_selected_quote), so tabbing/arrow-keying through an untouched field must be a no-op.
  // Strict !== against the last persisted value keeps an explicit clear (value → null) saving.
  const commitSell = (v: ProductView) => {
    if (effEdit(v).sell === v.selection.target_sell_price) return;
    startTransition(async () => {
      const ref = v.product.external_ref;
      setSavingRef(ref);
      const res = await saveSelection(ref, { tier: v.selection.tier, target_sell_price: effEdit(v).sell });
      setSaveErrs((s) => ({ ...s, [ref]: "error" in res ? res.error : null }));
      setSavingRef(null);
    });
  };
  const commitQuote = (v: ProductView) => {
    if (effEdit(v).quoted === v.quotedLanded) return;
    startTransition(async () => {
      const ref = v.product.external_ref;
      setSavingRef(ref);
      const res = await saveQuote(ref, effEdit(v).quoted);
      setSaveErrs((s) => ({ ...s, [ref]: "error" in res ? res.error : null }));
      setSavingRef(null);
    });
  };

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
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input value={filters.q} onChange={(e) => setF({ q: e.target.value })} placeholder="Search name, model, spec…" className="h-8 w-full rounded-md border border-input bg-card pl-7 pr-2 text-[12px] outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <Select aria-label="Filter by line" value={filters.line} onChange={(e) => setF({ line: e.target.value as CatalogFilters["line"], categories: [] })} className="h-8 text-[12px]">
          <option value="all">All lines</option>
          {lines.map((l) => <option key={l.value} value={l.value}>{l.label} ({l.count})</option>)}
        </Select>
        <Select aria-label="Filter by tier" value={filters.tiers[0] ?? "all"} onChange={(e) => setF({ tiers: e.target.value === "all" ? [] : [e.target.value as any] })} className="h-8 text-[12px]">
          <option value="all">Any tier</option>
          <option value="pursue">Pursue</option>
          <option value="maybe">Maybe</option>
          <option value="pass">Pass</option>
          <option value="unset">No tier</option>
        </Select>
        <Select aria-label="Filter by quote" value={filters.quote} onChange={(e) => setF({ quote: e.target.value as CatalogFilters["quote"] })} className="h-8 text-[12px]">
          <option value="all">Any quote</option>
          <option value="quoted">Quoted</option>
          <option value="pass">PASS</option>
          <option value="fail">FAIL</option>
          <option value="none">Not quoted</option>
        </Select>
        <Select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as CatalogSort)} className="h-8 text-[12px]">
          <option value="relevance">Sort</option>
          <option value="name">Name A–Z</option>
          <option value="target-desc">Target ↓</option>
          <option value="net">Net ↓</option>
          <option value="headroom">Headroom ↓</option>
        </Select>
        <span className="ml-auto text-[11px] text-muted-foreground">{rows.length} of {views.length}</span>
      </div>
      {rows.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No products match"
          hint="No rows match your search and filters. Clear them to see the full list."
          action={
            isFiltered(filters) || sort !== "relevance" ? (
              <button onClick={() => { setFilters(EMPTY_FILTERS); setSort("relevance"); }} className="rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-target hover:bg-muted">
                Clear filters
              </button>
            ) : null
          }
        />
      ) : (
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
                  <div className="flex items-baseline gap-1.5">
                    <Link href={`/p/${v.slug}`} className="font-sans font-medium hover:text-target">{v.product.name}</Link>
                    {v.product.model && <span className="numeric text-[10px] text-muted-foreground">{v.product.model}</span>}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{v.product.subsection ?? v.product.group_name}</div>
                </td>
                <td className="px-2 py-1.5 text-muted-foreground">{LINE_SHORT[v.product.line]}</td>
                <td className="px-2 py-1.5">
                  {v.selection.tier ? (
                    <TierBadge tier={v.selection.tier} className="text-[10px]" />
                  ) : <span className="text-muted-foreground/50">—</span>}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <CellInput ariaLabel={`Target sell for ${v.product.name}`} value={e.sell} disabled={!editSell} error={!!saveErrs[v.product.external_ref]} onChange={(val) => setEdit(v, { sell: val })} onCommit={() => commitSell(v)} />
                </td>
                <td className="numeric px-2 py-1.5 text-right text-muted-foreground">{eco.targetLanded == null ? EMDASH : money(eco.targetLanded)}</td>
                <td className="px-2 py-1.5 text-right">
                  <CellInput ariaLabel={`Factory quote for ${v.product.name}`} value={e.quoted} disabled={!editQuote} error={!!saveErrs[v.product.external_ref]} onChange={(val) => setEdit(v, { quoted: val })} onCommit={() => commitQuote(v)} />
                  {saveErrs[v.product.external_ref] && (
                    <div role="alert" className="mt-0.5 text-right text-[10px] font-medium text-fail">
                      Not saved — {saveErrs[v.product.external_ref]}
                    </div>
                  )}
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
      )}

      <div className="mt-3 flex flex-wrap gap-4 text-[12px] text-muted-foreground">
        <span className="numeric"><b className="text-foreground">{totals.pursue}</b> Pursue</span>
        <span className="numeric"><b className="text-foreground">{totals.quoted}</b> quoted</span>
        <span className="numeric text-pass"><b>{totals.pass}</b> PASS</span>
        <span className="numeric text-fail"><b>{totals.fail}</b> FAIL</span>
      </div>
    </div>
  );
}
