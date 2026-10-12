-- Monthly estimate in one round trip (233). The page made twelve requests (each
-- ~0.5-0.8 s of latency to Supabase): selected-month and previous-month
-- expenses, staff meals and paid-order totals, plus the salary tables the
-- payroll forecast needs. This bundles them, reusing
-- get_accounting_paid_order_summary so sales keep the Accounting rules.
--
-- The salary forecast reads each employee's history from their start date
-- (rates, payments, bonuses, fines, absences), so those tables are returned in
-- full, exactly as the page loaded them before. Access matches the page:
-- Accounting plus Financial analysis (migration 230); the rows are the ones
-- those users could already read through RLS ('expenses').

begin;

create or replace function public.get_monthly_estimate(
  p_month_start date,
  p_month_end date,
  p_completed_sales_to date,
  p_previous_start date,
  p_previous_end date
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not (public.current_staff_can_access('expenses') and public.current_staff_can_access('financial_analysis')) then
    raise exception 'Financial analysis access is required' using errcode = '42501';
  end if;

  if p_month_start is null or p_month_end is null or p_month_start > p_month_end
    or p_previous_start is null or p_previous_end is null or p_previous_start > p_previous_end then
    raise exception 'Valid Monthly estimate date ranges are required';
  end if;

  return jsonb_build_object(
    'current', jsonb_build_object(
      'expenses', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', e.id, 'entry_type', e.entry_type, 'expense_date', e.expense_date, 'category', e.category,
          'payment_method', e.payment_method, 'amount', e.amount, 'vendor', e.vendor,
          'description', e.description, 'created_by', e.created_by, 'created_by_name', e.created_by_name,
          'created_at', e.created_at, 'updated_at', e.updated_at
        ) order by e.expense_date, e.id), '[]'::jsonb)
        from public.expenses e
        where e.expense_date between p_month_start and p_month_end
      ),
      'employee_meals', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'business_date', m.business_date, 'average_daily_amount', m.average_daily_amount,
          'present_employee_count', m.present_employee_count, 'total_amount', m.total_amount,
          'source_type', m.source_type, 'finalized_at', m.finalized_at, 'created_at', m.created_at
        ) order by m.business_date), '[]'::jsonb)
        from public.employee_daily_meal_expenses m
        where m.business_date between p_month_start and p_month_end
      ),
      -- Completed days only; today's sales come live from the POS state.
      'paid_order_summary', case
        when p_completed_sales_to is not null and p_completed_sales_to >= p_month_start
          then public.get_accounting_paid_order_summary(p_month_start, least(p_completed_sales_to, p_month_end))
      end
    ),
    'previous', jsonb_build_object(
      'expenses', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', e.id, 'entry_type', e.entry_type, 'expense_date', e.expense_date, 'category', e.category,
          'payment_method', e.payment_method, 'amount', e.amount, 'vendor', e.vendor,
          'description', e.description, 'created_by', e.created_by, 'created_by_name', e.created_by_name,
          'created_at', e.created_at, 'updated_at', e.updated_at
        ) order by e.expense_date, e.id), '[]'::jsonb)
        from public.expenses e
        where e.expense_date between p_previous_start and p_previous_end
      ),
      'employee_meals', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'business_date', m.business_date, 'average_daily_amount', m.average_daily_amount,
          'present_employee_count', m.present_employee_count, 'total_amount', m.total_amount,
          'source_type', m.source_type, 'finalized_at', m.finalized_at, 'created_at', m.created_at
        ) order by m.business_date), '[]'::jsonb)
        from public.employee_daily_meal_expenses m
        where m.business_date between p_previous_start and p_previous_end
      ),
      'paid_order_summary', public.get_accounting_paid_order_summary(p_previous_start, p_previous_end)
    ),
    'salary', jsonb_build_object(
      'profiles', (select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]'::jsonb) from public.employee_salary_profiles r),
      'rates', (select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]'::jsonb) from public.employee_salary_rates r),
      'payments', (select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]'::jsonb) from public.employee_salary_payments r),
      'bonuses', (select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]'::jsonb) from public.employee_salary_bonuses r),
      'fines', (select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]'::jsonb) from public.employee_salary_fines r),
      'absences', (select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]'::jsonb) from public.employee_salary_absences r),
      'team', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', pr.id, 'full_name', pr.full_name, 'email', pr.email, 'role', pr.role, 'status', pr.status
        ) order by pr.id), '[]'::jsonb)
        from public.profiles pr
        where pr.id in (select sp.profile_id from public.employee_salary_profiles sp where sp.profile_id is not null)
      )
    )
  );
end;
$$;

revoke all on function public.get_monthly_estimate(date, date, date, date, date)
  from public, anon, authenticated;
grant execute on function public.get_monthly_estimate(date, date, date, date, date)
  to authenticated;

commit;

notify pgrst, 'reload schema';
