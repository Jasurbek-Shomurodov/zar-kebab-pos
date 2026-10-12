-- Financial analysis in one round trip. The page used to make about eleven
-- requests (each ~0.5 s of network latency to Supabase) before it could render:
-- expenses, staff meals and paid-order totals for two periods, salary
-- payments/bonuses, the all-time balance, and the growth band. This bundles
-- them, reusing the existing functions so every total keeps its current rules.
--
-- Access: Accounting plus Financial analysis (migration 230). The rows returned
-- are the same ones those users could already read through RLS ('expenses').
-- Growth sales come from the Dashboard functions, so they are included only
-- for users who also have Dashboard access; otherwise they are null.

begin;

create or replace function public.get_financial_analysis(
  p_date_from date,
  p_date_to date,
  p_previous_from date,
  p_previous_to date,
  p_include_growth boolean default true
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_month_start date := date_trunc('month', timezone('Asia/Tashkent', now()))::date;
  v_salary_from date;
  v_salary_to date;
  v_growth jsonb := null;
begin
  if not (public.current_staff_can_access('expenses') and public.current_staff_can_access('financial_analysis')) then
    raise exception 'Financial analysis access is required' using errcode = '42501';
  end if;

  if p_date_from is null or p_date_to is null or p_date_from > p_date_to
    or p_previous_from is null or p_previous_to is null or p_previous_from > p_previous_to then
    raise exception 'Valid Financial analysis date ranges are required';
  end if;

  v_salary_from := least(p_date_from, p_previous_from);
  v_salary_to := greatest(p_date_to, p_previous_to);

  if p_include_growth then
    v_growth := jsonb_build_object(
      'monthly_income', case when public.current_staff_can_access('dashboard') then (
        select coalesce(jsonb_agg(to_jsonb(month_row) order by month_row.month_start), '[]'::jsonb)
        from public.get_dashboard_monthly_average_income(13) month_row
      ) end,
      'ten_day_income', case when public.current_staff_can_access('dashboard') then (
        select coalesce(jsonb_agg(to_jsonb(period_row) order by period_row.week_start), '[]'::jsonb)
        from public.get_dashboard_recent_period_income(v_month_start) period_row
      ) end,
      'cashflow', public.get_accounting_monthly_cashflow(13)
    );
  end if;

  return jsonb_build_object(
    'current', jsonb_build_object(
      'paid_order_summary', public.get_accounting_paid_order_summary(p_date_from, p_date_to),
      'expenses', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', e.id, 'entry_type', e.entry_type, 'expense_date', e.expense_date, 'category', e.category,
          'payment_method', e.payment_method, 'amount', e.amount, 'vendor', e.vendor,
          'description', e.description, 'created_at', e.created_at
        ) order by e.id), '[]'::jsonb)
        from public.expenses e
        where e.expense_date between p_date_from and p_date_to
      ),
      'employee_meals', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'business_date', m.business_date, 'average_daily_amount', m.average_daily_amount,
          'present_employee_count', m.present_employee_count, 'total_amount', m.total_amount,
          'source_type', m.source_type, 'finalized_at', m.finalized_at, 'created_at', m.created_at
        ) order by m.business_date), '[]'::jsonb)
        from public.employee_daily_meal_expenses m
        where m.business_date between p_date_from and p_date_to
      )
    ),
    'previous', jsonb_build_object(
      'paid_order_summary', public.get_accounting_paid_order_summary(p_previous_from, p_previous_to),
      'expenses', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', e.id, 'entry_type', e.entry_type, 'expense_date', e.expense_date, 'category', e.category,
          'payment_method', e.payment_method, 'amount', e.amount, 'vendor', e.vendor,
          'description', e.description, 'created_at', e.created_at
        ) order by e.id), '[]'::jsonb)
        from public.expenses e
        where e.expense_date between p_previous_from and p_previous_to
      ),
      'employee_meals', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'business_date', m.business_date, 'average_daily_amount', m.average_daily_amount,
          'present_employee_count', m.present_employee_count, 'total_amount', m.total_amount,
          'source_type', m.source_type, 'finalized_at', m.finalized_at, 'created_at', m.created_at
        ) order by m.business_date), '[]'::jsonb)
        from public.employee_daily_meal_expenses m
        where m.business_date between p_previous_from and p_previous_to
      )
    ),
    -- Only payments and bonuses become cash rows; rates, fines and absences stay
    -- on the payroll pages.
    'salary', jsonb_build_object(
      'profiles', (
        select coalesce(jsonb_agg(to_jsonb(sp) order by sp.id), '[]'::jsonb)
        from public.employee_salary_profiles sp
      ),
      'payments', (
        select coalesce(jsonb_agg(to_jsonb(p) order by p.id), '[]'::jsonb)
        from public.employee_salary_payments p
        where p.paid_date between v_salary_from and v_salary_to
      ),
      'bonuses', (
        select coalesce(jsonb_agg(to_jsonb(b) order by b.id), '[]'::jsonb)
        from public.employee_salary_bonuses b
        where b.bonus_date between v_salary_from and v_salary_to
      ),
      'team', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', pr.id, 'full_name', pr.full_name, 'email', pr.email, 'role', pr.role, 'status', pr.status
        ) order by pr.id), '[]'::jsonb)
        from public.profiles pr
        where pr.id in (select sp.profile_id from public.employee_salary_profiles sp where sp.profile_id is not null)
      )
    ),
    'all_time_balance', (public.get_accounting_all_time_balance() ->> 'balance')::numeric,
    'growth', v_growth
  );
end;
$$;

revoke all on function public.get_financial_analysis(date, date, date, date, boolean)
  from public, anon, authenticated;
grant execute on function public.get_financial_analysis(date, date, date, date, boolean)
  to authenticated;

commit;

notify pgrst, 'reload schema';
