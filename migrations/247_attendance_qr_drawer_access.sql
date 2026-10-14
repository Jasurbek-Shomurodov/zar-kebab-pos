-- Check-in QR in the drawer for accounts selected in Settings, 15 s codes.
--
-- Replaces the 245 Dashboard card (any Accounting writer, any time) with an
-- explicit account list: each selected account sees the drawer QR only inside
-- its own daily Tashkent window, and the database refuses codes outside it.
-- Codes now rotate every 15 seconds for the drawer and the entrance screen:
--   ci_<code>_<slot>_<sig>   (slot = floor(epoch / 15))
-- and stay acceptable for about two minutes, as before. The retired
-- 'dashboard' signer is revoked, so its codes stop verifying.
begin;
set local lock_timeout = '5s';

alter table public.attendance_kiosks drop constraint if exists attendance_kiosks_kind_check;
alter table public.attendance_kiosks
  add constraint attendance_kiosks_kind_check check (kind in ('screen', 'dashboard', 'staff'));
update public.attendance_kiosks set revoked_at = now() where kind = 'dashboard' and revoked_at is null;
drop function if exists public.get_attendance_dashboard_token();

-- start = end means all day; end < start wraps past midnight.
create table if not exists public.attendance_qr_access (
  profile_id  uuid primary key references public.profiles(id) on delete cascade,
  start_time  time not null,
  end_time    time not null,
  updated_by  uuid,
  updated_at  timestamptz not null default now()
);

alter table public.attendance_qr_access enable row level security;
revoke all on table public.attendance_qr_access from public, anon, authenticated;

create or replace function public.attendance_qr_window_open(p_start time, p_end time, p_at timestamptz)
returns boolean language sql stable set search_path = public as $$
  select case
    when p_start = p_end then true
    when p_start < p_end then (p_at at time zone 'Asia/Tashkent')::time >= p_start
                          and (p_at at time zone 'Asia/Tashkent')::time < p_end
    else (p_at at time zone 'Asia/Tashkent')::time >= p_start
      or (p_at at time zone 'Asia/Tashkent')::time < p_end
  end;
$$;
revoke all on function public.attendance_qr_window_open(time, time, timestamptz) from public, anon, authenticated;

create or replace function public.attendance_kiosk_payload(p_kiosk public.attendance_kiosks)
returns jsonb language sql volatile set search_path = public as $$
  with clock as (
    select floor(extract(epoch from clock_timestamp()) * 1000) as now_ms
  ), slot as (
    select now_ms, floor(now_ms / 15000)::bigint as slot from clock
  )
  select jsonb_build_object(
    'payload', 'ci_' || p_kiosk.code || '_' || slot.slot || '_'
      || public.attendance_kiosk_signature(p_kiosk.signing_secret, p_kiosk.code, slot.slot),
    'ms_left', ((slot.slot + 1) * 15000 - slot.now_ms)::integer
  ) from slot;
$$;
revoke all on function public.attendance_kiosk_payload(public.attendance_kiosks) from public, anon, authenticated;

-- Entrance screen: unchanged contract, now on 15 s slots.
create or replace function public.get_attendance_kiosk_token(p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_kiosk public.attendance_kiosks;
begin
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into v_kiosk from public.attendance_kiosks
  where key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex') and revoked_at is null and kind = 'screen';
  if not found then return null; end if;
  -- Heartbeat for the owner's "screen online" status; at most every 20 s.
  if v_kiosk.last_seen_at is null or v_kiosk.last_seen_at < clock_timestamp() - interval '20 seconds' then
    update public.attendance_kiosks set last_seen_at = clock_timestamp() where id = v_kiosk.id;
  end if;
  return public.attendance_kiosk_payload(v_kiosk);
end;
$$;
revoke all on function public.get_attendance_kiosk_token(text) from public;
grant execute on function public.get_attendance_kiosk_token(text) to anon, authenticated;

create or replace function public.get_attendance_qr_access_settings()
returns table (profile_id uuid, full_name text, email text, role text, selected boolean, start_time time, end_time time)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.current_staff_can_access('settings') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  return query
    select p.id, coalesce(p.full_name, '')::text, coalesce(p.email, '')::text, p.role::text,
           a.profile_id is not null, a.start_time, a.end_time
    from public.profiles p
    left join public.attendance_qr_access a on a.profile_id = p.id
    where p.status::text = 'active' or a.profile_id is not null
    order by a.profile_id is null, lower(coalesce(nullif(p.full_name, ''), p.email, ''));
end;
$$;
revoke all on function public.get_attendance_qr_access_settings() from public, anon;
grant execute on function public.get_attendance_qr_access_settings() to authenticated;

create or replace function public.set_attendance_qr_access(p_profile_id uuid, p_start_time time, p_end_time time)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.current_staff_can_write('settings') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_profile_id is null or p_start_time is null or p_end_time is null then
    raise exception 'Account and both times are required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_profile_id) then
    raise exception 'Account not found' using errcode = '22023';
  end if;
  insert into public.attendance_qr_access (profile_id, start_time, end_time, updated_by, updated_at)
  values (p_profile_id, p_start_time, p_end_time, auth.uid(), now())
  on conflict (profile_id) do update
    set start_time = excluded.start_time, end_time = excluded.end_time,
        updated_by = excluded.updated_by, updated_at = excluded.updated_at;
end;
$$;
revoke all on function public.set_attendance_qr_access(uuid, time, time) from public, anon;
grant execute on function public.set_attendance_qr_access(uuid, time, time) to authenticated;

create or replace function public.remove_attendance_qr_access(p_profile_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.current_staff_can_write('settings') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  delete from public.attendance_qr_access where profile_id = p_profile_id;
end;
$$;
revoke all on function public.remove_attendance_qr_access(uuid) from public, anon;
grant execute on function public.remove_attendance_qr_access(uuid) to authenticated;

-- The signed-in account's own window (no row when not selected or inactive).
create or replace function public.get_my_attendance_qr_access()
returns table (start_time time, end_time time, open_now boolean)
language sql stable security definer set search_path = public as $$
  select a.start_time, a.end_time, public.attendance_qr_window_open(a.start_time, a.end_time, clock_timestamp())
  from public.attendance_qr_access a
  join public.profiles p on p.id = a.profile_id and p.status::text = 'active'
  where a.profile_id = auth.uid();
$$;
revoke all on function public.get_my_attendance_qr_access() from public, anon;
grant execute on function public.get_my_attendance_qr_access() to authenticated;

-- Drawer codes. The 'staff' signer row is created on first use; its key hash
-- is random, so no entrance-screen key can ever match it.
create or replace function public.get_attendance_qr_token()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_kiosk public.attendance_kiosks;
begin
  if not exists (
    select 1 from public.attendance_qr_access a
    join public.profiles p on p.id = a.profile_id and p.status::text = 'active'
    where a.profile_id = auth.uid()
      and public.attendance_qr_window_open(a.start_time, a.end_time, clock_timestamp())
  ) then
    raise exception 'Check-in QR is not available for this account now' using errcode = '42501';
  end if;
  select * into v_kiosk from public.attendance_kiosks where kind = 'staff' and revoked_at is null;
  if not found then
    insert into public.attendance_kiosks (kind, code, key_hash, signing_secret, created_by)
    values (
      'staff',
      substr(md5(gen_random_uuid()::text), 1, 8),
      encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8')), 'hex'),
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      auth.uid()
    )
    on conflict do nothing;
    select * into v_kiosk from public.attendance_kiosks where kind = 'staff' and revoked_at is null;
  end if;
  return public.attendance_kiosk_payload(v_kiosk);
end;
$$;
revoke all on function public.get_attendance_qr_token() from public, anon;
grant execute on function public.get_attendance_qr_token() to authenticated;

-- p_at is Telegram's message time (when Start was pressed). Window: two
-- 15 s slots of clock skew before, eight slots (2-2.25 min) after.
create or replace function public.verify_attendance_checkin_payload(p_payload text, p_at timestamptz)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_match text[];
  v_kiosk public.attendance_kiosks;
  v_slot bigint;
  v_age bigint;
begin
  v_match := regexp_match(coalesce(p_payload, ''), '^ci_([0-9a-f]{8})_([0-9]{1,12})_([0-9a-f]{16})$');
  if v_match is null or p_at is null then return 'invalid'; end if;
  select * into v_kiosk from public.attendance_kiosks where code = v_match[1] and revoked_at is null;
  if not found then return 'invalid'; end if;
  v_slot := v_match[2]::bigint;
  if public.attendance_kiosk_signature(v_kiosk.signing_secret, v_kiosk.code, v_slot) <> v_match[3] then
    return 'invalid';
  end if;
  v_age := floor(extract(epoch from p_at) / 15)::bigint - v_slot;
  if v_age < -2 or v_age > 8 then return 'expired'; end if;
  return 'valid';
end;
$$;
revoke all on function public.verify_attendance_checkin_payload(text, timestamptz) from public, anon, authenticated;
grant execute on function public.verify_attendance_checkin_payload(text, timestamptz) to service_role;

commit;
notify pgrst, 'reload schema';
