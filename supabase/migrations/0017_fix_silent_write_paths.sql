-- Audit v2 (2026-07-08) remediation: the two DB-side silent-failure fixes.
--
-- 1) PGRST203 ambiguity: 0014 "re-created" set_selected_quote with an added
--    p_lead_time param — but CREATE OR REPLACE with a different signature ADDS an
--    overload instead of replacing. A 4-named-arg call (the /api/rfq-import route)
--    matches both the 4-arg version and the 5-arg version via its default, so
--    PostgREST refuses with PGRST203 and the RFQ round-trip imports ZERO quotes.
--    Drop the stale 4-arg overload; the 5-arg one serves both call shapes.
--
-- 2) Assumptions ripple was RLS-dead: selections' partner_write policy is
--    is_partner(), so the OWNER's per-row target_landed_cost recompute in
--    saveAssumptions matched zero rows — silently, since UPDATE over no rows is
--    not an error. Replace with a SECURITY DEFINER set-based RPC, owner-gated
--    internally, that mirrors compute()'s override semantics: a per-product
--    calc_inputs override with its own grossMargin (and overridden !== false)
--    keeps its landed target; everything else recomputes at the new margin.

drop function if exists public.set_selected_quote(uuid, numeric, int, text);

create or replace function public.ripple_target_landed(p_gross_margin numeric)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  -- NOTE (historical): this gate has a NULL hole — is_owner() is NULL for a caller
  -- with no membership row and `if not NULL` does not raise. Fixed in 0018, kept
  -- as-applied here so this file matches prod's fix_silent_write_paths ledger entry.
  if not public.is_owner() then
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

revoke all on function public.ripple_target_landed(numeric) from public, anon;
grant execute on function public.ripple_target_landed(numeric) to authenticated;
