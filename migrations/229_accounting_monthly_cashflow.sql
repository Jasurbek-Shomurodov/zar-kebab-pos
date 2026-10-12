-- Monthly cash flow for Financial analysis growth cards, aggregated in the
-- database so a year of expenses and orders is never downloaded (PostgREST caps
-- selects at 1000 rows). Uses the same rules as get_accounting_paid_order_summary
-- (paid_at, or created_at for legacy paid rows, in Tashkent days) and
-- get_accounting_all_time_balance (salary payments, legacy paid bonuses and
-- finalized employee meals are cash out; unpaid salary liability is not).
-- Investor support is reported apart from operating cash so payback can compare
-- what was invested with what the cafe generated.

begin;

create or replace function public.get_accounting_monthly_cashflow(
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
  v_months jsonb;
  v_totals jsonb;
begin
  if not public.current_staff_can_access('expenses') then
    raise exception 'Accounting access is required' using errcode = '42501';
  end if;

  v_first_month := (v_current_month - ((v_month_count - 1) * interval '1 month'))::date;

  with paid_orders as materialized (
    select
      o.id,
      greatest(0, round(coalesce(o.total, 0)::numeric)) as cafe_income,
      date_trunc('month', timezone('Asia/Tashkent', coalesce(o.paid_at, o.created_at)))::date as month_start
    from public.orders o
    where o.status::text is distinct from 'cancelled'
      and o.payment_status::text is distinct from 'cancelled'
      and (
        o.paid_at is not null
        or (o.payment_status::text = 'paid' or o.status::text in ('paid', 'completed'))
      )
  ),
  order_months as (
    select month_start, sum(cafe_income) as cafe_income, count(*) as order_count
    from paid_orders
    group by month_start
  ),
  cost_months as (
    select
      paid_orders.month_start,
      round(sum(
        greatest(0, coalesce(item.quantity, 1)::numeric)
        * greatest(0, coalesce(item.cost_price, 0)::numeric)
      )) as sales_cost
    from public.order_items item
    join paid_orders on paid_orders.id = item.order_id
    where paid_orders.month_start >= v_first_month
      and lower(coalesce(item.status::text, '')) <> 'cancelled'
    group by paid_orders.month_start
  ),
  expense_months as (
    select
      date_trunc('month', e.expense_date)::date as month_start,
      sum(greatest(0, round(coalesce(e.amount, 0)::numeric))) filter (where e.entry_type = 'income' and e.category = 'investor_support') as investor_support,
      sum(greatest(0, round(coalesce(e.amount, 0)::numeric))) filter (where e.entry_type = 'income' and e.category is distinct from 'investor_support') as other_income,
      sum(greatest(0, round(coalesce(e.amount, 0)::numeric))) filter (where e.entry_type <> 'income') as recorded_expenses
    from public.expenses e
    where e.expense_date is not null
    group by 1
  ),
  salary_months as (
    select date_trunc('month', p.paid_date)::date as month_start, sum(greatest(0, round(coalesce(p.amount, 0)::numeric))) as salary_payments
    from public.employee_salary_payments p
    where p.paid_date is not null
    group by 1
  ),
  bonus_months as (
    select date_trunc('month', b.bonus_date)::date as month_start, sum(greatest(0, round(coalesce(b.amount, 0)::numeric))) as legacy_paid_bonuses
    from public.employee_salary_bonuses b
    where b.accrues_to_salary is not true and b.bonus_date is not null
    group by 1
  ),
  meal_months as (
    select date_trunc('month', m.business_date)::date as month_start, sum(greatest(0, round(coalesce(m.total_amount, 0)::numeric))) as employee_meals
    from public.employee_daily_meal_expenses m
    where m.business_date is not null
    group by 1
  ),
  all_months as (
    select month_start from order_months
    union select month_start from expense_months
    union select month_start from salary_months
    union select month_start from bonus_months
    union select month_start from meal_months
  ),
  monthly as (
    select
      a.month_start,
      coalesce(o.cafe_income, 0) as cafe_income,
      coalesce(o.order_count, 0) as order_count,
      coalesce(c.sales_cost, 0) as sales_cost,
      coalesce(e.investor_support, 0) as investor_support,
      coalesce(e.other_income, 0) as other_income,
      coalesce(e.recorded_expenses, 0) + coalesce(s.salary_payments, 0) + coalesce(b.legacy_paid_bonuses, 0) + coalesce(m.employee_meals, 0) as spent,
      coalesce(s.salary_payments, 0) + coalesce(b.legacy_paid_bonuses, 0) as salaries
    from all_months a
    left join order_months o on o.month_start = a.month_start
    left join cost_months c on c.month_start = a.month_start
    left join expense_months e on e.month_start = a.month_start
    left join salary_months s on s.month_start = a.month_start
    left join bonus_months b on b.month_start = a.month_start
    left join meal_months m on m.month_start = a.month_start
  ),
  requested as (
    select month_value::date as month_start
    from generate_series(v_first_month, v_current_month, interval '1 month') month_value
  )
  select
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'month_start', r.month_start,
        'cafe_income', coalesce(mo.cafe_income, 0),
        'order_count', coalesce(mo.order_count, 0),
        'sales_cost', coalesce(mo.sales_cost, 0),
        'investor_support', coalesce(mo.investor_support, 0),
        'other_income', coalesce(mo.other_income, 0),
        'spent', coalesce(mo.spent, 0),
        'salaries', coalesce(mo.salaries, 0)
      ) order by r.month_start)
      from requested r
      left join monthly mo on mo.month_start = r.month_start
    ), '[]'::jsonb),
    jsonb_build_object(
      'investor_support', coalesce(sum(investor_support), 0),
      'operating_cash', coalesce(sum(cafe_income + other_income - spent), 0),
      'first_order_month', (select min(month_start) from order_months),
      'first_investment_month', min(month_start) filter (where investor_support > 0)
    )
  into v_months, v_totals
  from monthly;

  return jsonb_build_object('months', v_months, 'totals', v_totals);
end;
$$;

revoke all on function public.get_accounting_monthly_cashflow(integer)
  from public, anon, authenticated;
grant execute on function public.get_accounting_monthly_cashflow(integer)
  to authenticated;

commit;

notify pgrst, 'reload schema';
