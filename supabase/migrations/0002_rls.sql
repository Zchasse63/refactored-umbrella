-- ════════════════════════════════════════════════════════════════════════════
-- RLS — full transparency on READS, role-gated WRITES (BUILD_PLAN §7).
-- The write gates here MUST match lib/auth/capabilities.ts exactly (one shared
-- role-capability map drives both the UI lock affordances and these policies).
-- ════════════════════════════════════════════════════════════════════════════

alter table public.memberships     enable row level security;
alter table public.products        enable row level security;
alter table public.product_images  enable row level security;
alter table public.competitors     enable row level security;
alter table public.selections      enable row level security;
alter table public.factory_quotes  enable row level security;
alter table public.assumptions     enable row level security;
alter table public.pipeline_status enable row level security;
alter table public.comments        enable row level security;
alter table public.activity        enable row level security;
alter table public.search_profiles enable row level security;
alter table public.competitor_feedback enable row level security;

-- ── READ: identical for both roles, every table (nothing is hidden) ──────────
create policy read_all on public.products        for select using (public.is_member());
create policy read_all on public.product_images  for select using (public.is_member());
create policy read_all on public.competitors     for select using (public.is_member());
create policy read_all on public.selections      for select using (public.is_member());
create policy read_all on public.factory_quotes  for select using (public.is_member());
create policy read_all on public.assumptions     for select using (public.is_member());
create policy read_all on public.pipeline_status for select using (public.is_member());
create policy read_all on public.comments        for select using (public.is_member());
create policy read_all on public.activity        for select using (public.is_member());
create policy read_all on public.search_profiles for select using (public.is_member());
create policy read_all on public.competitor_feedback for select using (public.is_member());
create policy read_self on public.memberships    for select using (public.is_member());

-- ── WRITE GATES ─────────────────────────────────────────────────────────────
-- Owner authors catalog, specs, images, competitors, quotes, global assumptions.
create policy owner_write on public.products        for all using (public.is_owner()) with check (public.is_owner());
create policy owner_write on public.product_images  for all using (public.is_owner()) with check (public.is_owner());
create policy owner_write on public.competitors     for all using (public.is_owner()) with check (public.is_owner());
create policy owner_write on public.factory_quotes  for all using (public.is_owner()) with check (public.is_owner());
create policy owner_write on public.assumptions     for update using (public.is_owner()) with check (public.is_owner());
create policy owner_write on public.search_profiles for all using (public.is_owner()) with check (public.is_owner());

-- Partner owns their own selections only.
create policy partner_write on public.selections for all
  using  (public.is_partner() and partner_user_id = auth.uid())
  with check (public.is_partner() and partner_user_id = auth.uid());

-- Pipeline: both may transition; the legal-move matrix is enforced by a trigger
-- (can_transition) so the rule lives in one SQL function reused by tests.
create policy member_move on public.pipeline_status for update
  using (public.is_member()) with check (public.is_member());

-- Comments / feedback: write your own; activity is append-only.
create policy own_comment   on public.comments  for insert with check (public.is_member() and user_id = auth.uid());
create policy own_comment_d on public.comments  for delete using (user_id = auth.uid());
create policy own_feedback  on public.competitor_feedback for insert with check (public.is_member() and user_id = auth.uid());
create policy append_only   on public.activity  for insert with check (public.is_member() and actor_id = auth.uid());

-- ── Pipeline transition matrix (partner: new↔shortlisted; owner: costing→quoted; either →decision)
create or replace function public.can_transition(old_status text, new_status text, role text)
returns boolean language sql immutable as $$
  select case
    when old_status = new_status then true
    when role = 'partner' and ((old_status,new_status) in (('new','shortlisted'),('shortlisted','new'))) then true
    when role = 'owner'   and ((old_status,new_status) in (('shortlisted','costing'),('costing','quoted'),('quoted','costing'),('costing','shortlisted'))) then true
    when new_status = 'decision' then true          -- either role may decide
    else false
  end;
$$;

create or replace function public.enforce_pipeline_transition()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.can_transition(old.status, new.status, public.app_role()) then
    raise exception 'illegal pipeline transition % -> % for role %', old.status, new.status, public.app_role();
  end if;
  return new;
end; $$;
create trigger pipeline_transition_guard before update on public.pipeline_status
  for each row execute function public.enforce_pipeline_transition();
