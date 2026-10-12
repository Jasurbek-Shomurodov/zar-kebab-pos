-- Reports' accounting data in one round trip. Reports made eight requests
-- (each ~0.5-1.0 s of latency to Supabase) for the selected range's expenses,
-- staff meals and salary cash rows, and downloaded every salary payment, bonus,
-- rate and absence ever recorded. Reports only turns payments and bonuses
-- inside the range into cash rows, so only those are returned here.
--
-- Access matches the page's accounting section: Accounting ('expenses'), the
-- same feature RLS uses for these tables.

begin;

create or replace function public.get_reports_accounting(
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
    raise exception 'A valid Reports date range is required';
  end if;

  return jsonb_build_object(
    'expenses', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', e.id, 'entry_type', e.entry_type, 'expense_date', e.expense_date, 'category', e.category,
        'payment_method', e.payment_method, 'amount', e.amount, 'vendor', e.vendor,
        'description', e.description, 'created_at', e.created_at
      ) order by e.expense_date, e.id), '[]'::jsonb)
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
    ),
    'salary', jsonb_build_object(
      'profiles', (select coalesce(jsonb_agg(to_jsonb(sp) order by sp.id), '[]'::jsonb) from public.employee_salary_profiles sp),
      'payments', (
        select coalesce(jsonb_agg(to_jsonb(p) order by p.id), '[]'::jsonb)
        from public.employee_salary_payments p
        where p.paid_date between p_date_from and p_date_to
      ),
      'bonuses', (
        select coalesce(jsonb_agg(to_jsonb(b) order by b.id), '[]'::jsonb)
        from public.employee_salary_bonuses b
        where b.bonus_date between p_date_from and p_date_to
      ),
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

revoke all on function public.get_reports_accounting(date, date)
  from public, anon, authenticated;
grant execute on function public.get_reports_accounting(date, date)
  to authenticated;

commit;

notify pgrst, 'reload schema';
