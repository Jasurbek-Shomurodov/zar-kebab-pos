-- Owner profit Sankey: each month's recorded expenses by category, so the
-- flow can split spending the way Financial analysis does. Closed months are
-- locked by 257, so their live categories still add up to the frozen close.
-- Only the returned JSON grows; 257's contract is otherwise unchanged.

begin;
set local lock_timeout = '5s';

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
    ), '[]'::jsonb),
    'expense_categories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'month_start', grouped.month_start,
        'category', grouped.category,
        'amount', grouped.amount
      ) order by grouped.month_start, grouped.amount desc)
      from (
        select
          date_trunc('month', e.expense_date)::date as month_start,
          coalesce(e.category, 'other') as category,
          sum(greatest(0, round(coalesce(e.amount, 0)::numeric)))::bigint as amount
        from public.expenses e
        where e.entry_type <> 'income'
          and e.expense_date >= coalesce(v_first_month, v_current_month)
        group by 1, 2
      ) grouped
      where grouped.amount > 0
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_accounting_owner_profit() from public, anon, authenticated;
grant execute on function public.get_accounting_owner_profit() to authenticated;

commit;

notify pgrst, 'reload schema';
