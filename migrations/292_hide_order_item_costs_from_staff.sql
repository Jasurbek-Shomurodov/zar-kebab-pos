-- Keep order_items.cost_price out of staff browsers.
--
-- Apply after 291 and after the frontend that selects explicit order_items
-- columns is live: `select=*` on order_items fails once this runs.
-- RLS still decides which rows a user sees; this decides which columns.
-- SECURITY DEFINER functions (payment, reports, accounting, cost snapshot
-- triggers) and the service role keep full access.

begin;
set local lock_timeout = '5s';

revoke select on table public.order_items from anon, authenticated;

grant select (
  id, order_id, menu_item_id, name, price, quantity, notes, status, created_at,
  order_type, item_type, is_counter_item, kitchen_round_id, submitted_at,
  base_price, unit_price, price_mode, selected_options, sale_unit,
  category_id_snapshot, category_snapshot_captured, tech_card_component_snapshot
) on public.order_items to authenticated;

notify pgrst, 'reload schema';

commit;
