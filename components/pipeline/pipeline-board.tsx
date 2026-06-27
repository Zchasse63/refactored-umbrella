"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { canTransition } from "@/lib/auth/capabilities";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { movePipeline } from "@/app/actions";
import type { ProductWithPipeline } from "@/lib/data/queries";
import type { Decision, PipelineStatus, Role, Tier } from "@/lib/types";

const STAGES: { id: PipelineStatus; label: string; hint: string }[] = [
  { id: "new", label: "New", hint: "Unscreened" },
  { id: "shortlisted", label: "Shortlisted", hint: "Partner picks" },
  { id: "costing", label: "Costing", hint: "Owner sourcing" },
  { id: "quoted", label: "Quoted", hint: "Factory quote in" },
  { id: "decision", label: "Decision", hint: "Go / Hold / Pass" },
];
const TIER_VARIANT: Record<Tier, "pass" | "warn" | "neutral"> = { pursue: "pass", maybe: "warn", pass: "neutral" };
const DECISION_VARIANT: Record<Decision, "pass" | "warn" | "fail"> = { go: "pass", hold: "warn", pass: "fail" };

export function PipelineBoard({ views, role }: { views: ProductWithPipeline[]; role: Role }) {
  const router = useRouter();
  const [optimistic, setOptimistic] = useState<Record<string, PipelineStatus>>({});
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dragRef, setDragRef] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<PipelineStatus | null>(null);

  // Live sync: when either partner moves a card, re-fetch server data so the other
  // board updates without a refresh. RLS gates the stream to members; the reconcile
  // effect below evicts our optimistic entry once the fresh `views` reflect it.
  useEffect(() => {
    const sb = createSupabaseBrowser();
    const channel = sb
      .channel("pipeline-board")
      .on("postgres_changes", { event: "*", schema: "public", table: "pipeline_status" }, () => router.refresh());
    // Realtime evaluates the table's RLS against the subscriber's JWT — hand it the
    // session token, else is_member() fails and postgres_changes events are dropped.
    sb.auth.getSession().then(({ data }) => {
      if (data.session) sb.realtime.setAuth(data.session.access_token);
      channel.subscribe();
    });
    return () => { void sb.removeChannel(channel); };
  }, [router]);

  const stageOf = (v: ProductWithPipeline) => optimistic[v.product.external_ref] ?? v.pipelineStatus;

  const columns = useMemo(() => {
    const m: Record<PipelineStatus, ProductWithPipeline[]> = { new: [], shortlisted: [], costing: [], quoted: [], decision: [] };
    for (const v of views) m[stageOf(v)]?.push(v);
    return m;
  }, [views, optimistic]);

  // Evict each optimistic entry once the revalidated server props catch up to it — no
  // flicker on success, and no stranded cards if a concurrent user moves one further.
  useEffect(() => {
    setOptimistic((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const v of views) {
        const ref = v.product.external_ref;
        if (ref in next && next[ref] === v.pipelineStatus) { delete next[ref]; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [views]);

  function commit(ref: string, to: PipelineStatus, decision: Decision | null = null) {
    startTransition(async () => {
      const res = await movePipeline(ref, to, decision);
      if ("error" in res) {
        setOptimistic((s) => { const n = { ...s }; delete n[ref]; return n; }); // revert
        setError(res.error);
      }
      // on success: keep the optimistic entry until the effect above evicts it (no flicker)
    });
  }

  function onDrop(to: PipelineStatus) {
    const ref = dragRef;
    setDragRef(null);
    setOverStage(null);
    if (!ref) return;
    const v = views.find((x) => x.product.external_ref === ref);
    if (!v) return;
    const from = stageOf(v);
    if (from === to) return;
    if (!canTransition(from, to, role)) {
      setError(`Can’t move ${from} → ${to} as ${role}. ${role === "partner" ? "Owner handles costing/quoting." : "Partner handles shortlisting."}`);
      return;
    }
    setError(null);
    setOptimistic((s) => ({ ...s, [ref]: to }));
    commit(ref, to);
  }

  return (
    <div>
      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-fail/30 bg-fail-muted px-3 py-2 text-[12px] text-fail-muted-foreground">
          {error}
          <button onClick={() => setError(null)} className="ml-auto opacity-70 hover:opacity-100" aria-label="Dismiss"><X className="size-3.5" /></button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {STAGES.map((stage) => {
          const items = columns[stage.id];
          // guard: views can refresh (force-dynamic + revalidate) while a drag is in flight
          const draggedView = dragRef ? views.find((x) => x.product.external_ref === dragRef) : undefined;
          const locked = draggedView ? !canTransition(stageOf(draggedView), stage.id, role) : false;
          return (
            <div
              key={stage.id}
              onDragOver={(e) => { e.preventDefault(); setOverStage(stage.id); }}
              onDragLeave={() => setOverStage((s) => (s === stage.id ? null : s))}
              onDrop={() => onDrop(stage.id)}
              className={cn(
                "flex min-h-[120px] flex-col rounded-lg border bg-muted/20 transition",
                overStage === stage.id && !locked && "border-target ring-1 ring-target",
                overStage === stage.id && locked && "border-fail/50",
                overStage !== stage.id && "border-border",
              )}
            >
              <div className="flex items-center justify-between border-b border-border px-2.5 py-2">
                <div>
                  <div className="flex items-center gap-1 text-[12px] font-semibold">
                    {stage.label}
                    {locked && <Lock className="size-3 text-muted-foreground" aria-label="Not allowed for your role" />}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{stage.hint}</div>
                </div>
                <span className="numeric rounded-full bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground">{items.length}</span>
              </div>
              <div className="flex max-h-[calc(100vh-220px)] flex-col gap-1.5 overflow-y-auto p-1.5">
                {items.map((v) => (
                  <PipelineCard
                    key={v.product.external_ref}
                    view={v}
                    inDecision={stage.id === "decision"}
                    onDragStart={() => setDragRef(v.product.external_ref)}
                    onDragEnd={() => { setDragRef(null); setOverStage(null); }}
                    onDecide={(d) => commit(v.product.external_ref, "decision", d)}
                  />
                ))}
                {items.length === 0 && <div className="px-1.5 py-3 text-center text-[11px] text-muted-foreground/60">—</div>}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Drag a card to move it. Partner moves New ↔ Shortlisted; owner moves Shortlisted → Costing → Quoted; either may send to Decision. Saved to Supabase, gated by role.
      </p>
    </div>
  );
}

function PipelineCard({
  view: v,
  inDecision,
  onDragStart,
  onDragEnd,
  onDecide,
}: {
  view: ProductWithPipeline;
  inDecision: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDecide: (d: Decision) => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="cursor-grab rounded-md border border-border bg-card p-2 shadow-card active:cursor-grabbing"
    >
      <div className="flex items-start gap-1.5">
        <Link href={`/p/${v.slug}`} className="line-clamp-2 text-[12px] font-medium leading-snug hover:text-target" draggable={false}>
          {v.product.name}
        </Link>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {v.selection.tier && <Badge variant={TIER_VARIANT[v.selection.tier]} className="capitalize">{v.selection.tier}</Badge>}
        {v.economics.verdict && <Badge variant={v.economics.verdict.pass ? "pass" : "fail"}>{v.economics.verdict.pass ? "PASS" : "FAIL"}</Badge>}
        {v.product.voltage_flag && <span className="numeric rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground">220V</span>}
        {v.pipelineDecision && <Badge variant={DECISION_VARIANT[v.pipelineDecision]} className="capitalize">{v.pipelineDecision}</Badge>}
      </div>
      {inDecision && (
        <div className="mt-1.5 flex gap-1">
          {(["go", "hold", "pass"] as Decision[]).map((d) => (
            <button
              key={d}
              onClick={() => onDecide(d)}
              className={cn(
                "flex-1 rounded border px-1 py-0.5 text-[10px] font-medium capitalize transition",
                v.pipelineDecision === d ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {d}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
