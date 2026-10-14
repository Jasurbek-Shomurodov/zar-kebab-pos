-- Daily attendance check-ins. One printed restaurant QR opens the Telegram bot
-- with /start checkin; the webhook identifies the employee from their linked
-- salary Telegram account and records the first scan per Tashkent date.
-- Tracking only: check-ins never create fines, bonuses, or absences.

alter table public.employee_salary_profiles
  add column if not exists work_start_time time;

create table if not exists public.employee_attendance_checkins (
  id                   uuid primary key default gen_random_uuid(),
  salary_profile_id    uuid not null references public.employee_salary_profiles(id) on delete cascade,
  business_date        date not null,
  checked_in_at        timestamptz not null default now(),
  -- Snapshot of the schedule at scan time; later start-time edits never rewrite history.
  scheduled_start_time time,
  minutes_late         integer,
  arrival_status       text not null
                       check (arrival_status in ('early', 'on_time', 'late', 'no_schedule')),
  telegram_user_id     text not null default '',
  created_at           timestamptz not null default now(),
  unique (salary_profile_id, business_date),
  check (
    (arrival_status = 'no_schedule' and scheduled_start_time is null and minutes_late is null)
    or (arrival_status <> 'no_schedule' and scheduled_start_time is not null and minutes_late is not null)
  )
);

create index if not exists idx_employee_attendance_checkins_date
  on public.employee_attendance_checkins(business_date desc);

alter table public.employee_attendance_checkins enable row level security;

drop policy if exists "expenses_read_employee_attendance_checkins"
  on public.employee_attendance_checkins;
create policy "expenses_read_employee_attendance_checkins"
  on public.employee_attendance_checkins for select
  to authenticated
  using (public.current_staff_can_access('expenses'));

-- Only the service-role webhook writes check-ins.
revoke all on table public.employee_attendance_checkins from public, anon, authenticated;
grant select on table public.employee_attendance_checkins to authenticated;

notify pgrst, 'reload schema';
