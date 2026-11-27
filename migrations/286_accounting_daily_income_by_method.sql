-- Cafe income for each day of a period, split by payment method.
--
-- Financial analysis' Daily income chart stacks each day's cafe income by
-- payment method (cash, card, terminal/QR, paid from salary). Same function
-- and signature as migration 265; each row now also carries the day's
-- payment_method_income from get_accounting_paid_order_summary, so every
-- figure keeps the Accounting rules (cafe income only, loyalty kept apart,
-- Tashkent business days). The summary still runs once per day.
-- Apply before deploying the chart; without it the chart shows unsplit bars.

begin;
set local lock_timeout = '5s';

create or replace function public.get_accounting_daily_cafe_income(
  p_date_from date,
  p_date_to date
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.current_staff_can_access('expenses') then
    raise exception 'Accounting access is required' using errcode = '42501';
  end if;

  if p_date_from is null or p_date_to is null or p_date_from > p_date_to then
    raise exception 'A valid Accounting date range is required';
  end if;

  if p_date_to - p_date_from > 400 then
    raise exception 'Daily cafe income covers at most 400 days';
  end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'date', days.day::date,
      'cafe_income', coalesce((day_summary.summary->>'cafe_income')::numeric, 0),
      'payment_method_income', coalesce(day_summary.summary->'payment_method_income', '{}'::jsonb)
    ) order by days.day), '[]'::jsonb)
    from generate_series(p_date_from, p_date_to, interval '1 day') as days(day)
    cross join lateral (
      select public.get_accounting_paid_order_summary(days.day::date, days.day::date) as summary
    ) as day_summary
  );
end;
$$;

revoke all on function public.get_accounting_daily_cafe_income(date, date)
  from public, anon, authenticated;
grant execute on function public.get_accounting_daily_cafe_income(date, date)
  to authenticated;

notify pgrst, 'reload schema';

commit;
