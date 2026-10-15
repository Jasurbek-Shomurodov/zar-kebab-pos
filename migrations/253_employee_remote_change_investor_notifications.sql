-- Switching an employee to or from Remote (252) is a profile change too: the
-- Investor group hears about it like a name, role or work start edit (250).
-- The before/after flags are nullable so events recorded before this
-- migration keep rendering without a Remote line.

begin;

alter table public.employee_profile_change_investor_notification_deliveries
  add column if not exists works_remotely_before boolean,
  add column if not exists works_remotely_after boolean;

create or replace function public.queue_employee_profile_change_investor_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
begin
  -- Service and migration writes have no staff identity and must not create alerts.
  if v_actor_id is null or new.deleted_at is not null then
    return new;
  end if;

  if new.employee_name is not distinct from old.employee_name
     and new.job_function is not distinct from old.job_function
     and new.work_start_time is not distinct from old.work_start_time
     and new.works_remotely is not distinct from old.works_remotely then
    return new;
  end if;

  select coalesce(nullif(btrim(full_name), ''), nullif(btrim(email), ''), 'Система')
    into v_actor_name
  from public.profiles
  where id = v_actor_id;

  insert into public.employee_profile_change_investor_notification_deliveries (
    salary_profile_id,
    name_before,
    name_after,
    job_function_before,
    job_function_after,
    work_start_before,
    work_start_after,
    works_remotely_before,
    works_remotely_after,
    actor_id,
    actor_name
  ) values (
    new.id,
    coalesce(nullif(btrim(old.employee_name), ''), 'Без имени'),
    coalesce(nullif(btrim(new.employee_name), ''), 'Без имени'),
    old.job_function,
    new.job_function,
    old.work_start_time,
    new.work_start_time,
    old.works_remotely,
    new.works_remotely,
    v_actor_id,
    coalesce(v_actor_name, 'Система')
  );

  return new;
end;
$$;

revoke all on function public.queue_employee_profile_change_investor_notification()
  from public, anon, authenticated;

drop trigger if exists queue_employee_profile_change_investor_notification_trigger
  on public.employee_salary_profiles;
create trigger queue_employee_profile_change_investor_notification_trigger
after update of employee_name, job_function, work_start_time, works_remotely on public.employee_salary_profiles
for each row execute function public.queue_employee_profile_change_investor_notification();

notify pgrst, 'reload schema';

commit;
