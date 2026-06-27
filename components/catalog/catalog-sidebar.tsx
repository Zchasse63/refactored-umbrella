"use client";

import { cn, money } from "@/lib/utils";
import {
  type CatalogFilters,
  categoryFacets,
  lineFacets,
  tierFacets,
  isFiltered,
  type PhotoFilter,
  type VoltageFilter,
  type QuoteFilter,
} from "@/lib/data/catalog-filter";
import type { ProductView } from "@/lib/data/view";
import type { Line, Tier } from "@/lib/types";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-border py-3 first:pt-0">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

function Radio({ active, label, count, onClick }: { active: boolean; label: string; count?: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn("flex w-full items-center justify-between rounded px-1.5 py-1 text-left text-[12px] transition", active ? "bg-target-muted font-medium text-target-muted-foreground" : "hover:bg-muted text-muted-foreground")}
    >
      <span className="capitalize">{label}</span>
      {count != null && <span className="numeric text-[11px] opacity-70">{count}</span>}
    </button>
  );
}

function Check({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[12px] hover:bg-muted">
      <span className={cn("grid size-3.5 shrink-0 place-items-center rounded border", active ? "border-target bg-target text-background" : "border-border-strong")}>
        {active && <span className="text-[9px] leading-none text-background">✓</span>}
      </span>
      <span className="flex-1 capitalize text-foreground/90">{label}</span>
      <span className="numeric text-[11px] text-muted-foreground">{count}</span>
    </button>
  );
}

export function CatalogSidebar({
  views,
  filters: f,
  onChange,
}: {
  views: ProductView[];
  filters: CatalogFilters;
  onChange: (next: CatalogFilters) => void;
}) {
  const set = (patch: Partial<CatalogFilters>) => onChange({ ...f, ...patch });
  const inLine = f.line === "all" ? views : views.filter((v) => v.product.line === f.line);
  const lines = lineFacets(views);
  const cats = categoryFacets(inLine);
  const tiers = tierFacets(inLine);

  const toggleArr = <T extends string>(arr: T[], val: T): T[] => (arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);

  return (
    <div className="text-[13px]">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[13px] font-semibold">Filters</span>
        {isFiltered(f) && (
          <button onClick={() => onChange({ q: f.q, line: "all", categories: [], tiers: [], photo: "all", voltage: "all", quote: "all", priceMin: null, priceMax: null })} className="text-[11px] text-target hover:underline">
            Clear all
          </button>
        )}
      </div>

      <Section title="Line">
        <Radio active={f.line === "all"} label="All" count={views.length} onClick={() => set({ line: "all", categories: [] })} />
        {lines.map((l) => (
          <Radio key={l.value} active={f.line === l.value} label={l.label} count={l.count} onClick={() => set({ line: l.value as Line, categories: [] })} />
        ))}
      </Section>

      {cats.length > 1 && (
        <Section title="Category">
          <div className="max-h-56 space-y-0.5 overflow-y-auto pr-1">
            {cats.map((c) => (
              <Check key={c.value} active={f.categories.includes(c.value)} label={c.label} count={c.count} onClick={() => set({ categories: toggleArr(f.categories, c.value) })} />
            ))}
          </div>
        </Section>
      )}

      {tiers.length > 0 && (
        <Section title="Prospect tier">
          {tiers.map((t) => (
            <Check key={t.value} active={f.tiers.includes(t.value as Tier | "unset")} label={t.label} count={t.count} onClick={() => set({ tiers: toggleArr(f.tiers, t.value as Tier | "unset") })} />
          ))}
        </Section>
      )}

      <Section title="Factory quote">
        {(["all", "quoted", "pass", "fail", "none"] as QuoteFilter[]).map((q) => (
          <Radio key={q} active={f.quote === q} label={q === "all" ? "Any" : q === "none" ? "Not quoted" : q === "pass" ? "PASS" : q === "fail" ? "FAIL" : "Quoted"} onClick={() => set({ quote: q })} />
        ))}
      </Section>

      <Section title="Target sell ($)">
        <div className="flex items-center gap-1.5">
          <input type="number" placeholder="min" aria-label="Minimum target sell price" value={f.priceMin ?? ""} onChange={(e) => set({ priceMin: e.target.value === "" ? null : Number(e.target.value) })}
            className="numeric w-full rounded border border-input bg-card px-1.5 py-1 text-[12px] outline-none focus:ring-2 focus:ring-ring [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
          <span className="text-muted-foreground">–</span>
          <input type="number" placeholder="max" aria-label="Maximum target sell price" value={f.priceMax ?? ""} onChange={(e) => set({ priceMax: e.target.value === "" ? null : Number(e.target.value) })}
            className="numeric w-full rounded border border-input bg-card px-1.5 py-1 text-[12px] outline-none focus:ring-2 focus:ring-ring [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
        </div>
      </Section>

      <Section title="Photo">
        {(["all", "good", "needs"] as PhotoFilter[]).map((p) => (
          <Radio key={p} active={f.photo === p} label={p === "all" ? "Any" : p === "good" ? "Has photo" : "Needs photo"} onClick={() => set({ photo: p })} />
        ))}
      </Section>

      <Section title="Voltage">
        {(["all", "us", "v220"] as VoltageFilter[]).map((vv) => (
          <Radio key={vv} active={f.voltage === vv} label={vv === "all" ? "Any" : vv === "us" ? "US 110–120V" : "220V flagged"} onClick={() => set({ voltage: vv })} />
        ))}
      </Section>
    </div>
  );
}
