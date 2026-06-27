-- Atomic selected-quote swap, in one transaction.
--   p_landed IS NOT NULL → deselect the current quote and insert the new one as selected.
--     The two run together, so the partial unique index (factory_quotes_one_selected) is
--     always satisfied and there is NO window where a re-quote leaves zero selected quotes.
--   p_landed IS NULL → explicit deselect-only: clears the selected quote (the UI's
--     "clear quote" action) and inserts nothing. Economics fall back to no-quote — intended.
-- SECURITY INVOKER: RLS (owner_write = is_owner()) still gates the writes; auth.uid()
-- resolves to the calling owner. Replaces the deselect-then-insert / insert-then-deselect
-- races in app/actions.saveQuote and the /api/rfq-import route.
create or replace function public.set_selected_quote(
  p_product_id uuid,
  p_landed numeric,
  p_moq int default null,
  p_supplier text default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.factory_quotes set is_selected = false
    where product_id = p_product_id and is_selected = true;
  if p_landed is not null then
    insert into public.factory_quotes (product_id, landed_cost_ddp, moq, supplier, is_selected, created_by)
    values (p_product_id, p_landed, p_moq, p_supplier, true, auth.uid());
  end if;
end;
$$;

revoke all on function public.set_selected_quote(uuid, numeric, int, text) from public, anon;
grant execute on function public.set_selected_quote(uuid, numeric, int, text) to authenticated;
