-- Calculated daily break-even income.
--
-- The daily break-even target was typed in Settings. It is now worked out each
-- morning from the finished day, with the same figures as the Investor daily
-- payroll report: cafe income, cost of goods, accrued salary, KPI bonuses,
-- the day's share of rent and utilities, employee meals and the 4% soliq.
-- Break-even = fixed costs / (1 - cost-of-goods share - soliq rate).
--
-- The Telegram cron (service role) writes one immutable row per business date,
-- then apply_daily_break_even() dates that day's target on the day itself in
-- the 260 history (charts average a period's daily targets) and makes the
-- newest day the current Settings value without a second, today-dated
-- history row. Apply before deploying the cron and Settings UI.

begin;
set local lock_timeout = '5s';

create table if not exists public.daily_break_even_snapshots (
  business_date date primary key,
  cafe_income_uzs bigint not null check (cafe_income_uzs >= 0),
  cost_of_goods_uzs bigint,
  salary_uzs bigint not null default 0 check (salary_uzs >= 0),
  kpi_bonus_uzs bigint not null default 0 check (kpi_bonus_uzs >= 0),
  rent_uzs bigint not null default 0 check (rent_uzs >= 0),
  utilities_uzs bigint not null default 0 check (utilities_uzs >= 0),
  employee_meal_count integer not null default 0 check (employee_meal_count >= 0),
  employee_meal_per_employee_uzs bigint not null default 0 check (employee_meal_per_employee_uzs >= 0),
  employee_meal_uzs bigint not null default 0 check (employee_meal_uzs >= 0),
  tax_rate_pct numeric(5,2) not null default 4 check (tax_rate_pct >= 0),
  tax_uzs bigint not null default 0 check (tax_uzs >= 0),
  net_profit_uzs bigint,
  fixed_costs_uzs bigint not null default 0 check (fixed_costs_uzs >= 0),
  break_even_income_uzs bigint check (break_even_income_uzs is null or break_even_income_uzs >= 0),
  calculated_at timestamptz not null default now()
);

comment on table public.daily_break_even_snapshots is
  'One immutable row per finished business date: the figures the daily break-even income was calculated from.';

alter table public.daily_break_even_snapshots enable row level security;

drop policy if exists "feature_access_read_daily_break_even_snapshots" on public.daily_break_even_snapshots;
create policy "feature_access_read_daily_break_even_snapshots"
  on public.daily_break_even_snapshots for select
  to authenticated
  using (public.current_staff_can_access_any(array['financial_analysis','expenses','settings']));

-- Writes only come from the service-role cron.
revoke all on public.daily_break_even_snapshots from anon;
revoke insert, update, delete on public.daily_break_even_snapshots from authenticated;
grant select on public.daily_break_even_snapshots to authenticated;

-- Manual saves still record from the day they are made; the cron's settings
-- update skips that because it already dated the target on its own day.
create or replace function public.record_break_even_target_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
    and new.average_daily_break_even_income_uzs is not distinct from old.average_daily_break_even_income_uzs then
    return new;
  end if;
  if coalesce(current_setting('zar.break_even_from_snapshot', true), '') = 'on' then
    return new;
  end if;
  insert into public.business_break_even_target_history (effective_from, amount_uzs, changed_by, changed_at)
  values (timezone('Asia/Tashkent', now())::date, new.average_daily_break_even_income_uzs, auth.uid(), now())
  on conflict (effective_from) do update
    set amount_uzs = excluded.amount_uzs,
        changed_by = excluded.changed_by,
        changed_at = excluded.changed_at;
  return new;
end;
$$;

create or replace function public.apply_daily_break_even(p_business_date date)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount bigint;
begin
  select break_even_income_uzs into v_amount
  from public.daily_break_even_snapshots
  where business_date = p_business_date;
  if v_amount is null then
    return null;
  end if;

  insert into public.business_break_even_target_history (effective_from, amount_uzs, changed_by, changed_at)
  values (p_business_date, v_amount, null, now())
  on conflict (effective_from) do update
    set amount_uzs = excluded.amount_uzs,
        changed_by = null,
        changed_at = excluded.changed_at;

  if p_business_date = (select max(business_date) from public.daily_break_even_snapshots where break_even_income_uzs is not null) then
    perform set_config('zar.break_even_from_snapshot', 'on', true);
    update public.business_settings
    set average_daily_break_even_income_uzs = v_amount,
        updated_at = now()
    where id = 'default'
      and average_daily_break_even_income_uzs is distinct from v_amount;
    perform set_config('zar.break_even_from_snapshot', 'off', true);
  end if;
  return v_amount;
end;
$$;

revoke all on function public.apply_daily_break_even(date) from public, anon, authenticated;
grant execute on function public.apply_daily_break_even(date) to service_role;

notify pgrst, 'reload schema';

commit;
