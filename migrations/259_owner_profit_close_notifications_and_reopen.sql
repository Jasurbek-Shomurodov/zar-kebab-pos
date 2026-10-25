-- Owner profit: Investor alerts for month closes and an owner-only reopen.
--
-- A close (257) now queues one immutable Investor message with the frozen
-- figures. Investor alerts already flow through
-- ingredient_investor_notifications (189): event wake-ups (219), the
-- 15-minute retry sweep, compare-and-set claims and the salary_events target.
-- So month events reuse that queue with two new event types instead of a
-- parallel table. The sender picks the message by event_type.
--
-- Closes stay immutable except for one path: an active owner may reopen the
-- latest closed month with a reason. The close row is removed, its full
-- snapshot stays in accounting_record_audit, the month's records unlock
-- (257's guards read the remaining closes), and the Investor channel is told.
-- Apply before the UI and the Telegram sender that read these events.

begin;
set local lock_timeout = '5s';

alter table public.ingredient_investor_notifications
  drop constraint if exists ingredient_investor_notifications_event_type_check;
alter table public.ingredient_investor_notifications
  add constraint ingredient_investor_notifications_event_type_check
  check (event_type in ('created', 'updated', 'archived', 'restored', 'month_closed', 'month_reopened'));

-- Audit closes and reopens next to the other accounting records.
alter table public.accounting_record_audit
  drop constraint if exists accounting_record_audit_entity_type_check;
alter table public.accounting_record_audit
  add constraint accounting_record_audit_entity_type_check
  check (entity_type in (
    'expense',
    'salary_payment',
    'salary_bonus',
    'salary_fine',
    'salary_absence',
    'salary_rate',
    'month_close'
  ));

create or replace function public.capture_accounting_record_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity_type text;
  v_entity_id text;
  v_actor_name text := '';
begin
  v_entity_type := case tg_table_name
    when 'expenses' then 'expense'
    when 'employee_salary_payments' then 'salary_payment'
    when 'employee_salary_bonuses' then 'salary_bonus'
    when 'employee_salary_fines' then 'salary_fine'
    when 'employee_salary_absences' then 'salary_absence'
    when 'employee_salary_rates' then 'salary_rate'
    when 'accounting_month_closes' then 'month_close'
    else null
  end;

  if v_entity_type is null then
    raise exception 'Unsupported accounting audit table: %', tg_table_name;
  end if;

  if tg_op = 'DELETE' then
    v_entity_id := to_jsonb(old) ->> 'id';
  else
    v_entity_id := to_jsonb(new) ->> 'id';
  end if;

  select coalesce(nullif(trim(p.full_name), ''), nullif(trim(p.email), ''), '')
  into v_actor_name
  from public.profiles p
  where p.id = auth.uid();

  insert into public.accounting_record_audit (
    entity_type,
    entity_id,
    action,
    old_record,
    new_record,
    changed_by,
    changed_by_name
  ) values (
    v_entity_type,
    v_entity_id,
    lower(tg_op),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end,
    auth.uid(),
    coalesce(v_actor_name, '')
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists audit_accounting_month_close_records on public.accounting_month_closes;
create trigger audit_accounting_month_close_records
after insert or delete on public.accounting_month_closes
for each row execute function public.capture_accounting_record_audit();

-- Updates stay impossible. A delete is allowed only from reopen_accounting_month,
-- which marks the one month it reopens for the current transaction.
create or replace function public.prevent_accounting_month_close_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE'
    and current_setting('zar_kebab.reopen_month', true) = old.month_start::text then
    return old;
  end if;
  raise exception 'Closed months are immutable' using errcode = '42501';
end;
$$;

create or replace function public.queue_accounting_month_closed_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.ingredient_investor_notifications(product_key, event_type, snapshot)
  values (
    'month:' || to_char(new.month_start, 'YYYY-MM'),
    'month_closed',
    public.accounting_month_close_json(new) || jsonb_build_object(
      'event_type', 'month_closed',
      'actor_name', coalesce(nullif(btrim(new.closed_by_name), ''), 'Система'),
      'changed_at', new.closed_at
    )
  );
  return new;
end;
$$;

revoke all on function public.queue_accounting_month_closed_notification() from public, anon, authenticated;

drop trigger if exists queue_accounting_month_closed_notification on public.accounting_month_closes;
create trigger queue_accounting_month_closed_notification
after insert on public.accounting_month_closes
for each row execute function public.queue_accounting_month_closed_notification();

-- Reopen the latest closed month. A retry with the same request id after the
-- month was already reopened returns the same result instead of failing.
create or replace function public.reopen_accounting_month(
  p_month_start date,
  p_reason text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_close public.accounting_month_closes;
  v_name text;
begin
  if not public.is_owner() then
    raise exception 'owner_required' using errcode = '42501';
  end if;
  if p_month_start is null or p_request_id is null then
    raise exception 'invalid_month_close' using errcode = '22023';
  end if;
  if v_reason = '' then
    raise exception 'reopen_reason_required' using errcode = '22023';
  end if;
  v_reason := left(v_reason, 1000);

  perform pg_advisory_xact_lock(hashtext('accounting_month_close'));

  if exists (
    select 1 from public.ingredient_investor_notifications n
    where n.event_type = 'month_reopened'
      and n.snapshot ->> 'request_id' = p_request_id::text
  ) then
    return jsonb_build_object('month_start', p_month_start, 'reopened', true);
  end if;

  select * into v_close from public.accounting_month_closes where month_start = p_month_start;
  if not found then
    raise exception 'month_not_closed' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.accounting_month_closes where month_start > p_month_start) then
    raise exception 'later_month_closed' using errcode = 'P0001';
  end if;

  select coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.email), ''), 'Система') into v_name
  from public.profiles p where p.id = auth.uid();

  perform set_config('zar_kebab.reopen_month', p_month_start::text, true);
  delete from public.accounting_month_closes where month_start = p_month_start;
  perform set_config('zar_kebab.reopen_month', '', true);

  insert into public.ingredient_investor_notifications(product_key, event_type, snapshot)
  values (
    'month:' || to_char(p_month_start, 'YYYY-MM'),
    'month_reopened',
    jsonb_build_object(
      'event_type', 'month_reopened',
      'month_start', p_month_start,
      'request_id', p_request_id,
      'reason', v_reason,
      'previous_close', public.accounting_month_close_json(v_close),
      'actor_name', coalesce(v_name, 'Система'),
      'changed_at', now()
    )
  );

  return jsonb_build_object('month_start', p_month_start, 'reopened', true);
end;
$$;

revoke all on function public.reopen_accounting_month(date, text, uuid) from public, anon, authenticated;
grant execute on function public.reopen_accounting_month(date, text, uuid) to authenticated;

commit;

notify pgrst, 'reload schema';
