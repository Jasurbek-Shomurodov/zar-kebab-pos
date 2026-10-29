-- Late QR check-ins fine the employee automatically.
--
-- From 2026-10-30 (Tashkent) a first check-in that arrives after the snapshot
-- work start fines the employee: under one hour late 20 000 UZS, one hour or
-- more 50 000 UZS. The fine is created in the same transaction as the check-in
-- row (one fine per check-in, unique source), so a retried webhook or a
-- duplicate scan can never fine twice, and the amount is frozen like any fine.
--
-- created_by stays null (system author). Such fines still queue the Salary
-- and Team announcements; the private notice is skipped because the check-in
-- reply already tells the employee about the fine.
begin;
set local lock_timeout = '5s';

alter table public.employee_salary_fines
  add column if not exists source_type text,
  add column if not exists source_checkin_id uuid
    references public.employee_attendance_checkins(id) on delete set null;

alter table public.employee_salary_fines
  drop constraint if exists employee_salary_fines_source_type_check;
alter table public.employee_salary_fines
  add constraint employee_salary_fines_source_type_check
  check (source_type is null or source_type = 'late_checkin');

create unique index if not exists idx_employee_salary_fines_source_checkin
  on public.employee_salary_fines(source_checkin_id)
  where source_checkin_id is not null;

create or replace function public.late_checkin_fine_amount(p_minutes_late integer)
returns integer
language sql
immutable
as $$
  select case
    when p_minutes_late is null or p_minutes_late <= 0 then 0
    when p_minutes_late < 60 then 20000
    else 50000
  end
$$;

create or replace function public.record_late_checkin_fine()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount integer := public.late_checkin_fine_amount(new.minutes_late);
  v_hours integer := coalesce(new.minutes_late, 0) / 60;
  v_minutes integer := coalesce(new.minutes_late, 0) % 60;
  v_duration text;
begin
  if new.arrival_status <> 'late'
    or v_amount <= 0
    or new.business_date < date '2026-10-30'
    or exists (
      select 1 from public.employee_salary_profiles salary_profile
      where salary_profile.id = new.salary_profile_id
        and coalesce(salary_profile.works_remotely, false)
    )
  then
    return new;
  end if;

  v_duration := case
    when v_hours = 0 then v_minutes || ' мин'
    when v_minutes = 0 then v_hours || ' ч'
    else v_hours || ' ч ' || v_minutes || ' мин'
  end;

  insert into public.employee_salary_fines (
    salary_profile_id, fine_date, amount, reason,
    created_by, created_by_name, source_type, source_checkin_id
  ) values (
    new.salary_profile_id,
    new.business_date,
    v_amount,
    'Опоздание на ' || v_duration
      || ' (начало смены ' || to_char(new.scheduled_start_time, 'HH24:MI')
      || ', приход ' || to_char(timezone('Asia/Tashkent', new.checked_in_at), 'HH24:MI') || ')',
    null,
    'Система',
    'late_checkin',
    new.id
  )
  on conflict (source_checkin_id) where source_checkin_id is not null do nothing;

  return new;
end;
$$;

revoke all on function public.record_late_checkin_fine() from public, anon, authenticated;

drop trigger if exists record_late_checkin_fine_trigger on public.employee_attendance_checkins;
create trigger record_late_checkin_fine_trigger
after insert on public.employee_attendance_checkins
for each row execute function public.record_late_checkin_fine();

-- 172's queue function plus automatic late fines: Salary group and Team are
-- queued, the private notice is covered by the check-in reply.
create or replace function public.queue_salary_event_telegram_delivery()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_automatic_kpi boolean := tg_argv[0] = 'bonus'
    and coalesce(to_jsonb(new) ->> 'source_type', '') = 'daily_kpi';
  is_late_checkin_fine boolean := tg_argv[0] = 'fine'
    and coalesce(to_jsonb(new) ->> 'source_type', '') = 'late_checkin';
begin
  if new.created_by is null and not is_automatic_kpi and not is_late_checkin_fine then
    return new;
  end if;

  insert into public.employee_salary_group_notification_deliveries (
    event_type, event_id, salary_profile_id,
    status, error_message, attempted_at,
    employee_status, employee_error_message, employee_attempted_at,
    team_status, team_error_message, team_attempted_at
  ) values (
    tg_argv[0], new.id, new.salary_profile_id,
    case when is_automatic_kpi then 'skipped' else 'not_attempted' end,
    case when is_automatic_kpi
      then 'Automatic KPI details are sent only to ZarKebab Team'
      else 'Notification request has not started' end,
    new.created_at,
    case when is_automatic_kpi or is_late_checkin_fine then 'skipped' else 'not_attempted' end,
    case
      when is_automatic_kpi then 'Automatic KPI is included in the combined daily salary summary'
      when is_late_checkin_fine then 'Late fine is included in the check-in reply'
      else 'Notification request has not started' end,
    new.created_at,
    case when tg_argv[0] in ('bonus', 'fine', 'absence')
      then 'not_attempted' else 'skipped' end,
    case when tg_argv[0] in ('bonus', 'fine', 'absence')
      then 'Notification request has not started'
      else 'ZarKebab Team delivery does not apply to this salary event' end,
    new.created_at
  )
  on conflict (event_type, event_id) do nothing;

  return new;
end;
$$;

revoke all on function public.queue_salary_event_telegram_delivery()
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
