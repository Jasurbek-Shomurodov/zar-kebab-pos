-- Bank fee estimates and sold-item cost checks for Financial analysis.
--
-- Card and terminal payments reach the cafe minus a bank fee that is never
-- recorded as an expense. The owner keeps a fee rate per method; each change
-- is kept with the Tashkent date it takes effect, so changing a rate never
-- rewrites earlier periods. Fees are estimates per day: that day's card and
-- terminal (incl. QR) income from get_accounting_paid_order_summary times the
-- rate in effect that day. Nothing is written to expenses or Accounting.
--
-- get_accounting_cost_anomalies lists paid, non-cancelled sold items whose
-- saved cost is above their price, so a wrong Tech Card cost is visible
-- instead of silently pulling gross profit below zero. Saved costs stay
-- immutable; this only reads them.
-- Apply before deploying the Financial analysis UI that reads these; without
-- them the page hides both features.

begin;
set local lock_timeout = '5s';

create table if not exists public.payment_fee_rate_history (
  method text not null check (method in ('card', 'terminal')),
  effective_from date not null,
  rate_pct numeric(5, 3) not null check (rate_pct >= 0 and rate_pct <= 20),
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  primary key (method, effective_from)
);

alter table public.payment_fee_rate_history enable row level security;

drop policy if exists "feature_access_read_payment_fee_rates" on public.payment_fee_rate_history;
create policy "feature_access_read_payment_fee_rates"
  on public.payment_fee_rate_history for select
  to authenticated
  using (public.current_staff_can_access_any(array['financial_analysis', 'expenses']));

-- Writes only through set_payment_fee_rate.
revoke insert, update, delete on public.payment_fee_rate_history from anon, authenticated;
grant select on public.payment_fee_rate_history to authenticated;

create or replace function public.current_payment_fee_rates()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'card', coalesce((select h.rate_pct from public.payment_fee_rate_history h
      where h.method = 'card' and h.effective_from <= timezone('Asia/Tashkent', now())::date
      order by h.effective_from desc limit 1), 0),
    'terminal', coalesce((select h.rate_pct from public.payment_fee_rate_history h
      where h.method = 'terminal' and h.effective_from <= timezone('Asia/Tashkent', now())::date
      order by h.effective_from desc limit 1), 0),
    'history', coalesce((select jsonb_agg(jsonb_build_object(
        'method', h.method, 'effective_from', h.effective_from, 'rate_pct', h.rate_pct
      ) order by h.method, h.effective_from)
      from public.payment_fee_rate_history h), '[]'::jsonb)
  );
$$;

revoke all on function public.current_payment_fee_rates() from public, anon, authenticated;

create or replace function public.set_payment_fee_rate(
  p_method text,
  p_rate_pct numeric,
  p_effective_from date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  effective date := coalesce(p_effective_from, timezone('Asia/Tashkent', now())::date);
begin
  if not (public.current_staff_can_access('expenses') and public.current_staff_can_access('financial_analysis')) then
    raise exception 'Financial analysis access is required' using errcode = '42501';
  end if;
  if p_method is null or p_method not in ('card', 'terminal') then
    raise exception 'Unknown payment method for a fee rate' using errcode = '22023';
  end if;
  if p_rate_pct is null or p_rate_pct < 0 or p_rate_pct > 20 then
    raise exception 'A fee rate must be between 0 and 20 percent' using errcode = '22023';
  end if;
  if effective > timezone('Asia/Tashkent', now())::date then
    raise exception 'A fee rate cannot start in the future' using errcode = '22023';
  end if;

  -- Same method and date: the last value wins, so a retried save is harmless.
  insert into public.payment_fee_rate_history (method, effective_from, rate_pct, changed_by, changed_at)
  values (p_method, effective, round(p_rate_pct, 3), auth.uid(), now())
  on conflict (method, effective_from) do update
    set rate_pct = excluded.rate_pct,
        changed_by = excluded.changed_by,
        changed_at = excluded.changed_at;

  return public.current_payment_fee_rates();
end;
$$;

revoke all on function public.set_payment_fee_rate(text, numeric, date) from public, anon, authenticated;
grant execute on function public.set_payment_fee_rate(text, numeric, date) to authenticated;

create or replace function public.get_accounting_payment_fees(
  p_date_from date,
  p_date_to date
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  rates jsonb;
  days jsonb := '[]'::jsonb;
begin
  if not public.current_staff_can_access('expenses') then
    raise exception 'Accounting access is required' using errcode = '42501';
  end if;
  if p_date_from is null or p_date_to is null or p_date_from > p_date_to then
    raise exception 'A valid Accounting date range is required';
  end if;
  if p_date_to - p_date_from > 400 then
    raise exception 'Payment fees cover at most 400 days';
  end if;

  rates := public.current_payment_fee_rates();

  -- No rate above zero in effect by the end of the range: nothing to estimate,
  -- so the per-day summaries are skipped entirely.
  if exists (
    select 1 from public.payment_fee_rate_history h
    where h.rate_pct > 0 and h.effective_from <= p_date_to
  ) then
    with day_rates as (
      select
        day::date as date,
        coalesce((select h.rate_pct from public.payment_fee_rate_history h
          where h.method = 'card' and h.effective_from <= day::date
          order by h.effective_from desc limit 1), 0) as card_rate,
        coalesce((select h.rate_pct from public.payment_fee_rate_history h
          where h.method = 'terminal' and h.effective_from <= day::date
          order by h.effective_from desc limit 1), 0) as terminal_rate
      from generate_series(p_date_from, p_date_to, interval '1 day') day
    ),
    day_income as (
      select
        day_rates.*,
        public.get_accounting_paid_order_summary(day_rates.date, day_rates.date)->'payment_method_income' as income
      from day_rates
      where day_rates.card_rate > 0 or day_rates.terminal_rate > 0
    ),
    day_fees as (
      select
        date,
        card_rate,
        terminal_rate,
        greatest(0, coalesce((income->>'card')::numeric, 0)) as card_income,
        greatest(0, coalesce((income->>'terminal')::numeric, 0) + coalesce((income->>'qr')::numeric, 0)) as terminal_income
      from day_income
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'date', date,
      'card_income', card_income,
      'terminal_income', terminal_income,
      'card_rate_pct', card_rate,
      'terminal_rate_pct', terminal_rate,
      'card_fee', round(card_income * card_rate / 100),
      'terminal_fee', round(terminal_income * terminal_rate / 100)
    ) order by date), '[]'::jsonb)
    into days
    from day_fees
    where round(card_income * card_rate / 100) > 0 or round(terminal_income * terminal_rate / 100) > 0;
  end if;

  return jsonb_build_object('rates', rates, 'days', days);
end;
$$;

revoke all on function public.get_accounting_payment_fees(date, date) from public, anon, authenticated;
grant execute on function public.get_accounting_payment_fees(date, date) to authenticated;

create or replace function public.get_accounting_cost_anomalies(
  p_date_from date,
  p_date_to date
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  from_instant timestamptz;
  to_instant_exclusive timestamptz;
  result jsonb;
begin
  if not public.current_staff_can_access('expenses') then
    raise exception 'Accounting access is required' using errcode = '42501';
  end if;
  if p_date_from is null or p_date_to is null or p_date_from > p_date_to then
    raise exception 'A valid Accounting date range is required';
  end if;
  if p_date_to - p_date_from > 400 then
    raise exception 'Cost checks cover at most 400 days';
  end if;

  from_instant := p_date_from::timestamp at time zone 'Asia/Tashkent';
  to_instant_exclusive := (p_date_to + 1)::timestamp at time zone 'Asia/Tashkent';

  -- Same paid-order rules as get_accounting_paid_order_summary.
  with paid_orders as materialized (
    select orders.id, coalesce(orders.paid_at, orders.created_at) as accounting_at
    from public.orders
    where orders.status::text is distinct from 'cancelled'
      and orders.payment_status::text is distinct from 'cancelled'
      and (
        (
          orders.paid_at is not null
          and orders.paid_at >= from_instant
          and orders.paid_at < to_instant_exclusive
        )
        or (
          orders.paid_at is null
          and (
            orders.payment_status::text = 'paid'
            or orders.status::text in ('paid', 'completed')
          )
          and orders.created_at >= from_instant
          and orders.created_at < to_instant_exclusive
        )
      )
  ),
  flagged as (
    select
      sold_item.id,
      sold_item.order_id,
      sold_item.name,
      greatest(0, coalesce(sold_item.quantity, 1)::numeric) as quantity,
      round(sold_item.price::numeric) as price,
      round(sold_item.cost_price::numeric) as cost_price,
      timezone('Asia/Tashkent', paid_orders.accounting_at)::date as sold_on
    from public.order_items as sold_item
    join paid_orders on paid_orders.id = sold_item.order_id
    where lower(coalesce(sold_item.status::text, '')) <> 'cancelled'
      and coalesce(sold_item.price, 0) > 0
      and sold_item.cost_price > sold_item.price
  )
  select jsonb_build_object(
    'count', count(*),
    'cost_total', coalesce(round(sum(quantity * cost_price)), 0),
    'excess_total', coalesce(round(sum(quantity * (cost_price - price))), 0),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', top.id,
        'order_id', top.order_id,
        'name', top.name,
        'quantity', top.quantity,
        'price', top.price,
        'cost_price', top.cost_price,
        'sold_on', top.sold_on
      ) order by top.quantity * (top.cost_price - top.price) desc, top.id)
      from (
        select * from flagged
        order by quantity * (cost_price - price) desc, id
        limit 20
      ) top
    ), '[]'::jsonb)
  )
  into result
  from flagged;

  return result;
end;
$$;

revoke all on function public.get_accounting_cost_anomalies(date, date) from public, anon, authenticated;
grant execute on function public.get_accounting_cost_anomalies(date, date) to authenticated;

notify pgrst, 'reload schema';

commit;
