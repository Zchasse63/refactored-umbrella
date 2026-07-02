-- RECOVERY MIGRATION: these columns were added to the live DB by session migrations
-- (0004_clean_copy_columns / 0005_model_clean_column) that were never committed to the
-- repo. Re-declared idempotently so `supabase db reset` / a second environment
-- reproduces production. (Competitor package/intel drift was already recovered in 0009.)
alter table public.products add column if not exists name_clean     text;
alter table public.products add column if not exists summary        text;
alter table public.products add column if not exists features_clean text[];
alter table public.products add column if not exists model_clean    text;
