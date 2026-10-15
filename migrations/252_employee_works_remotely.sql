-- Remote employees do not scan the attendance QR. The Employees page leaves
-- them out of "Checked in today" and never marks them "Not checked in"; their
-- daily pay always counts toward the checked-in daily total.
alter table public.employee_salary_profiles
  add column if not exists works_remotely boolean not null default false;
