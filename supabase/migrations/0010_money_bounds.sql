-- Money sanity at the schema layer: the quote-of-record and the partner's targets can
-- never be zero/negative. App-layer validation exists too (actions.ts badMoney, rfq
-- toNum) — these CHECKs are the backstop that survives any future write path.
alter table public.factory_quotes
  add constraint factory_quotes_landed_positive check (landed_cost_ddp > 0),
  add constraint factory_quotes_moq_positive check (moq is null or moq > 0);

alter table public.selections
  add constraint selections_sell_positive check (target_sell_price is null or target_sell_price > 0),
  add constraint selections_landed_positive check (target_landed_cost is null or target_landed_cost > 0);
