-- RFQ export snapshots (BUILD_PLAN §12): capture what was actually sent to the factory —
-- the rows and the assumptions they were computed under — so a later global-assumptions
-- change can never silently diverge from a sent RFQ. Becomes load-bearing the moment the
-- assumptions editor ships (same migration wave).
create table if not exists public.rfq_exports (
  id                   uuid primary key default gen_random_uuid(),
  created_by           uuid references auth.users(id),
  created_at           timestamptz not null default now(),
  product_refs         text[] not null,
  assumptions_snapshot jsonb not null, -- { grossMargin, costStack } at export time
  rows_snapshot        jsonb not null  -- the exact RfqRow[] written to the workbook
);

alter table public.rfq_exports enable row level security;
create policy read_all  on public.rfq_exports for select using (public.is_member());
create policy owner_ins on public.rfq_exports for insert with check (public.is_owner());
