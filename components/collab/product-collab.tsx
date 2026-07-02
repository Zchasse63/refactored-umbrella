"use client";

import { useState, useTransition } from "react";
import { MessageSquare, Send, Trash2, Loader2, Check, StickyNote } from "lucide-react";
import { cn, relativeTime } from "@/lib/utils";
import { saveSelection, saveComment, deleteComment } from "@/app/actions";
import type { CommentView } from "@/lib/data/queries";
import type { Role } from "@/lib/types";

/**
 * The collaboration channel for a product (the point of a 2-sided tool): the partner's
 * shared notes + a comments thread both partners post to. Notes live on selections
 * (partner-owned, everyone reads); comments are per-author with self-delete.
 */
export function ProductCollab({
  productRef,
  role,
  initialNotes,
  notesUpdatedAt,
  comments,
}: {
  productRef: string;
  role: Role;
  initialNotes: string | null;
  notesUpdatedAt: string | null;
  comments: CommentView[];
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Notes productRef={productRef} role={role} initial={initialNotes} updatedAt={notesUpdatedAt} />
      <Comments productRef={productRef} comments={comments} />
    </div>
  );
}

function Notes({ productRef, role, initial, updatedAt }: { productRef: string; role: Role; initial: string | null; updatedAt: string | null }) {
  const canEdit = role === "partner";
  const [text, setText] = useState(initial ?? "");
  const [pending, start] = useTransition();
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");
  const dirty = text !== (initial ?? "");

  const save = () =>
    start(async () => {
      const r = await saveSelection(productRef, { notes: text.trim() ? text.trim() : null });
      setState("error" in r ? "error" : "saved");
      if (!("error" in r)) setTimeout(() => setState("idle"), 2000);
    });

  return (
    <section className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-partner">
          <StickyNote className="size-3" aria-hidden /> Notes
        </span>
        {updatedAt && <span className="text-[10px] text-muted-foreground">updated {relativeTime(updatedAt)}</span>}
      </div>
      {canEdit ? (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={4000}
            placeholder="Why pursue / pass? Market read, target rationale, reminders…"
            className="w-full resize-y rounded-md border border-input bg-card px-2.5 py-2 text-[13px] outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="mt-1.5 flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={!dirty || pending}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-[12px] font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {pending ? <Loader2 className="size-3 animate-spin" /> : state === "saved" ? <Check className="size-3" /> : null}
              {state === "saved" ? "Saved" : "Save note"}
            </button>
            {state === "error" && <span role="alert" className="text-[11px] font-medium text-fail">Couldn&apos;t save — try again</span>}
          </div>
        </>
      ) : text ? (
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{text}</p>
      ) : (
        <p className="text-[12px] text-muted-foreground">No notes yet — the partner records the rationale here.</p>
      )}
    </section>
  );
}

function Comments({ productRef, comments }: { productRef: string; comments: CommentView[] }) {
  const [draft, setDraft] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const post = () =>
    start(async () => {
      setErr(null);
      const r = await saveComment(productRef, draft);
      if ("error" in r) setErr(r.error);
      else setDraft("");
    });
  const remove = (id: string) =>
    start(async () => {
      await deleteComment(productRef, id);
    });

  return (
    <section className="rounded-lg border border-border bg-card p-3">
      <span className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <MessageSquare className="size-3" aria-hidden /> Discussion {comments.length > 0 && <span className="numeric text-muted-foreground/70">· {comments.length}</span>}
      </span>
      <div className="mb-2 max-h-64 space-y-2 overflow-y-auto">
        {comments.length === 0 && <p className="text-[12px] text-muted-foreground">No comments yet.</p>}
        {comments.map((c) => (
          <div key={c.id} className="group rounded-md bg-muted/40 px-2.5 py-1.5">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className={cn("font-semibold", c.role === "owner" ? "text-accent-owner" : "text-accent-partner")}>{c.author}</span>
              <span>· {relativeTime(c.created_at)}</span>
              {c.isMine && (
                <button type="button" onClick={() => remove(c.id)} className="ml-auto opacity-0 transition group-hover:opacity-100" aria-label="Delete comment">
                  <Trash2 className="size-3 text-muted-foreground hover:text-fail" />
                </button>
              )}
            </div>
            <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-snug">{c.body}</p>
          </div>
        ))}
      </div>
      <div className="flex items-end gap-1.5">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) post(); }}
          rows={2}
          maxLength={4000}
          placeholder="Add a comment…  (⌘↵ to send)"
          className="w-full resize-y rounded-md border border-input bg-card px-2.5 py-1.5 text-[13px] outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="button"
          onClick={post}
          disabled={!draft.trim() || pending}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-[12px] font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          aria-label="Post comment"
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
        </button>
      </div>
      {err && <p role="alert" className="mt-1 text-[11px] font-medium text-fail">{err}</p>}
    </section>
  );
}
