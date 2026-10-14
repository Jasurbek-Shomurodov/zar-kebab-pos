-- Rotating attendance QR (replaces the printed static QR), shown on a
-- signed-out entrance screen and/or on the Dashboard for salary managers.
--
-- An owner/manager creates one screen link (/checkin-screen#k=<key>). The
-- screen exchanges its key for a payload that changes every 30 seconds:
--   ci_<code>_<slot>_<sig>   (slot = floor(epoch / 30), sig = keyed SHA-256)
-- The QR opens t.me/<bot>?start=<payload>. The webhook accepts it only when
-- Telegram's message time is within a short window of the slot, so a saved or
-- forwarded link is dead after about two minutes. Keys are stored hashed; the
-- signing secret never leaves the database. Creating a new link disables the
-- previous screen. The Dashboard signs with its own 'dashboard' row, so screen
-- links never affect it; only staff with Accounting write can fetch its codes.
begin;
set local lock_timeout = '5s';

create table if not exists public.attendance_kiosks (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null default 'screen' check (kind in ('screen', 'dashboard')),
  code           text not null unique check (code ~ '^[0-9a-f]{8}$'),
  key_hash       text not null unique,
  signing_secret text not null,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  last_seen_at   timestamptz,
  revoked_at     timestamptz
);

create unique index if not exists attendance_kiosks_one_active
  on public.attendance_kiosks (kind) where revoked_at is null;

alter table public.attendance_kiosks enable row level security;
revoke all on table public.attendance_kiosks from public, anon, authenticated;

create or replace function public.attendance_kiosk_signature(p_secret text, p_code text, p_slot bigint)
returns text language sql immutable set search_path = public as $$
  select substr(encode(sha256(convert_to(p_secret || ':' || p_code || ':' || p_slot::text || ':' || p_secret, 'UTF8')), 'hex'), 1, 16);
$$;
revoke all on function public.attendance_kiosk_signature(text, text, bigint) from public, anon, authenticated;

-- Returns the raw key once. Any previous screen stops working immediately.
create or replace function public.create_attendance_kiosk()
returns text language plpgsql security definer set search_path = public as $$
declare
  v_key text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if not public.current_staff_can_write('expenses') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  update public.attendance_kiosks set revoked_at = now() where revoked_at is null and kind = 'screen';
  insert into public.attendance_kiosks (code, key_hash, signing_secret, created_by)
  values (
    substr(md5(gen_random_uuid()::text), 1, 8),
    encode(sha256(convert_to(v_key, 'UTF8')), 'hex'),
    replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
    auth.uid()
  );
  return v_key;
end;
$$;
revoke all on function public.create_attendance_kiosk() from public, anon;
grant execute on function public.create_attendance_kiosk() to authenticated;

create or replace function public.revoke_attendance_kiosks()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.current_staff_can_write('expenses') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  update public.attendance_kiosks set revoked_at = now() where revoked_at is null and kind = 'screen';
end;
$$;
revoke all on function public.revoke_attendance_kiosks() from public, anon;
grant execute on function public.revoke_attendance_kiosks() to authenticated;

create or replace function public.get_attendance_kiosk_status()
returns table (created_at timestamptz, last_seen_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.current_staff_can_access('expenses') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  return query
    select k.created_at, k.last_seen_at from public.attendance_kiosks k where k.revoked_at is null and k.kind = 'screen';
end;
$$;
revoke all on function public.get_attendance_kiosk_status() from public, anon;
grant execute on function public.get_attendance_kiosk_status() to authenticated;

-- Called by the signed-out entrance screen. An unknown or disabled key gets
-- null rather than an error so the screen can say it was turned off.
create or replace function public.get_attendance_kiosk_token(p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_kiosk public.attendance_kiosks;
  v_now_ms numeric := floor(extract(epoch from clock_timestamp()) * 1000);
  v_slot bigint := floor(v_now_ms / 30000);
begin
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into v_kiosk from public.attendance_kiosks
  where key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex') and revoked_at is null and kind = 'screen';
  if not found then return null; end if;
  -- Heartbeat for the owner's "screen online" status; at most every 20 s.
  if v_kiosk.last_seen_at is null or v_kiosk.last_seen_at < clock_timestamp() - interval '20 seconds' then
    update public.attendance_kiosks set last_seen_at = clock_timestamp() where id = v_kiosk.id;
  end if;
  return jsonb_build_object(
    'payload', 'ci_' || v_kiosk.code || '_' || v_slot || '_'
      || public.attendance_kiosk_signature(v_kiosk.signing_secret, v_kiosk.code, v_slot),
    'ms_left', ((v_slot + 1) * 30000 - v_now_ms)::integer
  );
end;
$$;
revoke all on function public.get_attendance_kiosk_token(text) from public;
grant execute on function public.get_attendance_kiosk_token(text) to anon, authenticated;

-- Dashboard QR for signed-in salary managers. The signer row is created on
-- first use; its key hash is random, so no screen key can ever match it.
create or replace function public.get_attendance_dashboard_token()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_kiosk public.attendance_kiosks;
  v_now_ms numeric := floor(extract(epoch from clock_timestamp()) * 1000);
  v_slot bigint := floor(v_now_ms / 30000);
begin
  if not public.current_staff_can_write('expenses') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  select * into v_kiosk from public.attendance_kiosks where kind = 'dashboard' and revoked_at is null;
  if not found then
    insert into public.attendance_kiosks (kind, code, key_hash, signing_secret, created_by)
    values (
      'dashboard',
      substr(md5(gen_random_uuid()::text), 1, 8),
      encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8')), 'hex'),
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      auth.uid()
    )
    on conflict do nothing;
    select * into v_kiosk from public.attendance_kiosks where kind = 'dashboard' and revoked_at is null;
  end if;
  return jsonb_build_object(
    'payload', 'ci_' || v_kiosk.code || '_' || v_slot || '_'
      || public.attendance_kiosk_signature(v_kiosk.signing_secret, v_kiosk.code, v_slot),
    'ms_left', ((v_slot + 1) * 30000 - v_now_ms)::integer
  );
end;
$$;
revoke all on function public.get_attendance_dashboard_token() from public, anon;
grant execute on function public.get_attendance_dashboard_token() to authenticated;

-- p_at is Telegram's message time (when Start was pressed), so a delayed
-- webhook delivery is still judged by when the employee actually scanned.
-- Window: one slot of clock skew before, four slots (2-2.5 min) after.
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
  v_age := floor(extract(epoch from p_at) / 30)::bigint - v_slot;
  if v_age < -1 or v_age > 4 then return 'expired'; end if;
  return 'valid';
end;
$$;
revoke all on function public.verify_attendance_checkin_payload(text, timestamptz) from public, anon, authenticated;
grant execute on function public.verify_attendance_checkin_payload(text, timestamptz) to service_role;

commit;
notify pgrst, 'reload schema';
