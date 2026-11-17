-- Reports, server side: one session-level money core.
--
-- Mirrors, in SQL, what the Reports page used to do in the browser:
--   groupOrdersBySession (src/lib/analytics.js) merges orders on the same table
--   in the same minute (off-premise orders stay single), then
--   getOrderPaymentSummary / getOrderRevenueTotal / getOrderLoyaltyIncomeTotal
--   compute revenue, service fee and loyalty income for each merged session.
--
-- Filters (date, table, waiter) run in SQL. Dates use the business day in
-- Asia/Tashkent (paid_at, else created_at), matching matchesRange(). Table and
-- waiter filters apply to the merged session, as allDateFiltered did.
--
-- Historical rows are read only; nothing here writes orders or items.

begin;

-- Order-type normalisation, same rules as normalizeOrderType / inferOrderType.
create or replace function public.reports_infer_order_type(p_order_type text, p_table_name text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_explicit text := lower(coalesce(p_order_type, ''));
  v_table text := lower(coalesce(p_table_name, ''));
begin
  if v_explicit <> '' then
    if strpos(v_explicit, 'game_club') > 0 or strpos(v_explicit, 'game club') > 0 or strpos(v_explicit, 'игровой клуб') > 0 then return 'game_club'; end if;
    if strpos(v_explicit, 'delivery') > 0 or strpos(v_explicit, 'deliver') > 0 or strpos(v_explicit, 'достав') > 0 or strpos(v_explicit, 'yetkaz') > 0 then return 'delivery'; end if;
    if strpos(v_explicit, 'take') > 0 or strpos(v_explicit, 'away') > 0 or strpos(v_explicit, 'с собой') > 0 or strpos(v_explicit, 'olib') > 0 then return 'take_away'; end if;
    return 'dine_in';
  end if;
  if strpos(v_table, 'game club') > 0 or strpos(v_table, 'игровой клуб') > 0 then return 'game_club'; end if;
  if strpos(v_table, 'delivery') > 0 or strpos(v_table, 'достав') > 0 then return 'delivery'; end if;
  if strpos(v_table, 'take') > 0 or strpos(v_table, 'away') > 0 then return 'take_away'; end if;
  return 'dine_in';
end;
$$;

-- Escapes LIKE wildcards so search text is matched literally.
create or replace function public.reports_escape_like(p_text text)
returns text
language sql
immutable
set search_path = public
as $$
  select replace(replace(replace(coalesce(p_text, ''), '\\', '\\\\'), '%', '\\%'), '_', '\\_')
$$;

-- Access gate: raises for staff without the reports feature. Evaluated once per call.
create or replace function public.reports_require_access()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.current_staff_can_access('reports') then
    raise exception 'Reports access is required' using errcode = '42501';
  end if;
  return true;
end;
$$;

revoke all on function public.reports_require_access() from public, anon;
grant execute on function public.reports_require_access() to authenticated;

-- Session rows for a business-date range, merged the way the browser merged them.
-- Returns one row per session with the money fields the Reports tabs need.
create or replace function public.reports_session_money(
  p_from date,
  p_to date,
  p_table_id text default null,
  p_waiter_name text default null
)
returns table (
  session_key text,
  first_order_id text,
  order_ids text[],
  order_count integer,
  table_id text,
  table_name text,
  waiter_name text,
  order_type text,
  price_mode text,
  payment_method text,
  business_date date,
  paid_at timestamptz,
  created_at timestamptz,
  is_paid boolean,
  is_off_premise boolean,
  revenue_total bigint,
  total_sum bigint,
  subtotal numeric,
  menu_subtotal numeric,
  counter_subtotal numeric,
  service_rate_pct numeric,
  service_fee bigint,
  loyalty_income bigint,
  item_rows integer
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select p_from as d_from, p_to as d_to
  ),
  -- Orders whose business date (paid_at, else created_at) is in range. Two index-friendly
  -- branches: paid orders by paid_at, unpaid by created_at.
  scoped as (
    select o.*
    from public.orders o, bounds b
    where o.paid_at is not null
      and (o.paid_at at time zone 'Asia/Tashkent')::date between b.d_from and b.d_to
    union all
    select o.*
    from public.orders o, bounds b
    where o.paid_at is null
      and (o.created_at at time zone 'Asia/Tashkent')::date between b.d_from and b.d_to
  ),
  ranked as (
    select s.*,
      public.reports_infer_order_type(s.order_type, s.table_name) as resolved_type,
      (coalesce(s.paid_at, s.created_at) at time zone 'Asia/Tashkent')::date as business_date,
      case
        when s.paid_at is not null then to_char(date_trunc('minute', s.paid_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI')
        else to_char(s.created_at at time zone 'UTC', 'YYYY-MM-DD')
      end as anchor
    from scoped s
  ),
  keyed as (
    select r.*,
      (r.resolved_type <> 'dine_in') as is_off_premise,
      case
        when r.resolved_type <> 'dine_in' or nullif(r.table_id, '') is null then 'order::' || r.id
        else r.table_id || '::' || r.anchor
      end as session_key,
      row_number() over (
        partition by case
          when r.resolved_type <> 'dine_in' or nullif(r.table_id, '') is null then 'order::' || r.id
          else r.table_id || '::' || r.anchor
        end
        order by coalesce(r.paid_at, r.created_at) desc, r.id collate "C" desc
      ) as member_rank
    from ranked r
  ),
  -- Item facts per order, using the same rules as getOrderPaymentSummary:
  -- cancelled lines are not billable, counter lines are kept out of the service base,
  -- unit price = unit_price ?? price, quantity 0/null counts as 1.
  item_facts as (
    select oi.order_id,
      count(*)::integer as item_rows,
      coalesce(sum(case
        when lower(coalesce(oi.status, '')) = 'cancelled' then 0
        when coalesce(oi.is_counter_item, false)
          or lower(coalesce(oi.item_type, '')) in ('counter', 'quick', 'cashier_quick') then 0
        else greatest(0, round(coalesce(oi.unit_price, oi.price, 0)))
          * coalesce(nullif(oi.quantity, 0), 1)
      end), 0) as menu_sub,
      coalesce(sum(case
        when lower(coalesce(oi.status, '')) = 'cancelled' then 0
        when coalesce(oi.is_counter_item, false)
          or lower(coalesce(oi.item_type, '')) in ('counter', 'quick', 'cashier_quick')
          then greatest(0, round(coalesce(oi.unit_price, oi.price, 0))) * coalesce(nullif(oi.quantity, 0), 1)
        else 0
      end), 0) as counter_sub
    from public.order_items oi
    where oi.order_id in (select k.id from keyed k)
    group by oi.order_id
  ),
  -- Per-session aggregation. Field rules mirror groupOrdersBySession:
  -- first member (most recent) supplies identity fields; money fields are summed.
  sessions as (
    select
      k.session_key,
      (array_agg(k.id order by k.member_rank))[1] as first_order_id,
      array_agg(k.id order by k.member_rank) as order_ids,
      count(*)::integer as order_count,
      (array_agg(k.table_id order by k.member_rank))[1] as table_id,
      (array_agg(k.table_name order by k.member_rank))[1] as table_name,
      (array_agg(k.waiter_name order by k.member_rank))[1] as waiter_name,
      (array_agg(k.order_type order by k.member_rank))[1] as order_type,
      (array_agg(k.price_mode order by k.member_rank))[1] as price_mode,
      (array_agg(k.payment_method order by k.member_rank) filter (where k.payment_method is not null))[1] as payment_method,
      (array_agg(k.status order by k.member_rank))[1] as status,
      (array_agg(k.payment_status order by k.member_rank))[1] as payment_status,
      (array_agg(k.resolved_type order by k.member_rank))[1] <> 'dine_in' as is_off_premise_first,
      bool_or(k.is_off_premise) as is_off_premise,
      (coalesce(max(k.paid_at), min(k.created_at)) at time zone 'Asia/Tashkent')::date as business_date,
      max(k.paid_at) as paid_at,
      min(k.created_at) as created_at,
      sum(coalesce(k.total, 0))::bigint as total_sum,
      sum(coalesce(k.subtotal, 0))::numeric as order_subtotal_sum,
      sum(coalesce(k.service_fee, 0))::bigint as service_fee_sum,
      sum(coalesce(k.loyalty_discount_amount, 0))::bigint as loyalty_discount_sum,
      bool_or(k.loyalty_used_amount is not null or k.loyalty_redeem_amount is not null) as has_wallet,
      sum(coalesce(k.loyalty_used_amount, 0))::bigint as loyalty_used_sum,
      -- service rate: first member's value; when it is null, Number(null) = 0 is taken from the next member
      case
        when count(*) = 1 then (array_agg(k.service_rate_pct order by k.member_rank))[1]
        else coalesce(
          (array_agg(k.service_rate_pct order by k.member_rank))[1],
          (array_agg(k.service_rate_pct order by k.member_rank))[2],
          0
        )
      end as service_rate_raw,
      -- loyalty discount pct: first non-zero value, else 0
      coalesce(
        (array_agg(coalesce(k.loyalty_discount_pct, 0) order by k.member_rank) filter (where coalesce(k.loyalty_discount_pct, 0) <> 0))[1],
        0
      ) as loyalty_discount_pct,
      sum(coalesce(f.item_rows, 0))::integer as item_rows,
      sum(coalesce(f.menu_sub, 0))::numeric as menu_sub,
      sum(coalesce(f.counter_sub, 0))::numeric as counter_sub
    from keyed k
    left join item_facts f on f.order_id = k.id
    group by k.session_key
  ),
  -- Session money, mirroring getOrderPaymentSummary on the merged session.
  money as (
    select s.*,
      (s.status is distinct from 'cancelled'
        and s.payment_status is distinct from 'cancelled'
        and (s.payment_status = 'paid' or s.status in ('paid', 'completed') or s.paid_at is not null)
      ) as is_paid_session,
      (s.item_rows > 0) as has_items,
      case when s.item_rows > 0 then s.menu_sub + s.counter_sub else s.order_subtotal_sum end as subtotal_v,
      case when s.item_rows > 0 then s.menu_sub else s.order_subtotal_sum end as menu_v,
      case when s.item_rows > 0 then s.counter_sub else 0 end as counter_v
    from sessions s
  ),
  priced as (
    select m.*,
      -- service rate: off-premise is 0; null falls back to 20; clamped to 0..100
      case
        when m.is_off_premise_first then 0::numeric
        when m.service_rate_raw is null then 20::numeric
        else least(100, greatest(0, m.service_rate_raw))
      end as rate
    from money m
  ),
  charged as (
    select p.*,
      round((case when p.rate > 0 then p.menu_v else 0 end) * p.rate / 100) as service_fee_v
    from priced p
  ),
  loyalty as (
    select c.*,
      -- legacy discount path: no wallet fields, paid, pct > 0
      case when not c.has_wallet and c.is_paid_session and c.loyalty_discount_pct > 0
        then round((c.menu_v + c.service_fee_v) * c.loyalty_discount_pct / 100)
        else 0
      end as legacy_discount
    from charged c
  ),
  final as (
    select l.*,
      case
        -- no items and no subtotal but a total: the summary returns the stored loyalty value uncapped
        when not l.has_items and l.subtotal_v <= 0 and l.total_sum > 0 then
          greatest(0, case when l.has_wallet then round(l.loyalty_used_sum)
                           else l.loyalty_discount_sum end)
        else
          least(
            case when l.has_wallet then greatest(0, round(l.loyalty_used_sum))
                 when l.legacy_discount > 0 then l.legacy_discount
                 else greatest(0, l.loyalty_discount_sum)
            end,
            l.subtotal_v + l.service_fee_v
          )
      end as loyalty_v
    from loyalty l
  )
  select
    f.session_key,
    f.first_order_id,
    f.order_ids,
    f.order_count,
    f.table_id,
    f.table_name,
    f.waiter_name,
    f.order_type,
    f.price_mode,
    f.payment_method,
    f.business_date,
    f.paid_at,
    f.created_at,
    f.is_paid_session as is_paid,
    f.is_off_premise_first as is_off_premise,
    -- getOrderRevenueTotal: stored total for paid sessions, else the summary total
    case when f.is_paid_session then greatest(0, f.total_sum) else null end as revenue_total,
    f.total_sum,
    f.subtotal_v as subtotal,
    f.menu_v as menu_subtotal,
    f.counter_v as counter_subtotal,
    f.rate as service_rate_pct,
    f.service_fee_v::bigint as service_fee,
    greatest(0, round(f.loyalty_v))::bigint as loyalty_income,
    f.item_rows
  from final f
  where (select public.reports_require_access())
    and (p_table_id is null or f.table_id = p_table_id)
    and (p_waiter_name is null or f.waiter_name = p_waiter_name)
    and f.business_date between p_from and p_to
$$;

-- Payment method normalisation, same rules as normalizePaymentMethod.
create or replace function public.reports_normalize_payment_method(p_method text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v text := lower(trim(coalesce(p_method, '')));
begin
  if v in ('qr', 'qr_code', 'qr-code', 'qrcode') then return 'terminal'; end if;
  if v in ('loyalty', 'loyalty-card', 'loyalty_card') then return 'loyalty_card'; end if;
  if v in ('cash', 'card', 'terminal', 'other', 'mixed') then return v; end if;
  if v = '' then return 'unknown'; end if;
  return v;
end;
$$;

-- Per-session payment breakdown: getOrderPayments + getOrderPaymentBreakdown.
-- Saved split rows win; a paid session without rows uses its payment_method and total;
-- loyalty wallet income is added as loyalty_card when no loyalty row exists.
create or replace function public.reports_session_payments(
  p_from date,
  p_to date,
  p_table_id text default null,
  p_waiter_name text default null
)
returns table (
  first_order_id text,
  business_date date,
  table_id text,
  waiter_name text,
  method text,
  amount bigint,
  row_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  with sess as (
    select * from public.reports_session_money(p_from, p_to, p_table_id, p_waiter_name)
  ),
  raw_rows as (
    select s.first_order_id, s.business_date, s.table_id, s.waiter_name,
      public.reports_normalize_payment_method(p.method) as method,
      greatest(0, round(coalesce(p.amount, 0)))::bigint as amount
    from sess s
    join public.order_payments p on p.order_id = any(s.order_ids)
    where greatest(0, round(coalesce(p.amount, 0))) > 0
  ),
  fallback as (
    select s.first_order_id, s.business_date, s.table_id, s.waiter_name,
      public.reports_normalize_payment_method(s.payment_method) as method,
      s.revenue_total::bigint as amount
    from sess s
    where s.is_paid and coalesce(s.revenue_total, 0) > 0
      and not exists (select 1 from raw_rows r where r.first_order_id = s.first_order_id)
  ),
  summed as (
    select first_order_id, business_date, table_id, waiter_name, method, sum(amount)::bigint as amount, sum(row_count)::integer as row_count
    from (
      select first_order_id, business_date, table_id, waiter_name, method, amount, 1 as row_count from raw_rows
      union all
      select first_order_id, business_date, table_id, waiter_name, method, amount, 1 as row_count from fallback
    ) x
    group by first_order_id, business_date, table_id, waiter_name, method
  ),
  wallet as (
    select s.first_order_id, s.business_date, s.table_id, s.waiter_name, 'loyalty_card'::text as method,
      s.loyalty_income::bigint as amount, 1 as row_count
    from sess s
    where s.is_paid and s.loyalty_income > 0
      and not exists (select 1 from summed m where m.first_order_id = s.first_order_id and m.method = 'loyalty_card')
  )
  select * from summed
  union all
  select * from wallet
$$;

revoke all on function public.reports_session_payments(date, date, text, text) from public, anon;
grant execute on function public.reports_session_payments(date, date, text, text) to authenticated;

-- Item facts for every billable session: same rules as getSoldOrderItems
-- (cancelled excluded), quantity 0/null = 1, unit price = unit_price ?? price,
-- counter lines flagged. Category comes from the sold-time snapshot only.
-- dish_quantity follows positiveQuantity (non-positive counts as 1) for dish analysis.
create or replace function public.reports_session_items(
  p_from date,
  p_to date,
  p_table_id text default null,
  p_waiter_name text default null
)
returns table (
  first_order_id text,
  session_at timestamptz,
  business_date date,
  table_id text,
  waiter_name text,
  order_type text,
  table_name text,
  item_id uuid,
  menu_item_id text,
  item_name text,
  category_id text,
  quantity numeric,
  dish_quantity numeric,
  unit_price bigint,
  line_total numeric,
  is_counter boolean,
  is_paid boolean,
  tech_card_component_snapshot jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with sess as (
    select * from public.reports_session_money(p_from, p_to, p_table_id, p_waiter_name)
  ),
  member as (
    select s.first_order_id, s.business_date, s.table_id, s.waiter_name, s.order_type, s.table_name, s.is_paid,
      coalesce(s.paid_at, s.created_at) as session_at, o.order_id
    from sess s, lateral unnest(s.order_ids) as o(order_id)
  )
  select m.first_order_id, m.session_at, m.business_date, m.table_id, m.waiter_name, m.order_type, m.table_name,
    oi.id, oi.menu_item_id, oi.name, nullif(oi.category_id_snapshot, '') as category_id,
    coalesce(nullif(oi.quantity, 0), 1) as quantity,
    case when coalesce(oi.quantity, 0) > 0 then oi.quantity else 1 end as dish_quantity,
    greatest(0, round(coalesce(oi.unit_price, oi.price, 0)))::bigint as unit_price,
    greatest(0, round(coalesce(oi.unit_price, oi.price, 0))) * coalesce(nullif(oi.quantity, 0), 1) as line_total,
    (coalesce(oi.is_counter_item, false) or lower(coalesce(oi.item_type, '')) in ('counter', 'quick', 'cashier_quick')) as is_counter,
    m.is_paid,
    oi.tech_card_component_snapshot
  from member m
  join public.order_items oi on oi.order_id = m.order_id
  where lower(coalesce(oi.status, '')) <> 'cancelled'
$$;

revoke all on function public.reports_session_items(date, date, text, text) from public, anon;
grant execute on function public.reports_session_items(date, date, text, text) to authenticated;

-- Overview: KPI cards, daily and hourly income, payment methods, order types and
-- waiters for paid sessions. One round trip; every filter is a SQL predicate.
create or replace function public.get_reports_overview(
  p_from date,
  p_to date,
  p_table_id text default null,
  p_waiter_name text default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with sess as (
    select * from public.reports_session_money(p_from, p_to, p_table_id, p_waiter_name)
  ),
  paid as (select * from sess where is_paid),
  paid_ids as (select first_order_id from paid),
  item_qty as (
    select i.first_order_id, sum(i.quantity)::numeric as qty
    from public.reports_session_items(p_from, p_to, p_table_id, p_waiter_name) i
    join paid_ids p on p.first_order_id = i.first_order_id
    group by i.first_order_id
  ),
  pay as (
    select p.method, sum(p.amount)::bigint as revenue, sum(p.row_count)::integer as rows_count
    from public.reports_session_payments(p_from, p_to, p_table_id, p_waiter_name) p
    join paid_ids pi on pi.first_order_id = p.first_order_id
    group by p.method
  )
  select jsonb_build_object(
    'kpi', (select jsonb_build_object(
      'revenue', coalesce(sum(revenue_total), 0)::bigint,
      'loyalty', coalesce(sum(loyalty_income), 0)::bigint,
      'orders', count(*)::integer
    ) from paid),
    'daily', (select coalesce(jsonb_agg(d order by d.business_date), '[]'::jsonb) from (
      select business_date,
        sum(revenue_total)::bigint as revenue,
        sum(loyalty_income)::bigint as loyalty,
        count(*)::integer as orders
      from paid group by business_date
    ) d),
    'hourly', (select coalesce(jsonb_agg(h order by h.hour), '[]'::jsonb) from (
      select extract(hour from (coalesce(paid_at, created_at) at time zone 'Asia/Tashkent'))::integer as hour,
        sum(revenue_total)::bigint as revenue,
        count(*)::integer as orders
      from paid group by 1
    ) h),
    'payment_methods', (select coalesce(jsonb_agg(x order by x.revenue desc), '[]'::jsonb) from (
      select method, revenue, rows_count from pay
    ) x),
    'order_types', (select coalesce(jsonb_agg(t order by t.type_order), '[]'::jsonb) from (
      select public.reports_infer_order_type(pa.order_type, pa.table_name) as type,
        case public.reports_infer_order_type(pa.order_type, pa.table_name)
          when 'dine_in' then 1 when 'take_away' then 2 when 'delivery' then 3 else 4 end as type_order,
        count(*)::integer as orders,
        sum(pa.revenue_total)::bigint as revenue,
        coalesce(sum(q.qty), 0)::numeric as items
      from paid pa left join item_qty q on q.first_order_id = pa.first_order_id
      group by 1, 2
    ) t),
    'price_modes', (select coalesce(jsonb_agg(m order by m.mode_order), '[]'::jsonb) from (
      select case when pa.price_mode = 'tourist' then 'tourist' else 'regular' end as mode,
        case when pa.price_mode = 'tourist' then 2 else 1 end as mode_order,
        count(*)::integer as orders,
        sum(pa.revenue_total)::bigint as revenue
      from paid pa group by 1, 2
    ) m),
    'waiters', (select coalesce(jsonb_agg(w order by w.revenue desc), '[]'::jsonb) from (
      select coalesce(nullif(pa.waiter_name, ''), 'Unknown') as name,
        sum(pa.revenue_total)::bigint as revenue,
        count(*)::integer as orders,
        coalesce(sum(q.qty), 0)::numeric as items
      from paid pa left join item_qty q on q.first_order_id = pa.first_order_id
      group by 1
    ) w)
  )
$$;

revoke all on function public.get_reports_overview(date, date, text, text) from public, anon;
grant execute on function public.get_reports_overview(date, date, text, text) to authenticated;

-- Sales by category and best sellers: billable item aggregates for paid sessions.
create or replace function public.get_reports_item_sales(
  p_from date,
  p_to date,
  p_table_id text default null,
  p_waiter_name text default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with items as (
    select i.*
    from public.reports_session_items(p_from, p_to, p_table_id, p_waiter_name) i
    where i.is_paid
  )
  select jsonb_build_object(
    'by_category', (select coalesce(jsonb_agg(c order by c.revenue desc), '[]'::jsonb) from (
      select category_id,
        sum(line_total)::numeric as revenue,
        sum(quantity)::numeric as qty
      from items group by category_id
    ) c),
    'by_product', (select coalesce(jsonb_agg(p order by p.revenue desc), '[]'::jsonb) from (
      select coalesce(menu_item_id, item_name) as product_key,
        max(menu_item_id) as menu_item_id,
        max(item_name) as item_name,
        sum(quantity)::numeric as qty,
        sum(line_total)::numeric as revenue
      from items group by coalesce(menu_item_id, item_name)
    ) p)
  )
$$;

revoke all on function public.get_reports_item_sales(date, date, text, text) from public, anon;
grant execute on function public.get_reports_item_sales(date, date, text, text) to authenticated;

-- Paged, filtered, sorted order list. Filters are SQL predicates; the page never
-- loads the whole range. Sort: date_desc (default), date_asc, total_desc, total_asc.
create or replace function public.get_reports_order_page(
  p_from date,
  p_to date,
  p_table_id text default null,
  p_waiter_name text default null,
  p_payment_method text default null,
  p_status text default 'all',
  p_search text default null,
  p_sort text default 'date_desc',
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with sess as (
    select * from public.reports_session_money(p_from, p_to, p_table_id, p_waiter_name)
    where (p_status = 'all' or is_paid)
  ),
  pay_kind as (
    -- Same meaning as the browser's getPaymentMethod: one method, or 'mixed' when several.
    select pm.first_order_id, count(*) as method_count, max(pm.method) as only_method
    from public.reports_session_payments(p_from, p_to, p_table_id, p_waiter_name) pm
    group by pm.first_order_id
  ),
  filtered as (
    select s.* from sess s
    left join pay_kind k on k.first_order_id = s.first_order_id
    where (p_payment_method is null or coalesce(
        case when k.method_count > 1 then 'mixed' else k.only_method end,
        public.reports_normalize_payment_method(s.payment_method)) = public.reports_normalize_payment_method(p_payment_method))
      and (nullif(trim(coalesce(p_search, '')), '') is null
        or s.first_order_id ilike '%' || public.reports_escape_like(trim(p_search)) || '%'
        or coalesce(s.table_name, '') ilike '%' || public.reports_escape_like(trim(p_search)) || '%'
        or coalesce(s.waiter_name, '') ilike '%' || public.reports_escape_like(trim(p_search)) || '%'
        or exists (select 1 from public.orders fo where fo.id = s.first_order_id
          and (coalesce(fo.opened_by_name, '') ilike '%' || public.reports_escape_like(trim(p_search)) || '%'
            or coalesce(fo.completed_by_name, '') ilike '%' || public.reports_escape_like(trim(p_search)) || '%'))
        or s.first_order_id in (
          select oi.order_id from public.order_items oi
          where oi.name ilike '%' || public.reports_escape_like(trim(p_search)) || '%'
        ))
  ),
  ordered as (
    select f.*,
      row_number() over (order by
        case when p_sort = 'total_asc' then f.total_sum end asc,
        case when p_sort = 'total_desc' then f.total_sum end desc,
        case when p_sort = 'date_asc' then coalesce(f.paid_at, f.created_at) end asc,
        coalesce(f.paid_at, f.created_at) desc,
        f.first_order_id collate "C" desc) as rn
    from filtered f
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object(
      'session', (
        select coalesce(to_jsonb(fo), '{}'::jsonb) || jsonb_build_object(
          'total', o.total_sum,
          'service_rate_pct', o.service_rate_pct,
          'payments', coalesce((select jsonb_agg(to_jsonb(pm)) from public.order_payments pm where pm.order_id = any(o.order_ids)), '[]'::jsonb),
          '_mergedIds', to_jsonb(o.order_ids),
          '_orderCount', o.order_count
        )
        from public.orders fo where fo.id = o.first_order_id
      ),
      'id', o.first_order_id,
      'order_ids', o.order_ids,
      'order_count', o.order_count,
      'table_id', o.table_id,
      'table_name', o.table_name,
      'waiter_name', o.waiter_name,
      'order_type', public.reports_infer_order_type(o.order_type, o.table_name),
      'price_mode', o.price_mode,
      'payment_method', o.payment_method,
      'is_paid', o.is_paid,
      'paid_at', o.paid_at,
      'created_at', o.created_at,
      'business_date', o.business_date,
      'total', o.total_sum,
      'revenue', o.revenue_total,
      'loyalty_income', o.loyalty_income,
      'service_fee', o.service_fee
    ) order by o.rn), '[]'::jsonb)
    from ordered o
    where o.rn > greatest(0, p_offset) and o.rn <= greatest(0, p_offset) + least(greatest(1, p_limit), 200))
  )
$$;

revoke all on function public.get_reports_order_page(date, date, text, text, text, text, text, text, integer, integer) from public, anon;
grant execute on function public.get_reports_order_page(date, date, text, text, text, text, text, text, integer, integer) to authenticated;

-- Dish analysis (DishSalesTab / getDishSalesAnalysis). Direct sales are the
-- order lines; set contents come only from the frozen tech_card_component_snapshot
-- and are counted separately (never added to revenue). Keys follow
-- getOrderItemDishSalesKey: menu:<id> when linked, else name:<normalised name>.
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
      dish_key as source_key, dish_name as source_name, false as included
    from items
    where dish_key is not null
  ),
  components as (
    select i.first_order_id, i.session_at, i.business_date,
      extract(hour from (i.session_at at time zone 'Asia/Tashkent'))::integer as hour_of_day,
      i.dish_quantity, i.dish_key as source_key, i.dish_name as source_name,
      c.value as comp
    from items i
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(i.tech_card_component_snapshot) = 'array' then i.tech_card_component_snapshot else '[]'::jsonb end
    ) as c(value)
    where i.dish_key is not null
  ),
  included_raw as (
    select c.first_order_id, c.session_at, c.business_date, c.hour_of_day, c.source_key, c.source_name,
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
      source_key, source_name, true as included
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
          hour_of_day as hour, qty as quantity, revenue, source_key, source_name, included as included_in_set
        from selected order by session_at desc limit 300
      ) x)
    ) end
  )
$$;

revoke all on function public.get_reports_dish_sales(date, date, text, text, text) from public, anon;
grant execute on function public.get_reports_dish_sales(date, date, text, text, text) to authenticated;

-- Filter choices for the Reports toolbar: waiters and tables that have sessions in range.
create or replace function public.get_reports_filter_options(p_from date, p_to date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with sess as (select * from public.reports_session_money(p_from, p_to, null, null))
  select jsonb_build_object(
    'waiters', (select coalesce(jsonb_agg(w order by w), '[]'::jsonb) from (
      select distinct waiter_name as w from sess where nullif(waiter_name, '') is not null) x),
    'tables', (select coalesce(jsonb_agg(t order by t), '[]'::jsonb) from (
      select distinct table_id as t from sess where nullif(table_id, '') is not null) x)
  )
$$;

revoke all on function public.get_reports_filter_options(date, date) from public, anon;
grant execute on function public.get_reports_filter_options(date, date) to authenticated;

notify pgrst, 'reload schema';
commit;
