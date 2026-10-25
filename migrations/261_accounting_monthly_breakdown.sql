-- Monthly income by source and spending by category for the Financial analysis
-- Overall tab, aggregated here so a year of orders and expenses is never
-- downloaded (PostgREST caps selects at 1000 rows). Same rules as
-- get_accounting_monthly_cashflow (229):
-- * income: paid orders (paid_at, or created_at for legacy paid rows, in
--   Tashkent months) by saved order_type and price_mode; per month they add up
--   to 229's cafe_income.
-- * spending: recorded expenses by category, salary payments and legacy paid
--   bonuses as `salaries`, finalized employee meals as `employee_meals`; per
--   month they add up to 229's spent.

begin;

create or replace function public.get_accounting_monthly_breakdown(
  p_month_count integer default 12
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_month_count integer := greatest(1, least(coalesce(p_month_count, 12), 36));
  v_current_month date := date_trunc('month', timezone('Asia/Tashkent', now()))::date;
  v_first_month date;
  v_rows jsonb;
  v_income jsonb;
begin
  if not public.current_staff_can_access('expenses') then
    raise exception 'Accounting access is required' using errcode = '42501';
  end if;

  v_first_month := (v_current_month - ((v_month_count - 1) * interval '1 month'))::date;

  with spending as (
    select date_trunc('month', e.expense_date)::date as month_start,
      coalesce(nullif(e.category, ''), 'other') as category,
      greatest(0, round(coalesce(e.amount, 0)::numeric)) as amount
    from public.expenses e
    where e.expense_date >= v_first_month
      and e.entry_type <> 'income'
    union all
    select date_trunc('month', p.paid_date)::date, 'salaries', greatest(0, round(coalesce(p.amount, 0)::numeric))
    from public.employee_salary_payments p
    where p.paid_date >= v_first_month
    union all
    select date_trunc('month', b.bonus_date)::date, 'salaries', greatest(0, round(coalesce(b.amount, 0)::numeric))
    from public.employee_salary_bonuses b
    where b.accrues_to_salary is not true and b.bonus_date >= v_first_month
    union all
    select date_trunc('month', m.business_date)::date, 'employee_meals', greatest(0, round(coalesce(m.total_amount, 0)::numeric))
    from public.employee_daily_meal_expenses m
    where m.business_date >= v_first_month
  ),
  grouped as (
    select month_start, category, sum(amount) as amount
    from spending
    where month_start <= v_current_month
    group by month_start, category
    having sum(amount) > 0
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'month_start', month_start,
    'category', category,
    'amount', amount
  ) order by month_start, amount desc), '[]'::jsonb)
  into v_rows
  from grouped;

  with paid_orders as (
    select
      date_trunc('month', timezone('Asia/Tashkent', coalesce(o.paid_at, o.created_at)))::date as month_start,
      coalesce(o.order_type::text, 'dine_in') as order_type,
      coalesce(o.price_mode::text, 'regular') as price_mode,
      greatest(0, round(coalesce(o.total, 0)::numeric)) as amount
    from public.orders o
    where o.status::text is distinct from 'cancelled'
      and o.payment_status::text is distinct from 'cancelled'
      and (
        o.paid_at is not null
        or (o.payment_status::text = 'paid' or o.status::text in ('paid', 'completed'))
      )
      and coalesce(o.paid_at, o.created_at) >= (v_first_month::timestamp at time zone 'Asia/Tashkent')
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'month_start', month_start,
    'order_type', order_type,
    'price_mode', price_mode,
    'order_count', order_count,
    'amount', amount
  ) order by month_start, amount desc), '[]'::jsonb)
  into v_income
  from (
    select month_start, order_type, price_mode, count(*) as order_count, sum(amount) as amount
    from paid_orders
    where month_start between v_first_month and v_current_month
    group by month_start, order_type, price_mode
  ) grouped_income;

  return jsonb_build_object('spending', v_rows, 'income', v_income);
end;
$$;

revoke all on function public.get_accounting_monthly_breakdown(integer)
  from public, anon, authenticated;
grant execute on function public.get_accounting_monthly_breakdown(integer)
  to authenticated;

commit;

notify pgrst, 'reload schema';
