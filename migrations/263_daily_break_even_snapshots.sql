-- Calculated daily break-even income.
--
-- The daily break-even target was typed in Settings. It is now worked out each
-- morning from the finished day, with the same figures as the Investor daily
-- payroll report: cafe income, cost of goods, accrued salary, KPI bonuses,
-- the day's share of rent and utilities, employee meals and the 4% soliq.
-- Break-even = fixed costs / (1 - cost-of-goods share - soliq rate).
--
-- The Telegram cron (service role) writes one immutable row per business date
-- and copies the latest result into business_settings, so the 260 trigger
-- keeps the target history. Apply before deploying the cron and Settings UI.

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

notify pgrst, 'reload schema';

commit;
