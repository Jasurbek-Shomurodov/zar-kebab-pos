-- Attendance check-in goes live on 2026-10-15 (Tashkent). The webhook answers
-- earlier scans with a "starts on 15 October" reply; this trigger is the
-- backstop so no check-in can be stored for an earlier business date.
-- Keep in sync with ATTENDANCE_START_DATE in src/lib/attendance.js.

create or replace function public.enforce_attendance_start_date()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.business_date < date '2026-10-15' then
    raise exception 'attendance_not_started'
      using errcode = 'P0001',
            hint = 'Attendance check-in starts on 2026-10-15.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_attendance_start_date on public.employee_attendance_checkins;
create trigger trg_attendance_start_date
  before insert or update of business_date on public.employee_attendance_checkins
  for each row execute function public.enforce_attendance_start_date();

