"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Lock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { TierBadge } from "@/components/ui/tier-badge";
import { VoltageBadge } from "@/components/ui/voltage-badge";
import { canTransition } from "@/lib/auth/capabilities";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { movePipeline } from "@/app/actions";
import type { ProductWithPipeline } from "@/lib/data/queries";
import type { Decision, PipelineStatus, Role } from "@/lib/types";

const STAGES: { id: PipelineStatus; label: string; hint: string }[] = [
  { id: "new", label: "New", hint: "Unscreened" },
  { id: "shortlisted", label: "Shortlisted", hint: "Partner picks" },
  { id: "costing", label: "Costing", hint: "Owner sourcing" },
  { id: "quoted", label: "Quoted", hint: "Factory quote in" },
  { id: "decision", label: "Decision", hint: "Go / Hold / Pass" },
];
const DECISION_VARIANT: Record<Decision, "pass" | "warn" | "fail"> = { go: "pass", hold: "warn", pass: "fail" };

export function PipelineBoard({ views, role }: { views: ProductWithPipeline[]; role: Role }) {
  const router = useRouter();
  const [optimistic, setOptimistic] = useState<Record<string, PipelineStatus>>({});
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dragRef, setDragRef] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<PipelineStatus | null>(null);
  // In-flight moves, keyed by ref → { to, ackedViews }. We hold the optimistic card
  // (skip generic eviction) for the whole flight. `ackedViews` is set to the CURRENT
  // `views` reference at the moment movePipeline returns ok; it stays null while the
  // action is still running. The silent no-op — the action succeeds while updating
  // zero rows (e.g. a product with no pipeline_status row), which would otherwise
  // strand the card — is only diagnosed once a NEW `views` (a genuine server refresh,
  // different reference from `ackedViews`) has arrived and STILL doesn't reflect the
  // target. Keying off a real data refresh, not action-ack timing, is what prevents
  // falsely reverting an ordinary success whose fresh `views` simply hasn't landed
  // yet (the realtime refresh is a separate round-trip from the action's response).
  // A ref, not state: mutating it must not itself re-render.
  const pendingAck = useRef<Record<string, { to: PipelineStatus; ackedViews: ProductWithPipeline[] | null }>>({});
  // Always-current `views` reference, so an async commit callback can stamp the
  // reference as of when the server acked (not the possibly-stale closure value).
  const viewsRef = useRef(views);
  viewsRef.current = views;

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
    for (const v of views) m[optimistic[v.product.external_ref] ?? v.pipelineStatus]?.push(v);
    return m;
  }, [views, optimistic]);

  // Evict each optimistic entry once the revalidated server props catch up to it — no
  // flicker on success, and no stranded cards if a concurrent user moves one further.
  // Also reconciles server-ACKed moves: if the action reported success but a fresh
  // `views` shows the card DIDN'T actually land in the target stage, the move was a
  // silent no-op — revert the optimistic card and tell the user, rather than leaving
  // it stranded until it snaps back on some later render.
  useEffect(() => {
    // Decide what to do PURELY first (no ref mutation / setState inside the render
    // path), then apply side effects once. Keeps the setOptimistic updater pure so
    // a Strict-Mode double-invoke can't drop half the reconciliation.
    const landed: string[] = []; // in-flight refs the server now reflects
    const noOp: string[] = []; // acked refs a fresh refresh still doesn't reflect
    for (const v of views) {
      const ref = v.product.external_ref;
      const flight = pendingAck.current[ref];
      if (!flight) continue;
      if (v.pipelineStatus === flight.to) {
        landed.push(ref);
      } else if (
        flight.ackedViews !== null && // action returned ok
        flight.ackedViews !== views && // AND a genuinely newer `views` has since arrived
        (optimistic[ref] ?? null) === flight.to // and we still show the optimistic move
      ) {
        // Server acked and a real refresh landed, yet the card isn't at the target
        // → the update touched zero rows: a silent no-op, not a slow success.
        noOp.push(ref);
      }
      // else: still in flight (not acked, or no fresh `views` yet) — hold the card.
    }
    for (const ref of landed) delete pendingAck.current[ref];
    for (const ref of noOp) delete pendingAck.current[ref];

    setOptimistic((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const ref of noOp) {
        if (ref in next) { delete next[ref]; changed = true; } // revert the stranded card
      }
      for (const v of views) {
        const ref = v.product.external_ref;
        if (pendingAck.current[ref]) continue; // still in flight — leave its overlay alone
        // Drop the overlay once (or if) the server data matches it.
        if (ref in next && next[ref] === v.pipelineStatus) { delete next[ref]; changed = true; }
      }
      return changed ? next : prev;
    });
    if (noOp.length) setError("That move didn’t take — the card was reset. Please try again.");
  }, [views, optimistic]);

  function commit(ref: string, to: PipelineStatus, decision: Decision | null = null) {
    // Track the move as awaiting server confirmation BEFORE dispatching, so the
    // reconcile effect owns this ref no matter when the revalidated `views` lands
    // (it can arrive before the await below resolves). On success the effect either
    // confirms it landed (evict, no flicker) or detects a silent no-op (revert +
    // surface an error). On an explicit error we clear it and revert here.
    pendingAck.current[ref] = { to, ackedViews: null };
    startTransition(async () => {
      const res = await movePipeline(ref, to, decision);
      if ("error" in res) {
        delete pendingAck.current[ref];
        setOptimistic((s) => { const n = { ...s }; delete n[ref]; return n; }); // revert
        setError(res.error);
        return;
      }
      // Arm the no-op check: stamp the `views` reference that was current when the
      // server acked. The reconcile effect only flags a no-op once a DIFFERENT
      // `views` (a real refresh) has since arrived — never against this stale one,
      // so an ordinary success whose fresh data hasn't landed yet isn't reverted.
      // If the reconcile effect already saw the move land, the flight is gone.
      const flight = pendingAck.current[ref];
      if (flight) flight.ackedViews = viewsRef.current;
    });
  }

  // Shared move path for BOTH drag-and-drop and the keyboard/click "Move" menu.
  function requestMove(ref: string, to: PipelineStatus) {
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

  function onDrop(to: PipelineStatus) {
    const ref = dragRef;
    setDragRef(null);
    setOverStage(null);
    if (ref) requestMove(ref, to);
  }

  return (
    <div>
      {error && (
        <div role="alert" className="mb-3 flex items-center gap-2 rounded-md border border-fail/30 bg-fail-muted px-3 py-2 text-[12px] text-fail-muted-foreground">
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
                    moveTargets={STAGES.filter((s) => s.id !== stage.id && canTransition(stage.id, s.id, role))}
                    onMove={(to) => requestMove(v.product.external_ref, to)}
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
        Drag a card or use its <b className="font-medium text-foreground">Move</b> button to change stage. Partner moves New ↔ Shortlisted; owner moves Shortlisted → Costing → Quoted; either may send to Decision. Changes sync live for both partners.
      </p>
    </div>
  );
}

function PipelineCard({
  view: v,
  inDecision,
  moveTargets,
  onMove,
  onDragStart,
  onDragEnd,
  onDecide,
}: {
  view: ProductWithPipeline;
  inDecision: boolean;
  moveTargets: { id: PipelineStatus; label: string }[];
  onMove: (to: PipelineStatus) => void;
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
      {v.product.model && <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{v.product.model}</div>}
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {v.selection.tier && <TierBadge tier={v.selection.tier} className="text-[10px]" />}
        {v.economics.verdict && <Badge variant={v.economics.verdict.pass ? "pass" : "fail"}>{v.economics.verdict.pass ? "PASS" : "FAIL"}</Badge>}
        {v.product.voltage_flag && <VoltageBadge className="text-[10px]" />}
        {v.pipelineDecision && <Badge variant={DECISION_VARIANT[v.pipelineDecision]} className="capitalize">{v.pipelineDecision}</Badge>}
      </div>
      {!inDecision && moveTargets.length > 0 && <MoveMenu name={v.product.name} targets={moveTargets} onMove={onMove} />}
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

/** Keyboard/click-accessible stage mover — the non-drag path to move a card. */
function MoveMenu({
  name,
  targets,
  onMove,
}: {
  name: string;
  targets: { id: PipelineStatus; label: string }[];
  onMove: (to: PipelineStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative mt-1.5" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Move ${name} to another stage`}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-center gap-1 rounded border border-border px-1 py-0.5 text-[10px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        <ArrowRightLeft className="size-3" aria-hidden /> Move
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div role="menu" className="absolute inset-x-0 z-20 mt-1 overflow-hidden rounded-md border border-border bg-card shadow-card">
            {targets.map((s) => (
              <button
                key={s.id}
                role="menuitem"
                type="button"
                onClick={() => { setOpen(false); onMove(s.id); }}
                className="block w-full px-2 py-1 text-left text-[11px] hover:bg-muted"
              >
                {s.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
