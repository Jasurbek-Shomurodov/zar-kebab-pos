-- Tech Card ingredient prices follow the Daily Bazaar catalog's normal price.
-- Rows are linked to the catalog by ingredient name (the picker copies the
-- catalog name and price). Updating a row marks Tech Card costs dirty, so the
-- existing cost sync (183) refreshes protected current menu costs.
-- Paid order cost_price and ingredient snapshots are untouched.
begin;

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
  if (old.normal_unit_price, old.product_name) is not distinct from (new.normal_unit_price, new.product_name) then
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
  set unit_price_uzs = new.normal_unit_price,
      name = btrim(new.product_name),
      updated_at = now()
  where lower(btrim(ingredient.name)) = old_name
    and (ingredient.unit_price_uzs, ingredient.name)
      is distinct from (new.normal_unit_price::bigint, btrim(new.product_name));

  return new;
end;
$$;

drop trigger if exists bazaar_catalog_sync_tech_card_ingredients on public.bazaar_product_catalog;
create trigger bazaar_catalog_sync_tech_card_ingredients
after update of normal_unit_price, product_name on public.bazaar_product_catalog
for each row execute function public.sync_tech_card_ingredients_from_bazaar_catalog();

revoke all on function public.sync_tech_card_ingredients_from_bazaar_catalog() from public, anon, authenticated;

-- Bring recipes saved before this migration up to today's catalog prices.
update public.menu_item_tech_card_ingredients ingredient
set unit_price_uzs = catalog.normal_unit_price,
    updated_at = now()
from public.bazaar_product_catalog catalog
where lower(btrim(catalog.product_name)) = lower(btrim(ingredient.name))
  and ingredient.unit_price_uzs <> catalog.normal_unit_price
  and not exists (
    select 1 from public.bazaar_product_catalog other
    where other.product_key <> catalog.product_key
      and lower(btrim(other.product_name)) = lower(btrim(catalog.product_name))
  );

commit;
