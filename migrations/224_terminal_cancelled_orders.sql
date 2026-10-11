-- Keep cancelled bills closed and close bills that lose their last live item.
--
-- Empty "Нужен счёт" shells kept reappearing in the nightly open-orders report:
-- table payment (135) cancels empty shells with status only, leaving
-- payment_status = 'unpaid', and the waiter "Request bill" / "Served" writes
-- updated every non-paid order on the table, flipping those shells back open.
-- Kitchen cancellation also deleted items and closed the order in a second,
-- unchecked client request, so a failed follow-up left an empty open order.
begin;

-- 1. Cancellation is terminal for unpaid orders, and always closes payment.
-- Named to run before guard_and_audit_order_payment so the audit sees the final row.
create or replace function public.enforce_cancelled_order_terminal()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.paid_at is null and coalesce(new.payment_status, '') <> 'paid'
     and coalesce(new.status, '') not in ('paid', 'completed') then
    if old.status = 'cancelled' or old.payment_status = 'cancelled' or new.status = 'cancelled' then
      new.status := 'cancelled';
      new.payment_status := 'cancelled';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_cancelled_order_terminal() from public, anon, authenticated;

drop trigger if exists enforce_cancelled_order_terminal on public.orders;
create trigger enforce_cancelled_order_terminal
  before update on public.orders
  for each row
  when (old.status = 'cancelled' or old.payment_status = 'cancelled' or new.status = 'cancelled')
  execute function public.enforce_cancelled_order_terminal();

-- 2. Removing or cancelling the last live item closes the open bill in the same
-- transaction, whichever path removed it. The parent row is already locked by
-- guard_paid_order_items, so this adds no new lock ordering.
create or replace function public.cancel_order_without_live_items()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.orders o
     set status = 'cancelled', payment_status = 'cancelled',
         subtotal = 0, service_fee = 0, total = 0, updated_at = now()
   where o.id = old.order_id
     and coalesce(o.payment_status, '') not in ('paid', 'cancelled')
     and o.paid_at is null
     and coalesce(o.status, '') not in ('paid', 'completed', 'cancelled')
     and not exists (
       select 1 from public.order_items i
       where i.order_id = o.id and coalesce(i.status, '') <> 'cancelled'
     );
  return null;
end;
$$;
revoke all on function public.cancel_order_without_live_items() from public, anon, authenticated;

drop trigger if exists cancel_order_without_live_items on public.order_items;
create trigger cancel_order_without_live_items
  after delete or update of status, order_id on public.order_items
  for each row
  execute function public.cancel_order_without_live_items();

-- 3. Backfill. Kitchen submission creates an order and its items atomically, so
-- an older open order without live items is a leftover shell.
update public.orders o
   set status = 'cancelled', payment_status = 'cancelled',
       subtotal = 0, service_fee = 0, total = 0, updated_at = now()
 where coalesce(o.payment_status, '') not in ('paid', 'cancelled')
   and o.paid_at is null
   and coalesce(o.status, '') not in ('paid', 'completed', 'cancelled')
   and o.created_at < now() - interval '10 minutes'
   and not exists (
     select 1 from public.order_items i
     where i.order_id = o.id and coalesce(i.status, '') <> 'cancelled'
   );

-- Half-cancelled rows (status or payment_status only) become fully cancelled;
-- the trigger above completes the other field.
update public.orders o
   set status = 'cancelled', updated_at = now()
 where (o.status = 'cancelled' or o.payment_status = 'cancelled')
   and (o.status is distinct from 'cancelled' or o.payment_status is distinct from 'cancelled')
   and o.paid_at is null
   and coalesce(o.payment_status, '') <> 'paid'
   and coalesce(o.status, '') not in ('paid', 'completed');

-- Free tables left in bill/occupied state by those shells.
update public.restaurant_tables t
   set status = 'available', updated_at = now()
 where t.status in ('needs_bill', 'occupied')
   and coalesce(t.updated_at, now()) < now() - interval '10 minutes'
   and not exists (
     select 1 from public.orders o
     where o.table_id = t.id
       and coalesce(o.payment_status, '') not in ('paid', 'cancelled')
       and o.paid_at is null
       and coalesce(o.status, '') not in ('paid', 'completed', 'cancelled')
   );

notify pgrst, 'reload schema';
commit;
