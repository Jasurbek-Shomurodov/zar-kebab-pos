-- Queue immutable, duplicate-safe Investor notifications when staff change an
-- employee's name, role or work start time. Mirrors the lifecycle queue (178):
-- the trigger records one before/after snapshot per real change, and the UI
-- requests delivery after its save succeeds.

begin;

create table if not exists public.employee_profile_change_investor_notification_deliveries (
  id                    uuid primary key default gen_random_uuid(),
  salary_profile_id     uuid not null references public.employee_salary_profiles(id) on delete cascade,
  name_before           text not null,
  name_after            text not null,
  job_function_before   text,
  job_function_after    text,
  work_start_before     time,
  work_start_after      time,
  actor_id              uuid references public.profiles(id) on delete set null,
  actor_name            text not null,
  target_key            text not null default 'salary_events',
  status                text not null default 'not_attempted'
                        check (status in ('not_attempted', 'pending', 'sent', 'failed', 'skipped')),
  telegram_chat_id      text,
  telegram_message_id   text,
  error_message         text not null default 'Notification request has not started',
  attempted_at          timestamptz,
  sent_at               timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.employee_profile_change_investor_notification_deliveries enable row level security;
revoke all on table public.employee_profile_change_investor_notification_deliveries from public, anon, authenticated;

create index if not exists idx_employee_profile_change_investor_delivery_profile
  on public.employee_profile_change_investor_notification_deliveries(salary_profile_id, actor_id, created_at desc);

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
     and new.work_start_time is not distinct from old.work_start_time then
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
after update of employee_name, job_function, work_start_time on public.employee_salary_profiles
for each row execute function public.queue_employee_profile_change_investor_notification();

commit;

notify pgrst, 'reload schema';
