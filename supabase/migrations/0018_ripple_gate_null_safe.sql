-- Three-valued-logic fix (applied to prod as ripple_gate_null_safe, 2026-07-08):
-- is_owner() is NULL for a caller with no membership row (auth.uid() null / unknown),
-- and `if not NULL` does not raise — a membership-less authenticated caller slipped
-- past 0017's gate (caught by a prod smoke test during remediation verification).
-- Coalesce to false so ONLY a confirmed owner passes.
create or replace function public.ripple_target_landed(p_gross_margin numeric)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if not coalesce(public.is_owner(), false) then
    raise exception 'owner only';
  end if;
  if p_gross_margin is null or p_gross_margin <= 0 or p_gross_margin >= 1 then
    raise exception 'gross margin must be between 0 and 1';
  end if;
  update public.selections
  set target_landed_cost = case
        when target_sell_price is null then null
        else round((1 - p_gross_margin) * target_sell_price, 2)
      end
  where not (
    calc_inputs is not null
    and coalesce(calc_inputs->>'overridden', 'true') <> 'false'
    and calc_inputs ? 'grossMargin'
  );
  get diagnostics n = row_count;
  return n;
end;
$$;
