-- ════════════════════════════════════════════════════════════════════════════
-- The Portal — schema (BUILD_PLAN §6 + AI_LAYER additions). DEDICATED new project.
-- Apply with `supabase db push` (or the apply_migration MCP) once the project exists.
-- Conventions: gen_random_uuid() PKs, jsonb for specs/calc_inputs, external_ref
-- idempotency keys namespaced by line, moddatetime for updated_at.
-- ════════════════════════════════════════════════════════════════════════════
create extension if not exists "pgcrypto";
create extension if not exists "moddatetime" schema extensions;

-- ── memberships — the role source of truth ──────────────────────────────────
create table public.memberships (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null unique references auth.users(id) on delete cascade,
  role         text not null check (role in ('owner','partner')),
  display_name text,
  created_at   timestamptz not null default now()
);
comment on table public.memberships is 'One row per authenticated user; role gates writes, never reads.';

-- SECURITY DEFINER role helpers (avoid recursive RLS on memberships)
create or replace function public.app_role() returns text
  language sql stable security definer set search_path = public as
$$ select role from public.memberships where user_id = auth.uid() $$;
create or replace function public.is_owner()   returns boolean language sql stable as $$ select public.app_role() = 'owner'   $$;
create or replace function public.is_partner() returns boolean language sql stable as $$ select public.app_role() = 'partner' $$;
create or replace function public.is_member()  returns boolean language sql stable as $$ select public.app_role() in ('owner','partner') $$;

-- ── products ────────────────────────────────────────────────────────────────
create table public.products (
  id                 uuid primary key default gen_random_uuid(),
  external_ref       text not null unique,
  line               text not null check (line in ('appliance','beauty','foodservice')),
  brand              text,
  source             text not null check (source in ('RoyalStar','MKS','Greenway')),
  name               text not null,
  model              text,
  group_name         text,
  subsection         text,
  categories         text[] not null default '{}',
  specs              jsonb  not null default '[]',
  features           text[] not null default '{}',
  source_url         text,
  msrp               numeric(12,2),
  our_cost           numeric(12,2),         -- NULL for appliance/beauty (the core "no cost" state)
  our_cost_source    text,
  -- data-cleaning fields (set by the importer)
  photo_state        text not null default 'missing'
                       check (photo_state in ('good','clean-photo-needed','reshoot','missing')),
  image_has_chinese  boolean not null default false,
  voltage_flag       boolean not null default false,   -- lists 220V — verify for US
  export_ok          boolean not null default false,   -- primary image safe for factory RFQ
  primary_image_path text,
  created_by         uuid references auth.users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index products_line_sub_idx   on public.products (line, subsection);
create index products_line_group_idx on public.products (line, group_name);
create index products_specs_gin      on public.products using gin (specs);
create trigger products_updated before update on public.products
  for each row execute function extensions.moddatetime (updated_at);

-- ── product_images ──────────────────────────────────────────────────────────
create table public.product_images (
  id                uuid primary key default gen_random_uuid(),
  product_id        uuid not null references public.products(id) on delete cascade,
  storage_path      text not null,
  is_primary        boolean not null default false,
  sort              int not null default 0,
  photo_state       text,
  image_has_chinese boolean not null default false,
  export_ok         boolean not null default false,
  alt               text,
  created_by        uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  unique (product_id, storage_path)
);
create unique index product_images_one_primary on public.product_images (product_id) where is_primary;

-- ── competitors (Keepa-enriched mini-products) ──────────────────────────────
create table public.competitors (
  id                   uuid primary key default gen_random_uuid(),
  product_id           uuid not null references public.products(id) on delete cascade,
  external_ref         text,                  -- e.g. greenway-cmp:<id> for idempotent re-import
  status               text not null default 'candidate' check (status in ('candidate','approved','rejected')),
  title                text not null,
  brand                text,
  marketplace          text check (marketplace in ('amazon','walmart','other')),
  asin                 text,
  retail_url           text,
  price                numeric(12,2),
  currency             text not null default 'USD',
  rating               numeric(2,1),
  review_count         int,
  bsr                  int,
  est_monthly_sales    int,
  monthly_sales_source text,                  -- 'keepa:monthlySold' | 'keepa:bsr-estimate'
  image_url            text,
  match_confidence     numeric(4,3),
  match_reason         text,
  source               text not null default 'keepa' check (source in ('claude','manual','keepa')),
  enriched_at          timestamptz,
  created_by           uuid references auth.users(id),
  created_at           timestamptz not null default now()
);
create index competitors_product_idx on public.competitors (product_id);

-- ── selections (the partner's working layer) ────────────────────────────────
create table public.selections (
  id                 uuid primary key default gen_random_uuid(),
  product_id         uuid not null references public.products(id) on delete cascade,
  partner_user_id    uuid not null references auth.users(id),
  tier               text check (tier in ('pursue','maybe','pass')),
  priority           int,
  target_sell_price  numeric(12,2),
  target_landed_cost numeric(12,2),           -- derived + persisted; recomputed on global change
  calc_inputs        jsonb,                   -- per-product override bag
  notes              text,
  updated_by         uuid references auth.users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (product_id, partner_user_id)
);
create trigger selections_updated before update on public.selections
  for each row execute function extensions.moddatetime (updated_at);

-- ── factory_quotes (owner-entered, DDP) ─────────────────────────────────────
create table public.factory_quotes (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null references public.products(id) on delete cascade,
  landed_cost_ddp  numeric(12,2) not null,
  moq              int,
  lead_time_days   int,
  quote_date       date not null default current_date,
  supplier         text,
  is_selected      boolean not null default false,
  notes            text,
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now()
);
create unique index factory_quotes_one_selected on public.factory_quotes (product_id) where is_selected;

-- ── assumptions (global cost-stack, one row, + per-line opex profiles) ───────
create table public.assumptions (
  id            int primary key default 1 check (id = 1),
  gross_margin  numeric(4,3) not null default 0.650,
  cost_stack    jsonb not null default
    '[{"key":"referral","label":"Referral","pct":0.15},
      {"key":"ads","label":"Ads","pct":0.15},
      {"key":"fba","label":"FBA logistics","pct":0.15},
      {"key":"returns","label":"Returns","pct":0.04},
      {"key":"partner_split","label":"Partner split","pct":0}]',
  -- Amazon opex applies to appliance/beauty; foodservice is cost-only (B2B).
  line_opex_applies jsonb not null default '{"appliance":true,"beauty":true,"foodservice":false}',
  updated_by    uuid references auth.users(id),
  updated_at    timestamptz not null default now()
);
insert into public.assumptions (id) values (1) on conflict do nothing;
create trigger assumptions_updated before update on public.assumptions
  for each row execute function extensions.moddatetime (updated_at);

-- ── pipeline_status (shared Kanban position) ────────────────────────────────
create table public.pipeline_status (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null unique references public.products(id) on delete cascade,
  status      text not null default 'new'
                check (status in ('new','shortlisted','costing','quoted','decision')),
  decision    text check (decision in ('go','hold','pass')),
  updated_by  uuid references auth.users(id),
  updated_at  timestamptz not null default now()
);
create trigger pipeline_updated before update on public.pipeline_status
  for each row execute function extensions.moddatetime (updated_at);

-- ── comments + activity (audit) ─────────────────────────────────────────────
create table public.comments (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id    uuid not null references auth.users(id),
  body       text not null,
  created_at timestamptz not null default now()
);
create table public.activity (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade,
  actor_id   uuid references auth.users(id),
  verb       text not null,
  payload    jsonb,                            -- {field, from, to} for authorship captions
  created_at timestamptz not null default now()
);
create index activity_product_idx on public.activity (product_id, created_at desc);

-- ── search_profiles + competitor_feedback (AI competitor loop, AI_LAYER §2) ──
create table public.search_profiles (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null unique references public.products(id) on delete cascade,
  query         text,
  include_terms text[] not null default '{}',
  exclude_terms text[] not null default '{}',  -- grows from reject-with-reason feedback
  category_node int,                            -- resolved Keepa category id
  version       int not null default 1,
  updated_by    uuid references auth.users(id),
  updated_at    timestamptz not null default now()
);
create trigger search_profiles_updated before update on public.search_profiles
  for each row execute function extensions.moddatetime (updated_at);

create table public.competitor_feedback (
  id            uuid primary key default gen_random_uuid(),
  competitor_id uuid references public.competitors(id) on delete cascade,
  product_id    uuid not null references public.products(id) on delete cascade,
  user_id       uuid not null references auth.users(id),
  verdict       text not null check (verdict in ('good_fit','not_a_fit')),
  reason_code   text,
  reason_text   text,
  created_at    timestamptz not null default now()
);
