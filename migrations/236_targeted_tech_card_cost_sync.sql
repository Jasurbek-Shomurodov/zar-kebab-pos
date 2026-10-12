-- Recalculate only the dishes a change can affect. Since 155/183 every recipe
-- save (and every manual cost or Bazaar price change) recalculated the protected
-- cost of every dish with a recipe, repeated until nothing changed, then
-- re-validated every recipe. Now each recipe mutation records its dish, and the
-- deferred sync recalculates that dish plus every dish that includes it,
-- directly or through other dishes. Results are identical: a dish's cost only
-- depends on its own recipe and the protected costs of the dishes it includes.
--
-- The full sync_menu_item_tech_card_real_costs() is kept unchanged for manual
-- backfills. No permissions, triggers or historical snapshots change.

begin;

-- Each recipe row mutation adds its dish to a transaction-local set.
create or replace function public.mark_tech_card_costs_dirty()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  dirty_items text := coalesce(current_setting('app.tech_card_dirty_items', true), '');
begin
  perform set_config('app.tech_card_costs_dirty', 'on', true);
  if tg_op in ('UPDATE', 'DELETE') then
    dirty_items := dirty_items || ',' || coalesce(old.menu_item_id, '');
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    dirty_items := dirty_items || ',' || coalesce(new.menu_item_id, '');
  end if;
  perform set_config('app.tech_card_dirty_items', dirty_items, true);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- Same rules as sync_menu_item_tech_card_real_costs(), limited to the seed dishes
-- and everything that includes them (reverse component closure, cycle-safe).
create or replace function public.sync_menu_item_tech_card_real_costs_for(p_menu_item_ids text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  affected text[];
  pass integer;
  changed_count integer;
begin
  if p_menu_item_ids is null or cardinality(p_menu_item_ids) = 0 then return; end if;

  with recursive closure(menu_item_id) as (
    select distinct seed from unnest(p_menu_item_ids) seed where coalesce(seed, '') <> ''
    union
    select component.menu_item_id
    from public.menu_item_tech_card_components component
    join closure on closure.menu_item_id = component.component_menu_item_id
  )
  select coalesce(array_agg(menu_item_id), '{}') into affected from closure;
  if cardinality(affected) = 0 then return; end if;

  -- Cost writes inside this function must not recursively schedule another sync.
  perform set_config('app.tech_card_cost_sync_running', 'on', true);

  update public.menu_item_costs item_cost
  set cost_source = 'manual', updated_at = now()
  where item_cost.menu_item_id = any(affected)
    and item_cost.cost_source = 'tech_card'
    and not exists (
      select 1 from public.menu_item_tech_cards card
      where card.menu_item_id = item_cost.menu_item_id and card.variant_option_id = ''
    );

  -- One pass per dependency level at most; stop as soon as costs converge.
  for pass in 0..cardinality(affected) loop
    insert into public.menu_item_costs (menu_item_id, cost_price, variant_costs, cost_source, updated_at)
    select
      item.id,
      coalesce(base.cost_price, existing.cost_price, 0)::integer,
      coalesce(existing.variant_costs, '{}'::jsonb) || coalesce(variants.costs, '{}'::jsonb),
      case when base.cost_price is not null then 'tech_card' else coalesce(existing.cost_source, 'manual') end,
      now()
    from public.menu_items item
    left join public.menu_item_costs existing on existing.menu_item_id = item.id
    left join lateral (
      select public.calculate_menu_item_variant_tech_card_real_cost(item.id, '') as cost_price
      where exists (
        select 1 from public.menu_item_tech_cards card
        where card.menu_item_id = item.id and card.variant_option_id = ''
      )
    ) base on true
    left join lateral (
      select jsonb_object_agg(card.variant_option_id, calculated.cost_price) as costs
      from public.menu_item_tech_cards card
      cross join lateral (
        select public.calculate_menu_item_variant_tech_card_real_cost(card.menu_item_id, card.variant_option_id) as cost_price
      ) calculated
      where card.menu_item_id = item.id and card.variant_option_id <> ''
        and calculated.cost_price is not null
    ) variants on true
    where item.id = any(affected)
      and (base.cost_price is not null or variants.costs is not null)
    on conflict (menu_item_id) do update set
      cost_price = excluded.cost_price,
      variant_costs = excluded.variant_costs,
      cost_source = excluded.cost_source,
      updated_at = excluded.updated_at
    where (menu_item_costs.cost_price, menu_item_costs.variant_costs, menu_item_costs.cost_source)
      is distinct from (excluded.cost_price, excluded.variant_costs, excluded.cost_source);
    get diagnostics changed_count = row_count;
    exit when changed_count = 0;
  end loop;

  if exists (
    select 1 from public.menu_item_tech_cards card
    where card.menu_item_id = any(affected)
      and public.calculate_menu_item_variant_tech_card_real_cost(card.menu_item_id, card.variant_option_id) is null
  ) then
    raise exception 'Every included menu item must have a real cost';
  end if;
  perform set_config('app.tech_card_cost_sync_running', 'off', true);
end;
$$;

create or replace function public.trigger_sync_menu_item_tech_card_real_costs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  dirty_items text[];
begin
  if coalesce(current_setting('app.tech_card_cost_sync_running', true), '') <> 'on' then
    if tg_table_name = 'menu_item_costs' then
      -- A manual base/variant cost change affects that dish and what includes it.
      perform public.sync_menu_item_tech_card_real_costs_for(array[
        case when tg_op = 'DELETE' then old.menu_item_id else new.menu_item_id end
      ]);
    elsif current_setting('app.tech_card_costs_dirty', true) = 'on' then
      dirty_items := array_remove(string_to_array(coalesce(current_setting('app.tech_card_dirty_items', true), ''), ','), '');
      perform set_config('app.tech_card_costs_dirty', 'off', true);
      perform set_config('app.tech_card_dirty_items', '', true);
      perform public.sync_menu_item_tech_card_real_costs_for(dirty_items);
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.mark_tech_card_costs_dirty() from public, anon, authenticated;
revoke all on function public.sync_menu_item_tech_card_real_costs_for(text[]) from public, anon, authenticated;
revoke all on function public.trigger_sync_menu_item_tech_card_real_costs() from public, anon, authenticated;

commit;
