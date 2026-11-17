-- Dish sales sale rows carry table, waiter and order type for the selected-dish list.
-- Replaces get_reports_dish_sales from 281 (which 281 already applied) with the same totals.
begin;

create or replace function public.get_reports_dish_sales(
  p_from date,
  p_to date,
  p_table_id text default null,
  p_waiter_name text default null,
  p_dish_key text default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with items as (
    select i.*,
      case
        when nullif(i.menu_item_id, '') is not null then 'menu:' || i.menu_item_id
        when nullif(trim(coalesce(i.item_name, '')), '') is not null
          then 'name:' || lower(regexp_replace(trim(i.item_name), '\s+', ' ', 'g'))
      end as dish_key,
      coalesce(nullif(trim(i.item_name), ''), 'Unknown') as dish_name
    from public.reports_session_items(p_from, p_to, p_table_id, p_waiter_name) i
    where i.is_paid
  ),
  direct as (
    select dish_key, dish_name, first_order_id, session_at, business_date,
      extract(hour from (session_at at time zone 'Asia/Tashkent'))::integer as hour_of_day,
      menu_item_id, category_id, dish_quantity as qty, unit_price::numeric * dish_quantity as revenue,
      dish_key as source_key, dish_name as source_name, false as included,
      table_name, waiter_name, order_type
    from items
    where dish_key is not null
  ),
  components as (
    select i.first_order_id, i.session_at, i.business_date,
      extract(hour from (i.session_at at time zone 'Asia/Tashkent'))::integer as hour_of_day,
      i.dish_quantity, i.dish_key as source_key, i.dish_name as source_name,
      c.value as comp, i.table_name, i.waiter_name, i.order_type
    from items i
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(i.tech_card_component_snapshot) = 'array' then i.tech_card_component_snapshot else '[]'::jsonb end
    ) as c(value)
    where i.dish_key is not null
  ),
  included_raw as (
    select c.first_order_id, c.session_at, c.business_date, c.hour_of_day, c.source_key, c.source_name,
      c.table_name, c.waiter_name, c.order_type,
      case
        when nullif(c.comp->>'menu_item_id', '') is not null then 'menu:' || (c.comp->>'menu_item_id')
        when nullif(c.comp->>'menuItemId', '') is not null then 'menu:' || (c.comp->>'menuItemId')
        when nullif(c.comp->>'product_id', '') is not null then 'menu:' || (c.comp->>'product_id')
        when nullif(c.comp->>'productId', '') is not null then 'menu:' || (c.comp->>'productId')
        when nullif(trim(coalesce(c.comp->>'name', '')), '') is not null
          then 'name:' || lower(regexp_replace(trim(c.comp->>'name'), '\s+', ' ', 'g'))
      end as dish_key,
      coalesce(nullif(trim(c.comp->>'name'), ''), 'Unknown') as dish_name,
      c.dish_quantity * (c.comp->>'quantity')::numeric as qty
    from components c
    where jsonb_typeof(c.comp) = 'object'
      and (c.comp->>'quantity') ~ '^\s*[0-9]+(\.[0-9]+)?\s*$'
      and (c.comp->>'quantity')::numeric > 0
  ),
  included as (
    select dish_key, dish_name, first_order_id, session_at, business_date, hour_of_day,
      null::text as menu_item_id, null::text as category_id, qty, 0::numeric as revenue,
      source_key, source_name, true as included,
      table_name, waiter_name, order_type
    from included_raw
    where dish_key is not null
  ),
  sales as (
    select * from direct
    union all
    select * from included
  ),
  dish_totals as (
    select dish_key,
      min(dish_name) as name,
      (array_agg(menu_item_id) filter (where menu_item_id is not null))[1] as menu_item_id,
      (array_agg(category_id order by session_at desc) filter (where category_id is not null))[1] as category_id,
      coalesce(sum(qty) filter (where not included), 0) as direct_quantity,
      coalesce(sum(revenue) filter (where not included), 0) as direct_revenue,
      count(distinct first_order_id) filter (where not included) as direct_orders,
      count(*) filter (where not included) as sale_lines,
      coalesce(sum(qty) filter (where included), 0) as included_quantity,
      min(session_at) filter (where not included) as first_sold_at,
      max(session_at) filter (where not included) as last_sold_at
    from sales
    group by dish_key
  ),
  selected as (
    select * from sales where p_dish_key is not null and dish_key = p_dish_key
  ),
  selected_sources as (
    select source_key as key, min(source_name) as name,
      sum(qty) as quantity, sum(revenue) as revenue,
      count(distinct first_order_id) as orders, count(*) as sale_lines,
      bool_or(included) as included_in_set
    from selected group by source_key
  ),
  selected_daily as (
    select business_date::text as date, sum(qty) as quantity, sum(revenue) as revenue,
      count(distinct first_order_id) as orders, count(*) as sale_lines
    from selected group by business_date
  ),
  selected_hourly as (
    select hour_of_day as hour, sum(qty) as quantity, sum(revenue) as revenue,
      count(distinct first_order_id) as orders, count(*) as sale_lines
    from selected group by hour_of_day
  )
  select jsonb_build_object(
    'dishes', (select coalesce(jsonb_agg(d order by d.direct_quantity asc, d.direct_revenue asc, d.name asc), '[]'::jsonb) from dish_totals d),
    'selected', case when p_dish_key is null then null else jsonb_build_object(
      'key', p_dish_key,
      'quantity', coalesce((select sum(qty) from selected), 0),
      'direct_quantity', coalesce((select sum(qty) from selected where not included), 0),
      'included_quantity', coalesce((select sum(qty) from selected where included), 0),
      'revenue', coalesce((select sum(revenue) from selected), 0),
      'orders', coalesce((select count(distinct first_order_id) from selected), 0),
      'sale_lines', coalesce((select count(*) from selected), 0),
      'first_sold_at', (select min(session_at) from selected),
      'last_sold_at', (select max(session_at) from selected),
      'daily', (select coalesce(jsonb_agg(x order by x.date), '[]'::jsonb) from selected_daily x),
      'hourly', (select coalesce(jsonb_agg(x order by x.hour), '[]'::jsonb) from selected_hourly x),
      'sources', (select coalesce(jsonb_agg(x order by x.quantity desc, x.key), '[]'::jsonb) from selected_sources x),
      'sales', (select coalesce(jsonb_agg(x order by x.order_date desc), '[]'::jsonb) from (
        select dish_name, first_order_id as order_id, session_at as order_date, business_date::text as date,
          hour_of_day as hour, qty as quantity, revenue, source_key, source_name, included as included_in_set,
          table_name, waiter_name, public.reports_infer_order_type(order_type, table_name) as order_type
        from selected order by session_at desc limit 300
      ) x)
    ) end
  )
$$;

notify pgrst, 'reload schema';
commit;
