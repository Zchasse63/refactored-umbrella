import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, FileText, FileDown, Lock, ChevronRight } from "lucide-react";
import { getAssumptions, getProductViewBySlug, getViewerRole, getCompetitors, getComments, getSelectedQuoteMeta } from "@/lib/data/queries";
import { ProductCollab } from "@/components/collab/product-collab";
import { LINE_OPEX_APPLIES } from "@/lib/calc/economics";
import { PhotoFrame } from "@/components/product/product-image";
import { DealCalculator } from "@/components/economics/deal-calculator";
import { QuoteHistory } from "@/components/economics/quote-history";
import { CompetitorSection } from "@/components/competitor/competitor-section";
import { Button } from "@/components/ui/button";
import { TierBadge } from "@/components/ui/tier-badge";
import { VoltageBadge } from "@/components/ui/voltage-badge";
import { cn } from "@/lib/utils";
import type { Spec } from "@/lib/types";

export const dynamic = "force-dynamic";

const LINE_LABEL: Record<string, string> = {
  appliance: "Appliances",
  beauty: "Beauty",
  foodservice: "Foodservice",
};

function atAGlance(specs: Spec[]): Spec[] {
  const kw = /(capacity|power|voltage|material|rated|wattage|volume|size|weight)/i;
  const hits = specs.filter((s) => kw.test(s.label));
  return (hits.length ? hits : specs).slice(0, 4);
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; // async request API since Next 15
  const [view, role, assumptions] = await Promise.all([getProductViewBySlug(slug), getViewerRole(), getAssumptions()]);
  if (!view) notFound();
  const { product: p, selection } = view;
  const [competitors, comments, quoteMeta] = await Promise.all([
    getCompetitors(p.external_ref),
    getComments(p.external_ref),
    getSelectedQuoteMeta(p.external_ref),
  ]);

  return (
    <div data-register="storefront" className="text-[15px]">
      <div className="mx-auto max-w-[1400px] px-4 py-6">
        {/* breadcrumb */}
        <nav className="mb-3 flex items-center gap-1 text-[12px] text-muted-foreground">
          <Link href="/catalog" className="hover:text-foreground">{LINE_LABEL[p.line]}</Link>
          {p.group_name && (<><ChevronRight className="size-3" aria-hidden /><span>{p.group_name}</span></>)}
          {p.subsection && p.subsection !== p.group_name && (<><ChevronRight className="size-3" aria-hidden /><span>{p.subsection}</span></>)}
        </nav>

        {/* header band */}
        <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{p.name}</h1>
          {p.model && <span className="numeric text-[12px] text-muted-foreground">Model {p.model}</span>}
        </div>
        {p.summary && (
          <p className="mb-4 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">{p.summary}</p>
        )}
        {(selection.tier || p.voltage_flag) && (
          <div className="mb-6 flex flex-wrap gap-1.5">
            {selection.tier && <TierBadge tier={selection.tier} />}
            {p.voltage_flag && <VoltageBadge />}
          </div>
        )}

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* LEFT — the product */}
          <div className="space-y-8">
            {/* media + overview, side by side (photo no longer floats in a wide column) */}
            <div className="grid gap-6 sm:grid-cols-[minmax(0,300px)_minmax(0,1fr)] sm:items-start">
              <PhotoFrame product={p} aspect="aspect-square" />
              <div className="space-y-5">
                {/* at-a-glance */}
                {atAGlance(p.specs).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {atAGlance(p.specs).map((s, i) => (
                      <span key={i} className="rounded-md border border-border bg-card px-2.5 py-1 text-[12px]">
                        <span className="text-muted-foreground">{s.label}: </span>
                        <span className="numeric">{s.value}</span>
                      </span>
                    ))}
                  </div>
                )}

                {/* features */}
                {p.features.length > 0 && (
                  <div>
                    <div className="text-section-label mb-2">Overview</div>
                    <ul className="space-y-1.5">
                      {p.features.map((f, i) => (
                        <li key={i} className="flex gap-2 text-[14px] leading-snug">
                          <Check className="mt-0.5 size-4 shrink-0 text-pass" aria-hidden />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {/* specs table */}
            <div>
              <div className="text-section-label mb-2">Specifications</div>
              {p.specs.length === 0 ? (
                <div className="rounded-md border border-dashed border-border-strong p-4 text-[13px] text-muted-foreground">
                  No specs on file for this item — flagged for enrichment.
                </div>
              ) : (
                <div className="overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-[13px]">
                    <tbody>
                      {p.specs.map((s, i) => (
                        <tr key={i} className={cn(i % 2 ? "bg-muted/40" : "bg-card")}>
                          <td className="px-3 py-2 text-muted-foreground">{s.label}</td>
                          <td className="numeric px-3 py-2 text-right">{s.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* competitors */}
            <CompetitorSection
              productRef={p.external_ref}
              role={role!}
              competitors={competitors}
              fbaEstimate={view.fbaEstimate}
              targetSellPrice={selection.target_sell_price}
            />

            {/* collaboration — shared notes + discussion */}
            <div className="mt-6">
              <div className="text-section-label mb-2">Collaboration</div>
              <ProductCollab
                productRef={p.external_ref}
                role={role!}
                initialNotes={selection.notes}
                notesUpdatedAt={selection.updated_at}
                comments={comments}
              />
            </div>
          </div>

          {/* RIGHT — the Deal Panel */}
          <div>
            <div className="sticky top-20 rounded-lg border border-border-strong bg-card p-3 shadow-card">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[12px] font-semibold">Deal economics</span>
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Lock className="size-3" aria-hidden /> live calculator
                </span>
              </div>
              <DealCalculator
                productRef={p.external_ref}
                role={role!}
                initialSell={selection.target_sell_price}
                initialTier={selection.tier}
                initialQuoted={view.quotedLanded}
                applyOpex={LINE_OPEX_APPLIES[p.line]}
                actualLanded={p.our_cost ?? view.fobEstimate?.fobPerPack ?? null}
                fbaEstimate={view.fbaEstimate}
                fobEstimate={view.fobEstimate}
                assumptions={assumptions}
                initialCalcInputs={selection.calc_inputs}
                initialMoq={quoteMeta.moq}
                initialLeadTime={quoteMeta.lead_time_days}
                initialSupplier={quoteMeta.supplier}
              />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button asChild size="sm" variant="outline">
                  <a href={`/api/spec-sheet?slug=${slug}`} target="_blank" rel="noopener noreferrer">
                    <FileDown className="size-3.5" aria-hidden /> Spec sheet
                  </a>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href="/exports">
                    <FileText className="size-3.5" aria-hidden /> Add to RFQ
                  </Link>
                </Button>
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">
                {role === "partner"
                  ? "You set the targets; the owner enters the factory quote."
                  : "You enter the factory quote; the partner sets the targets."}{" "}
                Both partners see every number live.
              </p>
              {/* Every quote revision, newest first — renders nothing until a quote exists. */}
              <QuoteHistory productRef={p.external_ref} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
