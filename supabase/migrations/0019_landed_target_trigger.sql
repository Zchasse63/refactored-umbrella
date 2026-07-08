-- Re-audit low/latent cleanup (2026-07-08), two parts:
--
-- 1) ripple_target_landed hardening:
--    - Override detection now matches the app EXACTLY: an override only counts when
--      calc_inputs.grossMargin has a NON-NULL VALUE (the old `?` key-presence check
--      would freeze a {"grossMargin": null} row that the app would recompute).
--    - nullif(..., 0): a degenerate sell (≤ ~$0.014 at 65%) rounds to 0.00, which
--      violates CHECK (target_landed_cost IS NULL OR > 0) and aborted the ENTIRE
--      set-based ripple after the assumptions row had already committed. Landed
--      target becomes NULL for such rows instead — the CHECK's own "unknown" state.
--
-- 2) selections_derive_landed trigger: target_landed_cost is now DERIVED IN THE DB
--    whenever target_sell_price or calc_inputs change (insert or update). The app's
--    read-then-upsert recompute had a (theoretical, two-user) race: the trigger's
--    NEW row is the post-merge row, so the derivation is atomic by construction.
--    Direct target_landed_cost writes that do NOT touch the inputs (the ripple RPC)
--    pass through untouched. SECURITY DEFINER so the assumptions read works for any
--    writer (partners via RLS, service-role scripts) without policy coupling.

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
        else nullif(round((1 - p_gross_margin) * target_sell_price, 2), 0)
      end
  where not (
    calc_inputs is not null
    and coalesce(calc_inputs->>'overridden', 'true') <> 'false'
    and calc_inputs->'grossMargin' is not null
    and jsonb_typeof(calc_inputs->'grossMargin') <> 'null'
  );
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.selections_derive_target_landed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  eff numeric;
begin
  -- Recompute ONLY when the derivation inputs changed; a direct target_landed_cost
  -- write that leaves sell/calc_inputs alone (ripple_target_landed) passes through.
  if tg_op = 'UPDATE'
     and new.target_sell_price is not distinct from old.target_sell_price
     and new.calc_inputs is not distinct from old.calc_inputs then
    return new;
  end if;
  if new.target_sell_price is null then
    new.target_landed_cost := null;
    return new;
  end if;
  select a.gross_margin into eff from public.assumptions a where a.id = 1;
  if new.calc_inputs is not null
     and coalesce(new.calc_inputs->>'overridden', 'true') <> 'false'
     and new.calc_inputs->'grossMargin' is not null
     and jsonb_typeof(new.calc_inputs->'grossMargin') <> 'null' then
    eff := (new.calc_inputs->>'grossMargin')::numeric;
  end if;
  new.target_landed_cost := nullif(round((1 - eff) * new.target_sell_price, 2), 0);
  return new;
end;
$$;

drop trigger if exists selections_derive_landed on public.selections;
create trigger selections_derive_landed
  before insert or update on public.selections
  for each row execute function public.selections_derive_target_landed();
