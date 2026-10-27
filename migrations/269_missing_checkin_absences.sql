-- No QR check-in means no work that day: no daily salary and no KPI.
--
-- KPI already skips a day without a check-in (254). Daily salary is computed
-- from the absence ledger by every reader (Telegram calendars, Salaries,
-- Employees, Reports, Expenses, Owner profit, month SQL), so the day close
-- records the missing check-in as an absence instead of each reader learning
-- the attendance rule. One durable record keeps every balance identical.
--
-- Called by the daily-salary cron after the shift ends (04:00 the next day),
-- before the meal snapshot and KPI finalization. Remote employees never scan
-- and keep their pay. created_by stays null, so no Telegram absence notice is
-- queued. Existing absences win (unique profile/date).
begin;
set local lock_timeout = '5s';

create or replace function public.record_missing_checkin_absences(p_business_date date)
returns table (salary_profile_id uuid, absence_id uuid)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  -- Attendance starts 2026-10-15 (249); a shift is open until 04:00 next day.
  if p_business_date is null
    or p_business_date < date '2026-10-15'
    or timezone('Asia/Tashkent', now()) < (p_business_date + 1) + time '04:00'
  then
    return;
  end if;

  return query
  insert into public.employee_salary_absences as absence (salary_profile_id, absence_date, note)
  select salary_profile.id, p_business_date, 'No QR check-in'
  from public.employee_salary_profiles salary_profile
  where salary_profile.joined_at <= p_business_date
    and (salary_profile.ended_at is null or salary_profile.ended_at >= p_business_date)
    and not (salary_profile.is_active = false and salary_profile.ended_at is null)
    and (
      salary_profile.deleted_at is null
      or (timezone('Asia/Tashkent', salary_profile.deleted_at))::date > p_business_date
      or salary_profile.ended_at = p_business_date
    )
    and not coalesce(salary_profile.works_remotely, false)
    and not exists (
      select 1 from public.employee_attendance_checkins checkin
      where checkin.salary_profile_id = salary_profile.id
        and checkin.business_date = p_business_date
    )
  on conflict (salary_profile_id, absence_date) do nothing
  returning absence.salary_profile_id, absence.id;
end;
$$;

revoke all on function public.record_missing_checkin_absences(date) from public, anon, authenticated;
grant execute on function public.record_missing_checkin_absences(date) to service_role;

commit;
