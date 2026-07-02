-- Quote depth: the manual quote form should capture lead time too (schema already has
-- factory_quotes.lead_time_days; the RPC just never accepted it). Re-create the atomic
-- swap with a p_lead_time param — additive, preserves the existing signature's behavior.
create or replace function public.set_selected_quote(
  p_product_id uuid,
  p_landed numeric,
  p_moq int default null,
  p_supplier text default null,
  p_lead_time int default null
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
    insert into public.factory_quotes (product_id, landed_cost_ddp, moq, supplier, lead_time_days, is_selected, created_by)
    values (p_product_id, p_landed, p_moq, p_supplier, p_lead_time, true, auth.uid());
  end if;
end;
$$;

revoke all on function public.set_selected_quote(uuid, numeric, int, text, int) from public, anon;
grant execute on function public.set_selected_quote(uuid, numeric, int, text, int) to authenticated;
