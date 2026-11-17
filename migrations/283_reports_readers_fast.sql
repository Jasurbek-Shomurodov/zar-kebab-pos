-- Reports readers, faster and complete (follows 281/282, same results).
--
-- 1. reports_session_money filters on Tashkent-midnight instants, so the paid_at and
--    created_at indexes are used (the ::date cast in 281 forced a full scan).
-- 2. get_reports_overview computes the session core once and derives payments,
--    item counts, cashback and cancelled orders from it (281 ran the core three times).
--    It now carries what the Closeout panel needs, so the page no longer loads every
--    order in the range just to show Closeout.
-- 3. get_reports_order_page computes the core once, works out payment kinds only when
--    a payment filter is set, and searches item names across every merged order.
-- 4. get_reports_filter_options reads distinct waiters/tables straight from orders.

begin;

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
    -- Tashkent midnight instants, so both branches are plain range scans on the
    -- partial paid_at / created_at indexes (a ::date cast on the column defeats them).
    select (p_from::timestamp at time zone 'Asia/Tashkent') as i_from,
      ((p_to + 1)::timestamp at time zone 'Asia/Tashkent') as i_to
  ),
  -- Orders whose business date (paid_at, else created_at) is in range.
  scoped as (
    select o.*
    from public.orders o, bounds b
    where o.paid_at >= b.i_from and o.paid_at < b.i_to
    union all
    select o.*
    from public.orders o, bounds b
    where o.paid_at is null
      and o.created_at >= b.i_from and o.created_at < b.i_to
  ),
  -- Order type inline (same rules as reports_infer_order_type / inferOrderType), so the
  -- per-row plpgsql call and the duplicated session-key expression are gone.
  typed as (
    select s.*,
      lower(coalesce(s.order_type, '')) as ot,
      lower(coalesce(s.table_name, '')) as tn
    from scoped s
  ),
  ranked as (
    select t.*,
      case
        when t.ot <> '' then case
          when strpos(t.ot, 'game_club') > 0 or strpos(t.ot, 'game club') > 0 or strpos(t.ot, 'игровой клуб') > 0 then 'game_club'
          when strpos(t.ot, 'delivery') > 0 or strpos(t.ot, 'deliver') > 0 or strpos(t.ot, 'достав') > 0 or strpos(t.ot, 'yetkaz') > 0 then 'delivery'
          when strpos(t.ot, 'take') > 0 or strpos(t.ot, 'away') > 0 or strpos(t.ot, 'с собой') > 0 or strpos(t.ot, 'olib') > 0 then 'take_away'
          else 'dine_in' end
        when strpos(t.tn, 'game club') > 0 or strpos(t.tn, 'игровой клуб') > 0 then 'game_club'
        when strpos(t.tn, 'delivery') > 0 or strpos(t.tn, 'достав') > 0 then 'delivery'
        when strpos(t.tn, 'take') > 0 or strpos(t.tn, 'away') > 0 then 'take_away'
        else 'dine_in'
      end as resolved_type,
      (coalesce(t.paid_at, t.created_at) at time zone 'Asia/Tashkent')::date as business_date,
      case
        when t.paid_at is not null then to_char(date_trunc('minute', t.paid_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI')
        else to_char(t.created_at at time zone 'UTC', 'YYYY-MM-DD')
      end as anchor
    from typed t
  ),
  session_keyed as (
    select r.*,
      (r.resolved_type <> 'dine_in') as is_off_premise,
      case
        when r.resolved_type <> 'dine_in' or nullif(r.table_id, '') is null then 'order::' || r.id
        else r.table_id || '::' || r.anchor
      end as session_key
    from ranked r
  ),
  keyed as materialized (
    select k.*,
      row_number() over (
        partition by k.session_key
        order by coalesce(k.paid_at, k.created_at) desc, k.id collate "C" desc
      ) as member_rank
    from session_keyed k
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
  with sess as materialized (
    select * from public.reports_session_money(p_from, p_to, p_table_id, p_waiter_name)
  ),
  paid as materialized (select * from sess where is_paid),
  members as materialized (
    select p.first_order_id, m.order_id
    from paid p, lateral unnest(p.order_ids) as m(order_id)
  ),
  -- Billable item quantity per paid session (getSoldOrderItems; quantity 0/null = 1).
  item_qty as (
    select m.first_order_id, sum(coalesce(nullif(oi.quantity, 0), 1))::numeric as qty
    from members m
    join public.order_items oi on oi.order_id = m.order_id
    where lower(coalesce(oi.status, '')) <> 'cancelled'
    group by m.first_order_id
  ),
  cashback as (
    select m.first_order_id, sum(coalesce(o.cashback_earned, 0))::bigint as cashback
    from members m join public.orders o on o.id = m.order_id
    group by m.first_order_id
  ),
  -- Payment breakdown per paid session (getOrderPaymentBreakdown): saved rows win,
  -- else payment_method + revenue; loyalty income is added when no loyalty row exists.
  raw_rows as (
    select m.first_order_id,
      public.reports_normalize_payment_method(p.method) as method,
      greatest(0, round(coalesce(p.amount, 0)))::bigint as amount
    from members m
    join public.order_payments p on p.order_id = m.order_id
    where greatest(0, round(coalesce(p.amount, 0))) > 0
  ),
  breakdown as (
    select first_order_id, method, amount, 1 as row_count from raw_rows
    union all
    select s.first_order_id, public.reports_normalize_payment_method(s.payment_method), s.revenue_total::bigint, 1
    from paid s
    where coalesce(s.revenue_total, 0) > 0
      and not exists (select 1 from raw_rows r where r.first_order_id = s.first_order_id)
  ),
  breakdown_all as (
    select * from breakdown
    union all
    select s.first_order_id, 'loyalty_card', s.loyalty_income::bigint, 1
    from paid s
    where s.loyalty_income > 0
      and not exists (select 1 from breakdown b where b.first_order_id = s.first_order_id and b.method = 'loyalty_card')
  ),
  pay as (
    select method, sum(amount)::bigint as revenue, sum(row_count)::integer as rows_count
    from breakdown_all group by method
  ),
  -- Cancelled orders for Closeout: order-level, dated by updated_at else created_at.
  cancelled as (
    select count(*)::integer as n
    from public.orders o
    where o.status = 'cancelled'
      and coalesce(o.updated_at, o.created_at) >= (p_from::timestamp at time zone 'Asia/Tashkent')
      and coalesce(o.updated_at, o.created_at) < ((p_to + 1)::timestamp at time zone 'Asia/Tashkent')
      and (p_table_id is null or o.table_id = p_table_id)
      and (p_waiter_name is null or o.waiter_name = p_waiter_name)
  )
  select jsonb_build_object(
    'kpi', (select jsonb_build_object(
      'revenue', coalesce(sum(revenue_total), 0)::bigint,
      'loyalty', coalesce(sum(loyalty_income), 0)::bigint,
      'orders', count(*)::integer
    ) from paid),
    'cashback', (select coalesce(sum(cashback), 0)::bigint from cashback),
    'cancelled_count', (select n from cancelled),
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
    'payment_methods', (select coalesce(jsonb_agg(x order by x.revenue desc), '[]'::jsonb) from pay x),
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
  with args as (
    select nullif(trim(coalesce(p_search, '')), '') as q,
      case when p_payment_method is null then null
        else public.reports_normalize_payment_method(p_payment_method) end as pay
  ),
  sess as materialized (
    select * from public.reports_session_money(p_from, p_to, p_table_id, p_waiter_name)
    where (p_status = 'all' or is_paid)
  ),
  -- Payment kind per session, as getPaymentMethod: one method, or 'mixed'. Only
  -- computed when a payment filter is set.
  members as (
    select s.first_order_id, m.order_id
    from sess s, lateral unnest(s.order_ids) as m(order_id), args a
    where a.pay is not null
  ),
  raw_rows as (
    select m.first_order_id, public.reports_normalize_payment_method(p.method) as method
    from members m join public.order_payments p on p.order_id = m.order_id
    where greatest(0, round(coalesce(p.amount, 0))) > 0
  ),
  methods as (
    select first_order_id, method from raw_rows
    union
    select s.first_order_id, public.reports_normalize_payment_method(s.payment_method)
    from sess s, args a
    where a.pay is not null and s.is_paid and coalesce(s.revenue_total, 0) > 0
      and not exists (select 1 from raw_rows r where r.first_order_id = s.first_order_id)
    union
    select s.first_order_id, 'loyalty_card'
    from sess s, args a
    where a.pay is not null and s.is_paid and s.loyalty_income > 0
  ),
  pay_kind as (
    select first_order_id,
      case when count(distinct method) > 1 then 'mixed' else max(method) end as kind
    from methods group by first_order_id
  ),
  filtered as (
    select s.* from sess s
    cross join args a
    left join pay_kind k on k.first_order_id = s.first_order_id
    where (a.pay is null
        or coalesce(k.kind, public.reports_normalize_payment_method(s.payment_method)) = a.pay)
      and (a.q is null
        or s.first_order_id ilike '%' || public.reports_escape_like(a.q) || '%'
        or coalesce(s.table_name, '') ilike '%' || public.reports_escape_like(a.q) || '%'
        or coalesce(s.waiter_name, '') ilike '%' || public.reports_escape_like(a.q) || '%'
        or exists (select 1 from public.orders fo where fo.id = s.first_order_id
          and (coalesce(fo.opened_by_name, '') ilike '%' || public.reports_escape_like(a.q) || '%'
            or coalesce(fo.completed_by_name, '') ilike '%' || public.reports_escape_like(a.q) || '%'))
        or exists (select 1 from public.order_items oi
          where oi.order_id = any(s.order_ids)
            and oi.name ilike '%' || public.reports_escape_like(a.q) || '%'))
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

create or replace function public.get_reports_filter_options(p_from date, p_to date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select (p_from::timestamp at time zone 'Asia/Tashkent') as i_from,
      ((p_to + 1)::timestamp at time zone 'Asia/Tashkent') as i_to
  ),
  scoped as (
    select o.waiter_name, o.table_id from public.orders o, bounds b
    where o.paid_at >= b.i_from and o.paid_at < b.i_to
    union all
    select o.waiter_name, o.table_id from public.orders o, bounds b
    where o.paid_at is null and o.created_at >= b.i_from and o.created_at < b.i_to
  )
  select jsonb_build_object(
    'waiters', (select coalesce(jsonb_agg(w order by w), '[]'::jsonb) from (
      select distinct waiter_name as w from scoped where nullif(waiter_name, '') is not null) x),
    'tables', (select coalesce(jsonb_agg(t order by t), '[]'::jsonb) from (
      select distinct table_id as t from scoped where nullif(table_id, '') is not null) x)
  )
  where (select public.reports_require_access())
$$;

revoke all on function public.get_reports_filter_options(date, date) from public, anon;
grant execute on function public.get_reports_filter_options(date, date) to authenticated;

notify pgrst, 'reload schema';
commit;
