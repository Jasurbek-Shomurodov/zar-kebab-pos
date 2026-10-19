-- Queue a Team Telegram event when staff change a product variant's public
-- or waiter visibility. Variant flags live inside menu_items.option_groups,
-- so the catalog trigger (168) never saw them. One event per save lists every
-- changed variant; added/removed variants and stock-only edits send nothing.
-- Historical delivery rows are preserved and never replayed.

begin;

alter table public.menu_item_unavailable_notification_deliveries
  add column if not exists variant_changes jsonb;

alter table public.menu_item_unavailable_notification_deliveries
  drop constraint if exists menu_item_availability_delivery_event_check;

alter table public.menu_item_unavailable_notification_deliveries
  add constraint menu_item_availability_delivery_event_check
  check (availability_event in ('unavailable', 'available', 'created', 'archived', 'variant_visibility'));

-- Effective visibility of every variant; legacy available=false hides both menus.
create or replace function public.menu_item_variant_visibility(option_groups jsonb)
returns table (
  option_id text,
  option_name text,
  option_position bigint,
  public_hidden boolean,
  waiter_hidden boolean
)
language sql
immutable
set search_path = public
as $$
  select
    btrim(opt.value ->> 'id'),
    coalesce(
      nullif(btrim(opt.value ->> 'label_ru'), ''),
      nullif(btrim(opt.value ->> 'label'), ''),
      nullif(btrim(opt.value ->> 'name'), ''),
      nullif(btrim(opt.value ->> 'label_uz'), ''),
      nullif(btrim(opt.value ->> 'label_en'), ''),
      btrim(opt.value ->> 'id')
    ),
    grp.ordinality * 10000 + opt.ordinality,
    coalesce(opt.value ->> 'public_hidden', opt.value ->> 'publicHidden') = 'true'
      or opt.value ->> 'available' = 'false',
    coalesce(opt.value ->> 'waiter_hidden', opt.value ->> 'waiterHidden') = 'true'
      or opt.value ->> 'available' = 'false'
  from jsonb_array_elements(
    case when jsonb_typeof(option_groups) = 'array' then option_groups else '[]'::jsonb end
  ) with ordinality as grp(value, ordinality)
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(grp.value -> 'options') = 'array' then grp.value -> 'options' else '[]'::jsonb end
  ) with ordinality as opt(value, ordinality)
  where nullif(btrim(opt.value ->> 'id'), '') is not null
$$;

revoke all on function public.menu_item_variant_visibility(jsonb)
  from public, anon, authenticated;

create or replace function public.queue_menu_item_team_delivery()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_by uuid := auth.uid();
  changed_by_name text;
  russian_item_name text;
  event_name text;
  changed_variants jsonb;
begin
  -- Trusted maintenance/service writes have no staff identity to announce.
  if changed_by is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.deleted_at is not null then
      return new;
    end if;
    event_name := 'created';
  elsif old.deleted_at is null and new.deleted_at is not null then
    event_name := 'archived';
  elsif old.deleted_at is not distinct from new.deleted_at
    and new.deleted_at is null
    and old.available is distinct from new.available then
    event_name := case when new.available is false then 'unavailable' else 'available' end;
  end if;

  if tg_op = 'UPDATE'
    and old.deleted_at is null
    and new.deleted_at is null
    and old.option_groups is distinct from new.option_groups then
    select jsonb_agg(jsonb_build_object(
      'id', after_state.option_id,
      'name', after_state.option_name,
      'public_hidden', after_state.public_hidden,
      'waiter_hidden', after_state.waiter_hidden,
      'was_public_hidden', before_state.public_hidden,
      'was_waiter_hidden', before_state.waiter_hidden
    ) order by after_state.option_position)
    into changed_variants
    from public.menu_item_variant_visibility(new.option_groups) as after_state
    join public.menu_item_variant_visibility(old.option_groups) as before_state
      on before_state.option_id = after_state.option_id
    where before_state.public_hidden is distinct from after_state.public_hidden
      or before_state.waiter_hidden is distinct from after_state.waiter_hidden;
  end if;

  if event_name is null and changed_variants is null then
    return new;
  end if;

  select coalesce(
    nullif(btrim(profile.full_name), ''),
    nullif(btrim(profile.email), ''),
    'Неизвестный сотрудник'
  )
  into changed_by_name
  from public.profiles as profile
  where profile.id = changed_by;

  russian_item_name := coalesce(
    nullif(btrim(new.name_ru), ''),
    nullif(btrim(new.name_uz), ''),
    nullif(btrim(new.name_en), ''),
    new.id,
    'Без названия'
  );

  if event_name is not null then
    insert into public.menu_item_unavailable_notification_deliveries (
      menu_item_id,
      menu_item_name,
      actor_id,
      actor_name,
      availability_event
    ) values (
      new.id,
      russian_item_name,
      changed_by,
      coalesce(changed_by_name, 'Неизвестный сотрудник'),
      event_name
    );
  end if;

  if changed_variants is not null then
    insert into public.menu_item_unavailable_notification_deliveries (
      menu_item_id,
      menu_item_name,
      actor_id,
      actor_name,
      availability_event,
      variant_changes
    ) values (
      new.id,
      russian_item_name,
      changed_by,
      coalesce(changed_by_name, 'Неизвестный сотрудник'),
      'variant_visibility',
      changed_variants
    );
  end if;

  return new;
end;
$$;

revoke all on function public.queue_menu_item_team_delivery()
  from public, anon, authenticated;

drop trigger if exists queue_menu_item_team_delivery_trigger
  on public.menu_items;

create trigger queue_menu_item_team_delivery_trigger
after insert or update of available, deleted_at, option_groups on public.menu_items
for each row execute function public.queue_menu_item_team_delivery();

commit;

notify pgrst, 'reload schema';
