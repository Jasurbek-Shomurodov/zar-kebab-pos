-- Investor alert when staff add an Inventory item or change its count.
--
-- Reuses the Investor queue ingredient_investor_notifications (189, 259, 270):
-- event wake-ups (219), the retry sweep, compare-and-set claims and the
-- salary_events target. One immutable event per new item or real count change.
-- Name, photo and note edits, archive/restore, retried saves and service writes
-- stay silent. No historical backfill.
-- Deploy the Telegram sender that renders inventory events before applying.

begin;
set local lock_timeout = '5s';

alter table public.ingredient_investor_notifications
  drop constraint if exists ingredient_investor_notifications_event_type_check;
alter table public.ingredient_investor_notifications
  add constraint ingredient_investor_notifications_event_type_check
  check (event_type in ('created', 'updated', 'archived', 'restored', 'month_closed', 'month_reopened',
    'menu_price_changed', 'inventory_added', 'inventory_count_changed'));

create or replace function public.queue_inventory_investor_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  event_kind text;
begin
  -- Staff changes of active items only; archived rows and service writes stay silent.
  if auth.uid() is null or new.is_active is not true then
    return new;
  end if;
  if tg_op = 'INSERT' then
    event_kind := 'inventory_added';
  elsif new.quantity is distinct from old.quantity then
    event_kind := 'inventory_count_changed';
  else
    return new;
  end if;

  -- stamp_inventory_item owns the actor and time of every count, so reuse them.
  insert into public.ingredient_investor_notifications(product_key, event_type, snapshot)
  values ('inventory:' || new.id, event_kind, jsonb_build_object(
    'event_type', event_kind,
    'inventory_item_id', new.id,
    'name', new.name,
    'quantity_before', case when tg_op = 'UPDATE' then old.quantity end,
    'quantity', new.quantity,
    'image_url', case when tg_op = 'INSERT' then new.image_url end,
    'actor_name', coalesce(new.counted_by_name, 'Система'),
    'changed_at', new.counted_at
  ));
  return new;
end;
$$;

revoke all on function public.queue_inventory_investor_notification() from public, anon, authenticated;

drop trigger if exists queue_inventory_investor_notification on public.inventory_items;
create trigger queue_inventory_investor_notification
after insert or update of quantity on public.inventory_items
for each row execute function public.queue_inventory_investor_notification();

commit;
