-- A Tech Card cost must never exceed the selling price it is sold at.
--
-- A recipe typed in kilograms instead of grams (40 kg of mango purée in one
-- cup of tea) saved a 13 901 000 UZS cost on a 45 000 UZS drink, and every
-- sale since reported a huge loss. The protected cost sync now refuses any
-- change that leaves a Tech Card (base or variant) costing more than its
-- selling price, whatever caused it: saving the recipe, an included dish's
-- cost rising, or an ingredient's catalog price/unit changing in Ingredients.
-- Lowering a selling price below an existing Tech Card cost is refused too.
--
-- The error keeps a readable message; hint TECH_CARD_COST_EXCEEDS_PRICE marks
-- it and detail holds a JSON array of
-- {menu_item_id, variant_option_id, cost, price} so the app can list the
-- dishes to fix and link to each Tech Card. Only staff who can already see
-- these costs (Tech Cards, Ingredients, Manage Menu) can trigger it.
--
-- Saved order-item cost snapshots and reports are untouched.

begin;
set local lock_timeout = '5s';

-- Selling price of a base recipe ('') or a variant recipe, matching
-- getSelectedMenuBasePrice: an option's own price wins, else base + delta.
create or replace function public.tech_card_selling_price(target_menu_item_id text, target_variant_option_id text)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select case
    when coalesce(target_variant_option_id, '') = '' then item.price::numeric
    else (
      select case
        when coalesce(option_value ->> 'price', '') ~ '^[0-9]+(\.[0-9]+)?$' and (option_value ->> 'price')::numeric > 0
          then (option_value ->> 'price')::numeric
        else item.price::numeric + case
          when coalesce(option_value ->> 'price_delta', '') ~ '^-?[0-9]+(\.[0-9]+)?$' then (option_value ->> 'price_delta')::numeric
          else 0 end
      end
      from jsonb_array_elements(case when jsonb_typeof(item.option_groups) = 'array' then item.option_groups else '[]'::jsonb end) option_group
      cross join lateral jsonb_array_elements(case when jsonb_typeof(option_group -> 'options') = 'array' then option_group -> 'options' else '[]'::jsonb end) option_value
      where option_value ->> 'id' = target_variant_option_id
      limit 1
    )
  end
  from public.menu_items item
  where item.id = target_menu_item_id;
$$;

-- Active Tech Cards among the given dishes whose cost is above their price.
create or replace function public.tech_card_cost_overruns(p_menu_item_ids text[])
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'menu_item_id', card.menu_item_id,
    'variant_option_id', card.variant_option_id,
    'cost', calculated.cost,
    'price', sale.price
  ) order by card.menu_item_id, card.variant_option_id), '[]'::jsonb)
  from public.menu_item_tech_cards card
  join public.menu_items item on item.id = card.menu_item_id and item.deleted_at is null
  cross join lateral (
    select public.calculate_menu_item_variant_tech_card_real_cost(card.menu_item_id, card.variant_option_id) as cost
  ) calculated
  cross join lateral (
    select public.tech_card_selling_price(card.menu_item_id, card.variant_option_id) as price
  ) sale
  where card.menu_item_id = any(coalesce(p_menu_item_ids, '{}'))
    and calculated.cost is not null
    and sale.price > 0
    and calculated.cost > sale.price;
$$;

create or replace function public.raise_tech_card_cost_overruns(p_menu_item_ids text[])
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  overruns jsonb := public.tech_card_cost_overruns(p_menu_item_ids);
begin
  if jsonb_array_length(overruns) > 0 then
    raise exception 'Tech card cost is higher than the selling price'
      using errcode = 'P0001', detail = overruns::text, hint = 'TECH_CARD_COST_EXCEEDS_PRICE';
  end if;
end;
$$;

-- Same as 236, plus the overrun check once costs have converged.
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

  -- Any dish this change touched (directly or through included dishes) must
  -- still cost less than or equal to what it sells for.
  perform public.raise_tech_card_cost_overruns(affected);
  perform set_config('app.tech_card_cost_sync_running', 'off', true);
end;
$$;

-- Only option ids and prices: payment rewrites option_groups for variant
-- stock, and a sale must never be blocked by this guard.
create or replace function public.menu_item_option_price_signature(option_groups jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_array(option_value -> 'id', option_value -> 'price', option_value -> 'price_delta')
    order by option_value ->> 'id'), '[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(option_groups) = 'array' then option_groups else '[]'::jsonb end) option_group
  cross join lateral jsonb_array_elements(case when jsonb_typeof(option_group -> 'options') = 'array' then option_group -> 'options' else '[]'::jsonb end) option_value;
$$;

-- Lowering a base or variant selling price below its Tech Card cost.
create or replace function public.guard_menu_item_price_above_tech_card_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.deleted_at is null
    and (old.price is distinct from new.price
      or public.menu_item_option_price_signature(old.option_groups)
        is distinct from public.menu_item_option_price_signature(new.option_groups)) then
    perform public.raise_tech_card_cost_overruns(array[new.id]);
  end if;
  return new;
end;
$$;

drop trigger if exists menu_items_guard_price_above_tech_card_cost on public.menu_items;
create trigger menu_items_guard_price_above_tech_card_cost
after update of price, option_groups on public.menu_items
for each row execute function public.guard_menu_item_price_above_tech_card_cost();

revoke all on function public.tech_card_selling_price(text, text) from public, anon, authenticated;
revoke all on function public.tech_card_cost_overruns(text[]) from public, anon, authenticated;
revoke all on function public.raise_tech_card_cost_overruns(text[]) from public, anon, authenticated;
revoke all on function public.sync_menu_item_tech_card_real_costs_for(text[]) from public, anon, authenticated;
revoke all on function public.guard_menu_item_price_above_tech_card_cost() from public, anon, authenticated;
revoke all on function public.menu_item_option_price_signature(jsonb) from public, anon, authenticated;

commit;
