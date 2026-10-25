-- Monthly owner-profit close.
--
-- Each finished month is closed once, in order, by an active owner. The close
-- freezes that month's income and costs, with salary counted in the month it
-- was earned (base pay, accruing bonuses minus fines, computed by the payroll
-- helpers in the browser and frozen per employee). The signed result is the
-- owner profit: negative when the owner covered a loss. Investor support is
-- kept out of profit but closed with the month, so the all-time cash remainder
-- restarts from zero (plus wages earned but not yet paid) every month.
--
-- Closes are immutable. They live in their own table, so expense reports,
-- cash flow and payback never see them as spending.

begin;
set local lock_timeout = '5s';

create table if not exists public.accounting_month_closes (
  id uuid primary key default gen_random_uuid(),
  month_start date not null unique
    check (month_start = date_trunc('month', month_start)::date),
  cafe_income bigint not null,
  other_income bigint not null,
  investor_support bigint not null,
  recorded_expenses bigint not null,
  legacy_paid_bonuses bigint not null,
  employee_meals bigint not null,
  salary_earned bigint not null,
  salary_breakdown jsonb not null default '[]'::jsonb
    check (jsonb_typeof(salary_breakdown) = 'array'),
  owner_profit bigint not null,
  settled_amount bigint not null,
  request_id uuid not null unique,
  closed_by uuid,
  closed_by_name text,
  closed_at timestamptz not null default now()
);

alter table public.accounting_month_closes enable row level security;
revoke all on table public.accounting_month_closes from public, anon, authenticated;

create or replace function public.prevent_accounting_month_close_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Closed months are immutable' using errcode = '42501';
end;
$$;

drop trigger if exists accounting_month_closes_immutable on public.accounting_month_closes;
create trigger accounting_month_closes_immutable
  before update or delete on public.accounting_month_closes
  for each row execute function public.prevent_accounting_month_close_changes();

-- Per-month server-side components, same rules as get_accounting_all_time_balance
-- (paid orders by paid_at, or created_at for legacy paid rows, in Tashkent).
create or replace function public.accounting_month_components(p_from date, p_to date)
returns table (
  month_start date,
  cafe_income bigint,
  other_income bigint,
  investor_support bigint,
  recorded_expenses bigint,
  legacy_paid_bonuses bigint,
  employee_meals bigint
)
language sql
security definer
stable
set search_path = public
as $$
  with months as (
    select generate_series(p_from, p_to, interval '1 month')::date as month_start
  ),
  order_months as (
    select
      date_trunc('month', timezone('Asia/Tashkent', coalesce(o.paid_at, o.created_at)))::date as month_start,
      sum(greatest(0, round(coalesce(o.total, 0)::numeric))) as cafe_income
    from public.orders o
    where o.status::text is distinct from 'cancelled'
      and o.payment_status::text is distinct from 'cancelled'
      and (
        o.paid_at is not null
        or (o.payment_status::text = 'paid' or o.status::text in ('paid', 'completed'))
      )
      and timezone('Asia/Tashkent', coalesce(o.paid_at, o.created_at)) >= p_from
      and timezone('Asia/Tashkent', coalesce(o.paid_at, o.created_at)) < (p_to + interval '1 month')
    group by 1
  ),
  expense_months as (
    select
      date_trunc('month', e.expense_date)::date as month_start,
      sum(greatest(0, round(coalesce(e.amount, 0)::numeric))) filter (where e.entry_type = 'income' and e.category is distinct from 'investor_support') as other_income,
      sum(greatest(0, round(coalesce(e.amount, 0)::numeric))) filter (where e.entry_type = 'income' and e.category = 'investor_support') as investor_support,
      sum(greatest(0, round(coalesce(e.amount, 0)::numeric))) filter (where e.entry_type <> 'income') as recorded_expenses
    from public.expenses e
    where e.expense_date >= p_from and e.expense_date < (p_to + interval '1 month')
    group by 1
  ),
  bonus_months as (
    select date_trunc('month', b.bonus_date)::date as month_start, sum(greatest(0, round(coalesce(b.amount, 0)::numeric))) as legacy_paid_bonuses
    from public.employee_salary_bonuses b
    where b.accrues_to_salary is not true
      and b.bonus_date >= p_from and b.bonus_date < (p_to + interval '1 month')
    group by 1
  ),
  meal_months as (
    select date_trunc('month', m.business_date)::date as month_start, sum(greatest(0, round(coalesce(m.total_amount, 0)::numeric))) as employee_meals
    from public.employee_daily_meal_expenses m
    where m.business_date >= p_from and m.business_date < (p_to + interval '1 month')
    group by 1
  )
  select
    months.month_start,
    coalesce(o.cafe_income, 0)::bigint,
    coalesce(e.other_income, 0)::bigint,
    coalesce(e.investor_support, 0)::bigint,
    coalesce(e.recorded_expenses, 0)::bigint,
    coalesce(b.legacy_paid_bonuses, 0)::bigint,
    coalesce(m.employee_meals, 0)::bigint
  from months
  left join order_months o on o.month_start = months.month_start
  left join expense_months e on e.month_start = months.month_start
  left join bonus_months b on b.month_start = months.month_start
  left join meal_months m on m.month_start = months.month_start
  order by months.month_start;
$$;

revoke all on function public.accounting_month_components(date, date) from public, anon, authenticated;

-- The first month with sales or recorded entries: closing starts there.
create or replace function public.accounting_first_active_month()
returns date
language sql
security definer
stable
set search_path = public
as $$
  select least(
    (select date_trunc('month', timezone('Asia/Tashkent', min(coalesce(o.paid_at, o.created_at))))::date
       from public.orders o
      where o.status::text is distinct from 'cancelled'
        and o.payment_status::text is distinct from 'cancelled'
        and (o.paid_at is not null or o.payment_status::text = 'paid' or o.status::text in ('paid', 'completed'))),
    (select date_trunc('month', min(e.expense_date))::date from public.expenses e)
  );
$$;

revoke all on function public.accounting_first_active_month() from public, anon, authenticated;

create or replace function public.accounting_month_close_json(c public.accounting_month_closes)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'id', c.id,
    'month_start', c.month_start,
    'cafe_income', c.cafe_income,
    'other_income', c.other_income,
    'investor_support', c.investor_support,
    'recorded_expenses', c.recorded_expenses,
    'legacy_paid_bonuses', c.legacy_paid_bonuses,
    'employee_meals', c.employee_meals,
    'salary_earned', c.salary_earned,
    'salary_breakdown', c.salary_breakdown,
    'owner_profit', c.owner_profit,
    'settled_amount', c.settled_amount,
    'request_id', c.request_id,
    'closed_by_name', c.closed_by_name,
    'closed_at', c.closed_at
  );
$$;

revoke all on function public.accounting_month_close_json(public.accounting_month_closes) from public, anon, authenticated;

-- Closed months plus live components for every month not closed yet.
create or replace function public.get_accounting_owner_profit()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_today date := timezone('Asia/Tashkent', now())::date;
  v_current_month date := date_trunc('month', timezone('Asia/Tashkent', now()))::date;
  v_first_month date := public.accounting_first_active_month();
  v_last_closed date;
  v_open_from date;
begin
  if not public.current_staff_can_access_any(array['financial_analysis', 'expenses']) then
    raise exception 'Accounting access is required' using errcode = '42501';
  end if;

  select max(c.month_start) into v_last_closed from public.accounting_month_closes c;
  v_open_from := coalesce((v_last_closed + interval '1 month')::date, v_first_month, v_current_month);

  return jsonb_build_object(
    'today', v_today,
    'first_active_month', v_first_month,
    'closes', coalesce((
      select jsonb_agg(public.accounting_month_close_json(c) order by c.month_start)
      from public.accounting_month_closes c
    ), '[]'::jsonb),
    'open_months', coalesce((
      select jsonb_agg(jsonb_build_object(
        'month_start', m.month_start,
        'cafe_income', m.cafe_income,
        'other_income', m.other_income,
        'investor_support', m.investor_support,
        'recorded_expenses', m.recorded_expenses,
        'legacy_paid_bonuses', m.legacy_paid_bonuses,
        'employee_meals', m.employee_meals
      ) order by m.month_start)
      from public.accounting_month_components(v_open_from, v_current_month) m
      where v_open_from <= v_current_month
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_accounting_owner_profit() from public, anon, authenticated;
grant execute on function public.get_accounting_owner_profit() to authenticated;

-- Close the oldest open month. Expenses may be back-dated three days, so a
-- month can be closed from the 4th of the next month. A retry with the same
-- request id returns the saved close instead of failing.
create or replace function public.close_accounting_month(
  p_month_start date,
  p_salary_earned bigint,
  p_salary_breakdown jsonb,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  v_today date := timezone('Asia/Tashkent', now())::date;
  v_first_month date;
  v_existing public.accounting_month_closes;
  v_saved public.accounting_month_closes;
  v_components record;
  v_breakdown_total numeric;
  v_owner_profit bigint;
  v_name text;
begin
  if not public.is_owner() then
    raise exception 'owner_required' using errcode = '42501';
  end if;
  if p_request_id is null or p_month_start is null or p_salary_earned is null then
    raise exception 'invalid_month_close' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('accounting_month_close'));

  select * into v_existing from public.accounting_month_closes where request_id = p_request_id;
  if found then
    return public.accounting_month_close_json(v_existing);
  end if;

  if p_month_start <> date_trunc('month', p_month_start)::date then
    raise exception 'invalid_month_close' using errcode = '22023';
  end if;
  if exists (select 1 from public.accounting_month_closes where month_start = p_month_start) then
    raise exception 'month_already_closed' using errcode = 'P0001';
  end if;
  if v_today < ((p_month_start + interval '1 month')::date + 3) then
    raise exception 'month_not_finished' using errcode = 'P0001';
  end if;

  v_first_month := public.accounting_first_active_month();
  if v_first_month is null or p_month_start < v_first_month then
    raise exception 'month_has_no_activity' using errcode = 'P0001';
  end if;
  if p_month_start <> coalesce(
    (select (max(month_start) + interval '1 month')::date from public.accounting_month_closes),
    v_first_month
  ) then
    raise exception 'earlier_month_open' using errcode = 'P0001';
  end if;

  if jsonb_typeof(coalesce(p_salary_breakdown, 'null'::jsonb)) <> 'array' then
    raise exception 'salary_breakdown_mismatch' using errcode = '22023';
  end if;
  select coalesce(sum(round(coalesce((item ->> 'earned')::numeric, 0))), 0)
  into v_breakdown_total
  from jsonb_array_elements(p_salary_breakdown) item;
  if v_breakdown_total <> p_salary_earned then
    raise exception 'salary_breakdown_mismatch' using errcode = '22023';
  end if;

  -- Every KPI shift and employee-meal day must be finalized first, so nothing
  -- the daily cron writes later can land in a closed month. Without KPI rules
  -- or employees there is nothing to wait for ('infinity' empties the range).
  if exists (
    select 1
    from generate_series(
      greatest(p_month_start, coalesce((select min(rule.effective_from) from public.employee_kpi_rules rule), 'infinity'::date)),
      (p_month_start + interval '1 month' - interval '1 day')::date,
      interval '1 day'
    ) day
    where not exists (select 1 from public.employee_daily_kpi_runs run where run.business_date = day::date)
  ) then
    raise exception 'kpi_days_pending' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from generate_series(
      greatest(p_month_start, coalesce((select min(profile.joined_at) from public.employee_salary_profiles profile), 'infinity'::date)),
      (p_month_start + interval '1 month' - interval '1 day')::date,
      interval '1 day'
    ) day
    where not exists (select 1 from public.employee_daily_meal_expenses meal where meal.business_date = day::date)
  ) then
    raise exception 'meal_days_pending' using errcode = 'P0001';
  end if;

  select * into v_components from public.accounting_month_components(p_month_start, p_month_start);

  v_owner_profit := v_components.cafe_income + v_components.other_income
    - v_components.recorded_expenses - v_components.legacy_paid_bonuses
    - v_components.employee_meals - p_salary_earned;

  select coalesce(nullif(trim(p.full_name), ''), p.email) into v_name
  from public.profiles p where p.id = auth.uid();

  insert into public.accounting_month_closes (
    month_start, cafe_income, other_income, investor_support, recorded_expenses,
    legacy_paid_bonuses, employee_meals, salary_earned, salary_breakdown,
    owner_profit, settled_amount, request_id, closed_by, closed_by_name
  ) values (
    p_month_start, v_components.cafe_income, v_components.other_income, v_components.investor_support,
    v_components.recorded_expenses, v_components.legacy_paid_bonuses, v_components.employee_meals,
    p_salary_earned, p_salary_breakdown, v_owner_profit,
    v_owner_profit + v_components.investor_support, p_request_id, auth.uid(), v_name
  )
  returning * into v_saved;

  return public.accounting_month_close_json(v_saved);
end;
$$;

revoke all on function public.close_accounting_month(date, bigint, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.close_accounting_month(date, bigint, jsonb, uuid) to authenticated;

-- A close is frozen, so the records it was built from are frozen too: expense
-- and income entries, employee-meal snapshots, salary bonuses and fines dated
-- in a closed month can no longer be added, changed or deleted. Otherwise the
-- all-time remainder would drift away from what the closes settled.
create or replace function public.accounting_closed_through()
returns date
language sql
security definer
stable
set search_path = public
as $$
  select (max(c.month_start) + interval '1 month' - interval '1 day')::date
  from public.accounting_month_closes c;
$$;

revoke all on function public.accounting_closed_through() from public, anon, authenticated;

-- Trigger arguments: the row's business-date column, then every column that
-- feeds owner profit. An update touching none of them is always allowed, so
-- notes, payment methods and account-deletion actor clean-up keep working.
create or replace function public.guard_closed_accounting_month()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_closed_through date := public.accounting_closed_through();
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_old_date date := (v_old ->> tg_argv[0])::date;
  v_new_date date := (v_new ->> tg_argv[0])::date;
begin
  if v_closed_through is null then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and not exists (
    select 1 from unnest(tg_argv) as protected(column_name)
    where v_old -> protected.column_name is distinct from v_new -> protected.column_name
  ) then
    return new;
  end if;
  if v_old_date <= v_closed_through or v_new_date <= v_closed_through then
    raise exception 'accounting_month_closed: % is closed as owner profit and cannot change',
      to_char(least(coalesce(v_old_date, v_new_date), coalesce(v_new_date, v_old_date)), 'YYYY-MM')
      using errcode = '22007';
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function public.guard_closed_accounting_month() from public, anon, authenticated;

drop trigger if exists guard_closed_accounting_month on public.expenses;
create trigger guard_closed_accounting_month
  before insert or update or delete on public.expenses
  for each row execute function public.guard_closed_accounting_month('expense_date', 'amount', 'entry_type', 'category');

drop trigger if exists guard_closed_accounting_month on public.employee_daily_meal_expenses;
create trigger guard_closed_accounting_month
  before insert or update or delete on public.employee_daily_meal_expenses
  for each row execute function public.guard_closed_accounting_month('business_date', 'total_amount');

drop trigger if exists guard_closed_accounting_month on public.employee_salary_bonuses;
create trigger guard_closed_accounting_month
  before insert or update or delete on public.employee_salary_bonuses
  for each row execute function public.guard_closed_accounting_month('bonus_date', 'amount', 'accrues_to_salary', 'salary_profile_id');

drop trigger if exists guard_closed_accounting_month on public.employee_salary_fines;
create trigger guard_closed_accounting_month
  before insert or update or delete on public.employee_salary_fines
  for each row execute function public.guard_closed_accounting_month('fine_date', 'amount', 'salary_profile_id');

-- 177 plus closed months: what each close settled leaves the remainder.
create or replace function public.get_accounting_all_time_balance()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  cafe_income numeric := 0;
  recorded_income numeric := 0;
  recorded_expenses numeric := 0;
  salary_payments numeric := 0;
  legacy_paid_bonuses numeric := 0;
  employee_meals numeric := 0;
  owner_settled numeric := 0;
begin
  if not public.current_staff_can_access('expenses') then
    raise exception 'Accounting access is required' using errcode = '42501';
  end if;

  select coalesce(sum(greatest(0, round(coalesce(o.total, 0)::numeric))), 0)
  into cafe_income
  from public.orders o
  where o.status::text is distinct from 'cancelled'
    and o.payment_status::text is distinct from 'cancelled'
    and (
      o.paid_at is not null
      or (
        o.paid_at is null
        and (o.payment_status::text = 'paid' or o.status::text in ('paid', 'completed'))
      )
    );

  select
    coalesce(sum(greatest(0, round(coalesce(e.amount, 0)::numeric))) filter (where e.entry_type = 'income'), 0),
    coalesce(sum(greatest(0, round(coalesce(e.amount, 0)::numeric))) filter (where e.entry_type <> 'income'), 0)
  into recorded_income, recorded_expenses
  from public.expenses e;

  select coalesce(sum(greatest(0, round(coalesce(p.amount, 0)::numeric))), 0)
  into salary_payments
  from public.employee_salary_payments p;

  select coalesce(sum(greatest(0, round(coalesce(b.amount, 0)::numeric))), 0)
  into legacy_paid_bonuses
  from public.employee_salary_bonuses b
  where b.accrues_to_salary is not true;

  select coalesce(sum(greatest(0, round(coalesce(m.total_amount, 0)::numeric))), 0)
  into employee_meals
  from public.employee_daily_meal_expenses m;

  select coalesce(sum(c.settled_amount), 0)
  into owner_settled
  from public.accounting_month_closes c;

  return jsonb_build_object(
    'balance', cafe_income + recorded_income - recorded_expenses - salary_payments - legacy_paid_bonuses - employee_meals - owner_settled,
    'cafe_income', cafe_income,
    'recorded_income', recorded_income,
    'recorded_expenses', recorded_expenses,
    'salary_payments', salary_payments,
    'legacy_paid_bonuses', legacy_paid_bonuses,
    'employee_meals', employee_meals,
    'owner_settled', owner_settled
  );
end;
$$;

revoke all on function public.get_accounting_all_time_balance()
  from public, anon, authenticated;
grant execute on function public.get_accounting_all_time_balance()
  to authenticated;

commit;

notify pgrst, 'reload schema';
