-- Tech Card ingredient prices are per the row's own unit. A catalog price per
-- kg/l is converted for g/ml rows (and back), so 7 500 UZS/kg is 7.5 UZS/g.
-- Prices keep four decimals instead of rounding to whole UZS per gram.
-- Incompatible units (kg catalog, piece row) are never overwritten.
-- Paid order cost_price and ingredient snapshots are untouched.
begin;

alter table public.menu_item_tech_card_ingredients
  alter column unit_price_uzs type numeric(14,4) using unit_price_uzs::numeric;

create or replace function public.tech_card_unit_price_from_bazaar(
  catalog_unit text, catalog_price numeric, row_unit text
) returns numeric
language sql
immutable
set search_path = public
as $$
  with units(unit, dimension, base) as (
    values ('g', 'mass', 1::numeric), ('kg', 'mass', 1000), ('ml', 'volume', 1), ('l', 'volume', 1000), ('piece', 'piece', 1)
  )
  select round(catalog_price * target.base / origin.base, 4)
  from units origin
  join units target on target.unit = row_unit and target.dimension = origin.dimension
  where origin.unit = case
    when lower(btrim(catalog_unit)) in ('g', 'kg', 'ml', 'l') then lower(btrim(catalog_unit))
    else 'piece'
  end;
$$;

-- Saved prices may now carry decimals.
do $migration$
declare
  definition text := pg_get_functiondef('public.save_menu_item_tech_card(jsonb)'::regprocedure);
  patched text;
begin
  patched := replace(definition, 'nullif(ingredient ->> ''unit_price_uzs'', '''')::bigint', 'nullif(ingredient ->> ''unit_price_uzs'', '''')::numeric');
  patched := replace(patched, '(ingredient ->> ''unit_price_uzs'')::bigint', '(ingredient ->> ''unit_price_uzs'')::numeric');
  if position('''unit_price_uzs'')::bigint' in patched) > 0 or position('''unit_price_uzs'')::numeric' in patched) = 0 then
    raise exception 'Unexpected save_menu_item_tech_card definition';
  end if;
  if patched <> definition then
    execute patched;
  end if;
end;
$migration$;

create or replace function public.sync_tech_card_ingredients_from_bazaar_catalog()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_name text := lower(btrim(old.product_name));
  new_name text := lower(btrim(new.product_name));
begin
  if (old.normal_unit_price, old.product_name, old.unit)
    is not distinct from (new.normal_unit_price, new.product_name, new.unit) then
    return new;
  end if;
  -- An ambiguous name cannot identify which catalog price a recipe uses.
  if exists (
    select 1 from public.bazaar_product_catalog other
    where other.product_key <> new.product_key
      and lower(btrim(other.product_name)) in (old_name, new_name)
  ) then
    return new;
  end if;

  update public.menu_item_tech_card_ingredients ingredient
  set unit_price_uzs = coalesce(
        public.tech_card_unit_price_from_bazaar(new.unit, new.normal_unit_price, ingredient.unit),
        ingredient.unit_price_uzs
      ),
      name = btrim(new.product_name),
      updated_at = now()
  where lower(btrim(ingredient.name)) = old_name
    and (ingredient.unit_price_uzs, ingredient.name) is distinct from (
      coalesce(
        public.tech_card_unit_price_from_bazaar(new.unit, new.normal_unit_price, ingredient.unit),
        ingredient.unit_price_uzs
      ),
      btrim(new.product_name)
    );

  return new;
end;
$$;

drop trigger if exists bazaar_catalog_sync_tech_card_ingredients on public.bazaar_product_catalog;
create trigger bazaar_catalog_sync_tech_card_ingredients
after update of normal_unit_price, product_name, unit on public.bazaar_product_catalog
for each row execute function public.sync_tech_card_ingredients_from_bazaar_catalog();

revoke all on function public.sync_tech_card_ingredients_from_bazaar_catalog() from public, anon, authenticated;

-- Correct rows whose unit differs from the catalog unit (227 copied the raw price).
update public.menu_item_tech_card_ingredients ingredient
set unit_price_uzs = public.tech_card_unit_price_from_bazaar(catalog.unit, catalog.normal_unit_price, ingredient.unit),
    updated_at = now()
from public.bazaar_product_catalog catalog
where lower(btrim(catalog.product_name)) = lower(btrim(ingredient.name))
  and ingredient.unit_price_uzs
    <> public.tech_card_unit_price_from_bazaar(catalog.unit, catalog.normal_unit_price, ingredient.unit)
  and not exists (
    select 1 from public.bazaar_product_catalog other
    where other.product_key <> catalog.product_key
      and lower(btrim(other.product_name)) = lower(btrim(catalog.product_name))
  );

commit;
