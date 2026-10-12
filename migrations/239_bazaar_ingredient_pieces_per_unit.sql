-- A packaged ingredient may say how many pieces one purchase unit holds:
-- a 50 000 UZS box of 30 eggs costs 1 666.6667 UZS per egg in a Tech Card
-- piece row. Purchases still count boxes; only recipe piece prices change.
-- Paid order cost_price and ingredient snapshots are untouched.
-- Requires 228 (tech_card_unit_price_from_bazaar(text, numeric, text)).
begin;

do $requires$
begin
  if to_regprocedure('public.tech_card_unit_price_from_bazaar(text,numeric,text)') is null then
    raise exception 'Apply migrations/228_tech_card_ingredient_unit_conversion.sql before 239';
  end if;
end;
$requires$;

alter table public.bazaar_product_catalog
  add column if not exists pieces_per_unit integer;

alter table public.bazaar_product_catalog
  drop constraint if exists bazaar_product_catalog_pieces_per_unit_check;
alter table public.bazaar_product_catalog
  add constraint bazaar_product_catalog_pieces_per_unit_check check (
    pieces_per_unit is null
    or (pieces_per_unit between 1 and 100000 and unit in ('pack', 'box', 'bag', 'bottle', 'bunch'))
  );

-- Measured units (kg, l, pcs...) never carry a piece count.
create or replace function public.bazaar_ingredient_pieces_per_unit(ingredient_unit text, raw_value text)
returns integer
language plpgsql
immutable
set search_path = public
as $$
declare
  pieces integer;
begin
  if lower(btrim(coalesce(ingredient_unit, ''))) not in ('pack', 'box', 'bag', 'bottle', 'bunch')
    or btrim(coalesce(raw_value, '')) = '' then
    return null;
  end if;
  if btrim(raw_value) !~ '^[0-9]+$' then
    raise exception 'Pieces per unit must be a whole number';
  end if;
  pieces := btrim(raw_value)::integer;
  if pieces < 1 or pieces > 100000 then
    raise exception 'Pieces per unit is out of range';
  end if;
  return pieces;
end;
$$;

-- Patch the deployed RPC in place so its other validation stays as deployed.
do $migration$
declare
  definition text := pg_get_functiondef('public.save_bazaar_ingredient(jsonb)'::regprocedure);
  patched text;
begin
  if position('pieces_per_unit' in definition) > 0 then
    return;
  end if;
  patched := replace(
    definition,
    'product_key, product_name, category, unit, normal_unit_price,',
    'product_key, product_name, category, unit, normal_unit_price, pieces_per_unit,'
  );
  patched := replace(
    patched,
    'ingredient_price::integer, true,',
    'ingredient_price::integer, public.bazaar_ingredient_pieces_per_unit(ingredient_unit, payload ->> ''pieces_per_unit''), true,'
  );
  patched := replace(
    patched,
    'normal_unit_price = excluded.normal_unit_price,',
    'normal_unit_price = excluded.normal_unit_price,
      pieces_per_unit = excluded.pieces_per_unit,'
  );
  if (length(patched) - length(replace(patched, 'pieces_per_unit', ''))) / length('pieces_per_unit') <> 5 then
    raise exception 'Unexpected save_bazaar_ingredient definition';
  end if;
  execute patched;
end;
$migration$;

-- A package with a piece count prices a piece row per piece; otherwise 228 rules apply.
create or replace function public.tech_card_unit_price_from_bazaar(
  catalog_unit text, catalog_price numeric, row_unit text, catalog_pieces_per_unit integer
) returns numeric
language sql
immutable
set search_path = public
as $$
  select case
    when coalesce(catalog_pieces_per_unit, 0) > 0
      and lower(btrim(catalog_unit)) in ('pack', 'box', 'bag', 'bottle', 'bunch')
      then case when row_unit = 'piece' then round(catalog_price / catalog_pieces_per_unit, 4) end
    else public.tech_card_unit_price_from_bazaar(catalog_unit, catalog_price, row_unit)
  end;
$$;

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
  if (old.normal_unit_price, old.product_name, old.unit, old.pieces_per_unit)
    is not distinct from (new.normal_unit_price, new.product_name, new.unit, new.pieces_per_unit) then
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
        public.tech_card_unit_price_from_bazaar(new.unit, new.normal_unit_price, ingredient.unit, new.pieces_per_unit),
        ingredient.unit_price_uzs
      ),
      name = btrim(new.product_name),
      updated_at = now()
  where lower(btrim(ingredient.name)) = old_name
    and (ingredient.unit_price_uzs, ingredient.name) is distinct from (
      coalesce(
        public.tech_card_unit_price_from_bazaar(new.unit, new.normal_unit_price, ingredient.unit, new.pieces_per_unit),
        ingredient.unit_price_uzs
      ),
      btrim(new.product_name)
    );

  return new;
end;
$$;

drop trigger if exists bazaar_catalog_sync_tech_card_ingredients on public.bazaar_product_catalog;
create trigger bazaar_catalog_sync_tech_card_ingredients
after update of normal_unit_price, product_name, unit, pieces_per_unit on public.bazaar_product_catalog
for each row execute function public.sync_tech_card_ingredients_from_bazaar_catalog();

revoke all on function public.sync_tech_card_ingredients_from_bazaar_catalog() from public, anon, authenticated;

commit;
