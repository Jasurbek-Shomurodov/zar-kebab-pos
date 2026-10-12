-- Owners may delete unpaid bills left open from a previous Tashkent day.
--
-- Migration 202 limited every deletion to today's orders, so a bill that was
-- never closed (wrong entry, walked-out customer) stayed on the cashier screen
-- forever. An open unpaid order never entered KPI bases, reports, stock
-- deduction or salary snapshots, so deleting it changes no finalized history.
-- Paid and cancelled history stays protected for every role, including owners.
begin;
set local lock_timeout = '5s';

create or replace function public.guard_current_day_order_deletion()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_business_date date := (coalesce(old.paid_at, old.created_at) at time zone 'Asia/Tashkent')::date;
  v_today date;
begin
  -- Serialize with generate_daily_kpi_bonuses. A deletion begun before midnight
  -- must commit before the next day's finalizer takes its sales snapshot.
  perform pg_advisory_xact_lock(hashtext('daily-kpi:' || v_business_date::text));
  v_today := (clock_timestamp() at time zone 'Asia/Tashkent')::date;
  if v_business_date < v_today
     and old.paid_at is null
     and coalesce(old.payment_status, '') not in ('paid', 'cancelled')
     and coalesce(old.status, '') not in ('paid', 'completed', 'cancelled')
     and public.current_staff_role() = 'owner' then
    return old;
  end if;
  if v_business_date is distinct from v_today
      or exists (select 1 from public.employee_daily_kpi_runs r where r.business_date = v_business_date) then
    raise exception 'Only orders from today (Asia/Tashkent) can be deleted; owners may also delete older unpaid orders'
      using errcode = '42501';
  end if;
  return old;
end;
$$;
revoke all on function public.guard_current_day_order_deletion() from public, anon, authenticated;

commit;
notify pgrst, 'reload schema';
