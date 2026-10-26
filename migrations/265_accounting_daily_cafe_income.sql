-- Cafe income for each day of a period.
--
-- Financial analysis' Daily spending chart draws average daily income as a
-- running average (income so far / days so far) so the owner can see how the
-- month is going, not one flat line. Each day reuses
-- get_accounting_paid_order_summary, so every figure keeps the Accounting
-- rules (cafe income only, loyalty excluded, Tashkent business days).
-- Apply before deploying the chart; without it the chart keeps the flat line.

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
      'date', day::date,
      'cafe_income', coalesce((public.get_accounting_paid_order_summary(day::date, day::date)->>'cafe_income')::numeric, 0)
    ) order by day), '[]'::jsonb)
    from generate_series(p_date_from, p_date_to, interval '1 day') day
  );
end;
$$;

revoke all on function public.get_accounting_daily_cafe_income(date, date)
  from public, anon, authenticated;
grant execute on function public.get_accounting_daily_cafe_income(date, date)
  to authenticated;

notify pgrst, 'reload schema';

commit;
