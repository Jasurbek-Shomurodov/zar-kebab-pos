-- A new employee can only be added after their Telegram account is linked.
--
-- Flow ("link first, then create"):
--   1. Salaries creates a registration token (30 minutes) and shows
--      t.me/<bot>?start=employee_<token>.
--   2. The employee presses Start; the webhook (service role) records their
--      Telegram user/chat on the registration.
--   3. Salaries polls the registration and, once linked, calls
--      create_employee_salary_profile_with_telegram(), which inserts the
--      profile, first rate and Telegram link in one transaction.
-- A deferred constraint trigger rejects any new salary profile that has no
-- linked Telegram row at commit, so a direct insert cannot bypass the rule.
-- Existing employees are unaffected (insert-only check).
begin;
set local lock_timeout = '5s';

create table if not exists public.employee_telegram_registrations (
  token             uuid primary key default gen_random_uuid(),
  telegram_user_id  text,
  chat_id           text,
  username          text not null default '',
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null default now() + interval '30 minutes',
  linked_at         timestamptz,
  consumed_at       timestamptz,
  salary_profile_id uuid references public.employee_salary_profiles(id) on delete set null
);

create index if not exists idx_employee_telegram_registrations_user
  on public.employee_telegram_registrations(telegram_user_id)
  where telegram_user_id is not null;

alter table public.employee_telegram_registrations enable row level security;
revoke all on table public.employee_telegram_registrations from public, anon, authenticated;

create or replace function public.create_employee_telegram_registration()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid := gen_random_uuid();
begin
  if not public.current_staff_can_write('expenses') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  insert into public.employee_telegram_registrations (token, created_by)
  values (v_token, auth.uid());

  return v_token::text;
end;
$$;

revoke all on function public.create_employee_telegram_registration() from public, anon;
grant execute on function public.create_employee_telegram_registration() to authenticated;

create or replace function public.get_employee_telegram_registration(p_token uuid)
returns table (status text, username text, linked_at timestamptz, expires_at timestamptz, salary_profile_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.current_staff_can_write('expenses') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  return query
    select
      case
        when r.consumed_at is not null then 'consumed'
        when r.linked_at is not null then 'linked'
        when r.expires_at <= now() then 'expired'
        else 'pending'
      end,
      r.username,
      r.linked_at,
      r.expires_at,
      r.salary_profile_id
    from public.employee_telegram_registrations r
    where r.token = p_token;
end;
$$;

revoke all on function public.get_employee_telegram_registration(uuid) from public, anon;
grant execute on function public.get_employee_telegram_registration(uuid) to authenticated;

-- Idempotent per token: replaying a consumed token returns the profile it
-- created, so a timed-out request can be reconciled without a duplicate.
create or replace function public.create_employee_salary_profile_with_telegram(
  p_token          uuid,
  p_employee_name  text,
  p_job_function   text,
  p_joined_at      date,
  p_payment_method text,
  p_amount         integer,
  p_rate_unit      text,
  p_daily_amount   integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registration public.employee_telegram_registrations;
  v_profile_id   uuid;
  v_name         text := btrim(coalesce(p_employee_name, ''));
begin
  if not public.current_staff_can_write('expenses') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  select * into v_registration
  from public.employee_telegram_registrations
  where token = p_token
  for update;

  if not found then
    raise exception 'employee_telegram_registration_not_found';
  end if;

  if v_registration.consumed_at is not null then
    if v_registration.salary_profile_id is null then
      raise exception 'employee_telegram_registration_consumed';
    end if;
    return v_registration.salary_profile_id;
  end if;

  if v_registration.linked_at is null or v_registration.telegram_user_id is null or v_registration.chat_id is null then
    raise exception 'employee_telegram_not_linked';
  end if;

  if v_name = '' or p_joined_at is null or coalesce(p_amount, 0) <= 0 then
    raise exception 'employee_details_invalid';
  end if;

  -- An archived employee's link may move to the new profile; anyone else
  -- keeps it, because one Telegram account identifies one employee.
  delete from public.employee_salary_telegram_links link
  using public.employee_salary_profiles salary_profile
  where salary_profile.id = link.salary_profile_id
    and salary_profile.deleted_at is not null
    and (link.telegram_user_id = v_registration.telegram_user_id or link.chat_id = v_registration.chat_id);

  if exists (
    select 1 from public.employee_salary_telegram_links link
    where link.telegram_user_id = v_registration.telegram_user_id
       or link.chat_id = v_registration.chat_id
  ) then
    raise exception 'employee_telegram_already_linked';
  end if;

  insert into public.employee_salary_profiles (
    profile_id, employee_name, job_function, joined_at, pay_schedule, payment_method, created_by
  ) values (
    null, v_name, p_job_function, p_joined_at, 'monthly', coalesce(p_payment_method, 'cash'), auth.uid()
  )
  returning id into v_profile_id;

  insert into public.employee_salary_rates (
    salary_profile_id, effective_from, amount, rate_unit, daily_amount, note, created_by
  ) values (
    v_profile_id, p_joined_at, p_amount, coalesce(p_rate_unit, 'daily'), p_daily_amount, '', auth.uid()
  );

  insert into public.employee_salary_telegram_links (
    salary_profile_id, telegram_user_id, chat_id, username, preferred_language,
    notifications_enabled, linked_at, updated_at
  ) values (
    v_profile_id, v_registration.telegram_user_id, v_registration.chat_id, v_registration.username, 'ru',
    true, v_registration.linked_at, now()
  );

  update public.employee_telegram_registrations
  set consumed_at = now(), salary_profile_id = v_profile_id
  where token = p_token;

  return v_profile_id;
end;
$$;

revoke all on function public.create_employee_salary_profile_with_telegram(uuid, text, text, date, text, integer, text, integer) from public, anon;
grant execute on function public.create_employee_salary_profile_with_telegram(uuid, text, text, date, text, integer, text, integer) to authenticated;

create or replace function public.require_employee_salary_profile_telegram()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.employee_salary_telegram_links link
    where link.salary_profile_id = new.id
      and link.linked_at is not null
      and link.telegram_user_id is not null
  ) then
    raise exception 'employee_telegram_not_linked'
      using errcode = '23514', detail = 'A new employee needs a linked Telegram account.';
  end if;
  return null;
end;
$$;

revoke all on function public.require_employee_salary_profile_telegram() from public, anon, authenticated;

drop trigger if exists require_employee_salary_profile_telegram_trigger
  on public.employee_salary_profiles;
create constraint trigger require_employee_salary_profile_telegram_trigger
after insert on public.employee_salary_profiles
deferrable initially deferred
for each row execute function public.require_employee_salary_profile_telegram();

commit;

notify pgrst, 'reload schema';
