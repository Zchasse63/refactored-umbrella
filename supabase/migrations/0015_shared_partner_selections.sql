-- Multi-partner readiness: the partner SIDE speaks with one voice per product.
-- Two partner accounts (Kade + Shahiq) are joining; the original model gave each
-- partner their OWN selection row per product, which (a) breaks the PDP's
-- maybeSingle() the moment both touch the same product, (b) makes getCatalog
-- last-writer-wins, and (c) splits the "target" into two competing numbers the
-- owner can't RFQ against. One shared row per product; any partner may edit;
-- attribution = partner_user_id/updated_by (the last editor).
-- Safe now: selections has 0 rows.

alter table public.selections
  drop constraint if exists selections_product_id_partner_user_id_key;
drop index if exists selections_product_id_partner_user_id_key;
create unique index if not exists selections_product_unique on public.selections (product_id);

drop policy if exists partner_write on public.selections;
create policy partner_write on public.selections for all
  using  (public.is_partner())
  with check (public.is_partner() and partner_user_id = auth.uid());
