-- Ingredient names always start with a capital letter ("anchous" -> "Anchous").
-- Only the catalog name changes: product_key is lower-cased, so keys stay stable,
-- and purchase lines keep their original name snapshots. The existing catalog
-- rename trigger carries the new spelling to Tech Card recipe rows.
begin;

create or replace function public.capitalize_bazaar_ingredient_name(value text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when btrim(coalesce(value, '')) = '' then btrim(coalesce(value, ''))
    else upper(left(btrim(value), 1)) || substr(btrim(value), 2)
  end;
$$;

create or replace function public.capitalize_bazaar_catalog_product_name()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.product_name := public.capitalize_bazaar_ingredient_name(new.product_name);
  return new;
end;
$$;

drop trigger if exists bazaar_catalog_capitalize_product_name on public.bazaar_product_catalog;
create trigger bazaar_catalog_capitalize_product_name
before insert or update of product_name on public.bazaar_product_catalog
for each row execute function public.capitalize_bazaar_catalog_product_name();

revoke all on function public.capitalize_bazaar_catalog_product_name() from public, anon, authenticated;

-- Backfill every existing ingredient, active or archived.
update public.bazaar_product_catalog
set product_name = public.capitalize_bazaar_ingredient_name(product_name)
where product_name is distinct from public.capitalize_bazaar_ingredient_name(product_name);

commit;
