-- Investor alert when staff change a menu item's selling price.
--
-- Reuses the Investor queue ingredient_investor_notifications (189, 259):
-- event wake-ups (219), the retry sweep, compare-and-set claims and the
-- salary_events target. One immutable event per real price change snapshots
-- the product, category, before/after prices (parent, strike-through old
-- price and every variant's effective price) and the actor.
-- Name, media, stock and visibility edits, unchanged saves, creation,
-- archival and service/migration writes stay silent. No historical backfill.
-- Apply before the Telegram sender that renders menu_price_changed.

begin;
set local lock_timeout = '5s';

alter table public.ingredient_investor_notifications
  drop constraint if exists ingredient_investor_notifications_event_type_check;
alter table public.ingredient_investor_notifications
  add constraint ingredient_investor_notifications_event_type_check
  check (event_type in ('created', 'updated', 'archived', 'restored', 'month_closed', 'month_reopened', 'menu_price_changed'));

-- Effective selling price of every variant: an absolute option price wins,
-- otherwise the parent price plus the legacy delta (src/lib/menuPricing.js).
create or replace function public.menu_item_variant_prices(option_groups jsonb, parent_price integer)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', btrim(opt.value ->> 'id'),
    'name', coalesce(
      nullif(btrim(opt.value ->> 'label_ru'), ''),
      nullif(btrim(opt.value ->> 'label'), ''),
      nullif(btrim(opt.value ->> 'name'), ''),
      nullif(btrim(opt.value ->> 'label_uz'), ''),
      nullif(btrim(opt.value ->> 'label_en'), ''),
      btrim(opt.value ->> 'id')
    ),
    'price', case
      when parsed.price > 0 then round(parsed.price)
      else coalesce(parent_price, 0) + round(parsed.price_delta)
    end
  ) order by grp.ordinality, opt.ordinality), '[]'::jsonb)
  from jsonb_array_elements(
    case when jsonb_typeof(option_groups) = 'array' then option_groups else '[]'::jsonb end
  ) with ordinality as grp(value, ordinality)
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(grp.value -> 'options') = 'array' then grp.value -> 'options' else '[]'::jsonb end
  ) with ordinality as opt(value, ordinality)
  -- Non-numeric legacy values count as zero instead of failing the menu save.
  cross join lateral (select
    case when jsonb_typeof(opt.value -> 'price') = 'number' then (opt.value ->> 'price')::numeric else 0 end as price,
    case when jsonb_typeof(opt.value -> 'price_delta') = 'number' then (opt.value ->> 'price_delta')::numeric else 0 end as price_delta
  ) parsed
  where nullif(btrim(opt.value ->> 'id'), '') is not null
$$;

revoke all on function public.menu_item_variant_prices(jsonb, integer) from public, anon, authenticated;

create or replace function public.queue_menu_price_investor_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  before_value jsonb;
  after_value jsonb;
  before_signature jsonb;
  after_signature jsonb;
  actor_name text;
  category_name text;
begin
  -- Staff edits of active products only; archived rows and service writes stay silent.
  if auth.uid() is null or old.deleted_at is not null or new.deleted_at is not null then
    return new;
  end if;
  before_value := jsonb_build_object('price', old.price, 'old_price', old.old_price,
    'variants', public.menu_item_variant_prices(old.option_groups, old.price));
  after_value := jsonb_build_object('price', new.price, 'old_price', new.old_price,
    'variants', public.menu_item_variant_prices(new.option_groups, new.price));
  -- Compare prices by variant id so renaming a variant is not a price change.
  select coalesce(jsonb_object_agg(v ->> 'id', v -> 'price'), '{}'::jsonb) into before_signature
    from jsonb_array_elements(before_value -> 'variants') v;
  select coalesce(jsonb_object_agg(v ->> 'id', v -> 'price'), '{}'::jsonb) into after_signature
    from jsonb_array_elements(after_value -> 'variants') v;
  if old.price = new.price and old.old_price = new.old_price and before_signature = after_signature then
    return new;
  end if;

  select coalesce(nullif(btrim(full_name), ''), nullif(btrim(email), ''), 'Система')
    into actor_name from public.profiles where id = auth.uid();
  select coalesce(nullif(btrim(name_ru), ''), nullif(btrim(name_uz), ''), nullif(btrim(name_en), ''))
    into category_name from public.menu_categories where id = new.category_id;

  insert into public.ingredient_investor_notifications(product_key, event_type, snapshot)
  values ('menu:' || new.id, 'menu_price_changed', jsonb_build_object(
    'event_type', 'menu_price_changed',
    'menu_item_id', new.id,
    'name', coalesce(nullif(btrim(new.name_ru), ''), nullif(btrim(new.name_uz), ''),
      nullif(btrim(new.name_en), ''), new.id),
    'category', category_name,
    'before', before_value,
    'after', after_value,
    'actor_name', coalesce(actor_name, 'Система'),
    'changed_at', now()
  ));
  return new;
end;
$$;

revoke all on function public.queue_menu_price_investor_notification() from public, anon, authenticated;

drop trigger if exists queue_menu_price_investor_notification on public.menu_items;
create trigger queue_menu_price_investor_notification
after update of price, old_price, option_groups on public.menu_items
for each row execute function public.queue_menu_price_investor_notification();

commit;
