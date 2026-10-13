-- Which Tech Cards use a catalog ingredient, so archiving it can warn first and
-- link to each recipe. Recipe rows match the catalog by name (227/228). Returns
-- only menu item and variant ids: no quantities, prices, or preparation steps,
-- so Ingredients staff without Tech Card access never read protected recipes.
begin;

create or replace function public.get_bazaar_ingredient_tech_card_usage(p_product_key text)
returns table (menu_item_id text, variant_option_id text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.current_staff_can_access('ingredients') is not true
    and public.current_staff_can_access('tech_cards') is not true then
    raise exception 'Ingredients access required' using errcode = '42501';
  end if;

  return query
  select distinct ingredient.menu_item_id, coalesce(ingredient.variant_option_id, '')::text
  from public.bazaar_product_catalog catalog
  join public.menu_item_tech_card_ingredients ingredient
    on lower(btrim(ingredient.name)) = lower(btrim(catalog.product_name))
  where catalog.product_key = p_product_key
  order by 1, 2;
end;
$$;

revoke all on function public.get_bazaar_ingredient_tech_card_usage(text) from public, anon;
grant execute on function public.get_bazaar_ingredient_tech_card_usage(text) to authenticated;

commit;
