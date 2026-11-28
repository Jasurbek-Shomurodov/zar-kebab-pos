-- Normal checkout is not a payment-method change.
--
-- The legacy orders branch of queue_order_change_investor_notification (175/176)
-- fires whenever orders.payment_method changes. At checkout it changes from
-- null to cash/card/... before any order_payments row exists, so every paid
-- order queued a "payment_method_changed" Investor event (3,420 rows by
-- 27 Nov 2026, all old method null). They stay not_attempted, but when the
-- same person later corrects a payment on that order, the endpoint sends every
-- pending row for the order, so the Investor got a false "null -> cash" change.
-- Only an order that was already paid can have its payment method changed.
-- Existing checkout rows are marked skipped (terminal, never sent).

begin;
set local lock_timeout = '5s';

create or replace function public.queue_order_change_investor_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
  v_actor_name text;
  v_old_methods jsonb := '[]'::jsonb;
  v_new_methods jsonb := '[]'::jsonb;
  v_event_type text;
begin
  if tg_table_name = 'orders' and tg_op = 'DELETE' then
    select * into v_order from public.orders where id = v_old->>'id';
    v_event_type := 'order_deleted';
    select coalesce(jsonb_agg(jsonb_build_object('method', method, 'amount', amount) order by created_at, id), '[]'::jsonb)
      into v_old_methods from public.order_payments where order_id = v_old->>'id';
  elsif tg_table_name = 'orders' and tg_op = 'UPDATE' then
    if v_old->>'payment_method' is not distinct from v_new->>'payment_method'
       or coalesce(v_old->>'payment_status', '') <> 'paid'
       or exists (select 1 from public.order_payments where order_id = v_new->>'id' and method <> 'loyalty_card') then
      return new;
    end if;
    select * into v_order from public.orders where id = v_new->>'id';
    if not found then return new; end if;
    v_event_type := 'payment_method_changed';
    v_old_methods := jsonb_build_array(jsonb_build_object('method', v_old->>'payment_method', 'amount', (v_old->>'total')::bigint));
    v_new_methods := jsonb_build_array(jsonb_build_object('method', v_new->>'payment_method', 'amount', (v_new->>'total')::bigint));
  elsif tg_table_name = 'order_payments' and tg_op = 'UPDATE' then
    if v_old->>'method' is not distinct from v_new->>'method' then return new; end if;
    select * into v_order from public.orders where id = v_new->>'order_id';
    if not found then return new; end if;
    v_event_type := 'payment_method_changed';
    v_old_methods := jsonb_build_array(jsonb_build_object('paymentId', v_old->>'id', 'method', v_old->>'method', 'amount', (v_old->>'amount')::bigint));
    v_new_methods := jsonb_build_array(jsonb_build_object('paymentId', v_new->>'id', 'method', v_new->>'method', 'amount', (v_new->>'amount')::bigint));
  else
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  select coalesce(nullif(btrim(full_name), ''), nullif(btrim(email), ''), 'Система')
    into v_actor_name from public.profiles where id = auth.uid();

  insert into public.order_change_investor_notification_deliveries (
    event_type, order_id, transaction_id, order_number, table_name, total,
    old_payment_methods, new_payment_methods, actor_id, actor_name
  ) values (
    v_event_type, v_order.id, txid_current(), v_order.order_number, coalesce(v_order.table_name, ''),
    coalesce(v_order.total, 0), v_old_methods, v_new_methods, auth.uid(), coalesce(v_actor_name, 'Система')
  )
  on conflict (event_type, order_id, transaction_id) do update set
    old_payment_methods = case
      when excluded.event_type = 'payment_method_changed'
      then order_change_investor_notification_deliveries.old_payment_methods || excluded.old_payment_methods
      else order_change_investor_notification_deliveries.old_payment_methods
    end,
    new_payment_methods = case
      when excluded.event_type = 'payment_method_changed'
      then order_change_investor_notification_deliveries.new_payment_methods || excluded.new_payment_methods
      else order_change_investor_notification_deliveries.new_payment_methods
    end,
    updated_at = now();

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

revoke all on function public.queue_order_change_investor_notification() from public, anon, authenticated;

update public.order_change_investor_notification_deliveries
   set status = 'skipped',
       error_message = 'Checkout, not a payment-method change (289)',
       updated_at = now()
 where event_type = 'payment_method_changed'
   and status = 'not_attempted'
   and jsonb_array_length(old_payment_methods) = 1
   and old_payment_methods->0->>'method' is null;

notify pgrst, 'reload schema';

commit;
