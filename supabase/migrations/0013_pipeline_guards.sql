-- 0013_pipeline_guards.sql — pipeline hardening (review follow-up)
--
-- Two guards so the Kanban can never strand a card:
--   (a) every product ALWAYS has a pipeline_status row (was: seeded only at
--       import, so a product created another way had no row → the board move
--       silently no-op'd and the card snapped back).
--   (b) 'decision' is no longer an irreversible dead-end: the owner may send a
--       card back to 'costing' to re-work the sourcing. Every previously-legal
--       transition is preserved verbatim; this only ADDS one owner edge.

-- ── (a) auto-seed a pipeline_status row for every new product ─────────────────
-- AFTER INSERT so the product row is committed and its id is available. Idempotent
-- via ON CONFLICT DO NOTHING against the unique pipeline_status.product_id, so a
-- product that already has a row (e.g. seeded at import) is untouched.
create or replace function public.seed_pipeline_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.pipeline_status (product_id, status)
  values (new.id, 'new')
  on conflict (product_id) do nothing;
  return new;
end; $$;

drop trigger if exists product_seed_pipeline on public.products;
create trigger product_seed_pipeline after insert on public.products
  for each row execute function public.seed_pipeline_status();

-- Backfill any existing products that predate this trigger (no-op if none).
insert into public.pipeline_status (product_id, status)
select p.id, 'new'
from public.products p
where not exists (
  select 1 from public.pipeline_status ps where ps.product_id = p.id
)
on conflict (product_id) do nothing;

-- ── (b) allow owner  decision -> costing  (escape the dead-end) ───────────────
-- Re-CREATE OR REPLACE the whole function so it stays a single source of truth.
-- Body is the live 0002 definition with the one new owner edge appended to the
-- owner IN-list; nothing else changes.
create or replace function public.can_transition(old_status text, new_status text, role text)
returns boolean language sql immutable set search_path = public as $$
  select case
    when old_status = new_status then true
    when role = 'partner' and ((old_status,new_status) in (('new','shortlisted'),('shortlisted','new'))) then true
    when role = 'owner'   and ((old_status,new_status) in (('shortlisted','costing'),('costing','quoted'),('quoted','costing'),('costing','shortlisted'),('decision','costing'))) then true
    when new_status = 'decision' then true          -- either role may decide
    else false
  end;
$$;
