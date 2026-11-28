-- Cost snapshots for profit views, behind a permission check.
--
-- order_items.cost_price used to reach every staff browser through
-- `order_items(*)` in POS hydration. The app now selects explicit columns
-- without it and the Dashboard asks this function for the costs of the paid
-- orders it shows. Migration 292 then revokes the column from `authenticated`.
-- Same feature set that may read menu_item_costs.

begin;
set local lock_timeout = '5s';

create or replace function public.get_order_item_costs(p_order_ids text[])
returns table (id uuid, cost_price integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
    or not coalesce(public.current_staff_can_access_any(array['dashboard', 'menu', 'expenses', 'tech_cards', 'reports', 'financial_analysis']), false) then
    raise exception 'Cost access is required' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_order_ids), 0) > 1000 then
    raise exception 'Ask for at most 1000 orders at a time' using errcode = '22023';
  end if;

  return query
    select i.id, i.cost_price
      from public.order_items as i
     where i.order_id = any(coalesce(p_order_ids, array[]::text[]));
end;
$$;

revoke all on function public.get_order_item_costs(text[]) from public, anon, authenticated;
grant execute on function public.get_order_item_costs(text[]) to authenticated;

notify pgrst, 'reload schema';

commit;
