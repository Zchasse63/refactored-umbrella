-- Competitor-intel fields captured from Keepa during discovery. Additive + idempotent:
-- every column is ADD ... IF NOT EXISTS so re-applying against the live DB is a no-op and a
-- fresh `supabase db reset` reproduces prod. Existing rows get NULL (= "unknown", never 0).

-- (A) Re-declare the package_* cols that currently live ONLY in the prod DB (an earlier
--     uncommitted migration added them; queries.ts/actions.ts already reference them).
alter table public.competitors add column if not exists package_length_mm int;
alter table public.competitors add column if not exists package_width_mm  int;
alter table public.competitors add column if not exists package_height_mm int;
alter table public.competitors add column if not exists package_weight_g  int;

-- (B) New competitor-intel columns.
alter table public.competitors add column if not exists price_avg90       numeric(12,2); -- 90d avg NEW price
alter table public.competitors add column if not exists price_min90       numeric(12,2);
alter table public.competitors add column if not exists price_max90       numeric(12,2);
alter table public.competitors add column if not exists bsr_avg90         int;
alter table public.competitors add column if not exists bsr_best          int;           -- lowest (best) rank seen
alter table public.competitors add column if not exists reviews_added_90d int;           -- review-velocity proxy
alter table public.competitors add column if not exists variations_count  int;           -- sizes/colors pooled on the listing
alter table public.competitors add column if not exists buy_box_is_fba    boolean;       -- NULL when no buy box
alter table public.competitors add column if not exists buy_box_price     numeric(12,2);
alter table public.competitors add column if not exists offer_count       int;           -- stats.totalOfferCount
alter table public.competitors add column if not exists listed_since      timestamptz;   -- listing age source
alter table public.competitors add column if not exists fba_pick_pack_fee numeric(12,2); -- Amazon's REAL fee (the calc prefers this)
alter table public.competitors add column if not exists referral_pct      numeric(5,4);  -- fraction 0..1 (e.g. 0.1500)

-- (C) Index the median-fee aggregate over approved rows that carry a real fee.
create index if not exists competitors_fee_idx on public.competitors (product_id)
  where status = 'approved' and fba_pick_pack_fee is not null;
