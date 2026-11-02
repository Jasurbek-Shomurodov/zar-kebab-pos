-- Before/after tech card image for the ZarKebab БОЗОРлик group.
--
-- Every manual save that really changes a recipe (ingredients, quantities,
-- prices, included items, portions, method or notes) queues one immutable
-- event with both versions and their costs. The owner chose to show ingredient
-- prices and costs in this one group; no other Telegram target receives them.
-- Catalog price sync writes rows directly, not through this RPC, so it stays
-- silent. Unchanged saves stay silent. No historical backfill. Nothing queues
-- until the tech_card_events target has a chat id and is enabled, so the group
-- never receives a backlog.
-- The save RPC body carries forward 156 plus the decimal prices patched in by 228.
-- Apply before the Telegram sender that handles task=tech-card-events.

begin;
set local lock_timeout = '5s';

create table if not exists public.tech_card_change_notifications (
  id uuid primary key default gen_random_uuid(),
  menu_item_id text not null,
  variant_option_id text not null default '',
  event_type text not null check (event_type in ('created', 'updated')),
  snapshot jsonb not null,
  status text not null default 'queued' check (status in ('queued', 'processing', 'sent')),
  chat_id text,
  telegram_message_ids jsonb not null default '[]'::jsonb,
  error_message text not null default '',
  attempted_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.tech_card_change_notifications enable row level security;
revoke all on public.tech_card_change_notifications from public, anon, authenticated;
grant all on public.tech_card_change_notifications to service_role;
create index if not exists tech_card_change_notifications_queued
  on public.tech_card_change_notifications(created_at) where status = 'queued';

insert into public.telegram_notification_targets (target_key, chat_id, language, is_enabled)
values ('tech_card_events', '', 'ru', false)
on conflict (target_key) do nothing;

-- One recipe version with its costs, read before the save replaces the rows.
create or replace function public.tech_card_change_snapshot(target_menu_item_id text, target_variant_option_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if public.current_staff_can_access('tech_cards') is not true
    or public.current_staff_can_write('menu') is not true then
    raise exception 'Manage Menu and Tech Cards access are required' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'portion_count', card.portion_count,
    'batch_output_quantity', card.batch_output_quantity,
    'batch_output_unit', card.batch_output_unit,
    'preparation_steps', card.preparation_steps,
    'notes', card.notes,
    'portion_cost', public.calculate_menu_item_variant_tech_card_real_cost(card.menu_item_id, card.variant_option_id),
    'ingredients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', ingredient.name, 'quantity', ingredient.quantity,
        'unit', ingredient.unit, 'unit_price_uzs', ingredient.unit_price_uzs
      ) order by ingredient.sort_order, ingredient.id)
      from public.menu_item_tech_card_ingredients ingredient
      where ingredient.menu_item_id = card.menu_item_id
        and ingredient.variant_option_id = card.variant_option_id
    ), '[]'::jsonb),
    'components', coalesce((
      select jsonb_agg(jsonb_build_object(
        'menu_item_id', component.component_menu_item_id,
        'selected_options', component.selected_options,
        'name', coalesce(nullif(btrim(included.name_ru), ''), nullif(btrim(included.name_uz), ''),
          nullif(btrim(included.name_en), ''), included.id),
        'variant', (
          select string_agg(variant.value ->> 'name', ', ')
          from jsonb_array_elements(public.menu_item_variant_prices(included.option_groups, included.price)) variant
          where exists (select 1 from jsonb_each_text(component.selected_options) selected
                        where selected.value = variant.value ->> 'id')
        ),
        'quantity', component.quantity,
        'unit', coalesce(included.sale_unit, 'piece'),
        'unit_cost', coalesce(
          (
            select (item_cost.variant_costs ->> selected.value)::numeric
            from jsonb_each_text(component.selected_options) selected
            where item_cost.variant_costs ? selected.value
              and (item_cost.variant_costs ->> selected.value) ~ '^[0-9]+$'
            order by selected.key limit 1
          ),
          item_cost.cost_price::numeric
        )
      ) order by component.sort_order, component.id)
      from public.menu_item_tech_card_components component
      join public.menu_items included on included.id = component.component_menu_item_id
      left join public.menu_item_costs item_cost on item_cost.menu_item_id = component.component_menu_item_id
      where component.menu_item_id = card.menu_item_id
        and component.variant_option_id = card.variant_option_id
    ), '[]'::jsonb)
  ) into result
  from public.menu_item_tech_cards card
  where card.menu_item_id = target_menu_item_id
    and card.variant_option_id = coalesce(target_variant_option_id, '');
  return result;
end;
$$;

-- What the person edited: costs of included meals move on their own and are not a recipe change.
create or replace function public.tech_card_change_signature(snapshot jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select (snapshot - 'portion_cost' - 'components') || jsonb_build_object('components', coalesce(
    (select jsonb_agg(row_value - 'unit_cost' - 'name' - 'variant' order by ordinality)
     from jsonb_array_elements(snapshot -> 'components') with ordinality as rows(row_value, ordinality)),
    '[]'::jsonb))
$$;

create or replace function public.queue_tech_card_change_notification(
  target_menu_item_id text,
  target_variant_option_id text,
  before_snapshot jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  after_snapshot jsonb;
  actor_name text;
  item public.menu_items%rowtype;
  variant_row jsonb;
begin
  if auth.uid() is null then return; end if;
  if public.current_staff_can_access('tech_cards') is not true
    or public.current_staff_can_write('menu') is not true then
    raise exception 'Manage Menu and Tech Cards access are required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.telegram_notification_targets target
    where target.target_key = 'tech_card_events' and target.is_enabled and btrim(target.chat_id) <> ''
  ) then return; end if;

  after_snapshot := public.tech_card_change_snapshot(target_menu_item_id, target_variant_option_id);
  if after_snapshot is null then return; end if;
  if before_snapshot is not null
    and public.tech_card_change_signature(before_snapshot) = public.tech_card_change_signature(after_snapshot) then
    return;
  end if;

  select * into item from public.menu_items where id = target_menu_item_id;
  select value into variant_row
  from jsonb_array_elements(public.menu_item_variant_prices(item.option_groups, item.price))
  where value ->> 'id' = target_variant_option_id;
  select coalesce(nullif(btrim(full_name), ''), nullif(btrim(email), ''), 'Система')
    into actor_name from public.profiles where id = auth.uid();

  insert into public.tech_card_change_notifications(menu_item_id, variant_option_id, event_type, snapshot)
  values (
    target_menu_item_id, target_variant_option_id,
    case when before_snapshot is null then 'created' else 'updated' end,
    jsonb_build_object(
      'event_type', case when before_snapshot is null then 'created' else 'updated' end,
      'menu_item_id', target_menu_item_id,
      'name', coalesce(nullif(btrim(item.name_ru), ''), nullif(btrim(item.name_uz), ''),
        nullif(btrim(item.name_en), ''), target_menu_item_id),
      'variant', variant_row ->> 'name',
      'sale_price', coalesce((variant_row ->> 'price')::numeric, item.price),
      'before', before_snapshot,
      'after', after_snapshot,
      'actor_name', coalesce(actor_name, 'Система'),
      'changed_at', now()
    )
  );
end;
$$;

revoke all on function public.tech_card_change_snapshot(text, text) from public, anon;
revoke all on function public.queue_tech_card_change_notification(text, text, jsonb) from public, anon;
revoke all on function public.tech_card_change_signature(jsonb) from public, anon;
-- The save RPC runs as the caller, and each function repeats its access check.
grant execute on function public.tech_card_change_snapshot(text, text) to authenticated;
grant execute on function public.queue_tech_card_change_notification(text, text, jsonb) to authenticated;
grant execute on function public.tech_card_change_signature(jsonb) to authenticated;

create or replace function public.save_menu_item_tech_card(payload jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_menu_item_id text := nullif(btrim(payload ->> 'menu_item_id'), '');
  target_variant_option_id text := coalesce(nullif(btrim(payload ->> 'variant_option_id'), ''), '');
  target_portion_count numeric;
  target_batch_output_quantity numeric;
  target_batch_output_unit text := coalesce(nullif(btrim(payload ->> 'batch_output_unit'), ''), 'kg');
  ingredient jsonb; ingredient_index integer := 0;
  component jsonb; component_index integer := 0;
  ingredients jsonb := coalesce(payload -> 'ingredients', '[]'::jsonb);
  components jsonb := coalesce(payload -> 'components', '[]'::jsonb);
  before_snapshot jsonb;
begin
  if public.current_staff_can_access('tech_cards') is not true
    or public.current_staff_can_write('menu') is not true then
    raise exception 'Manage Menu and Tech Cards access are required to save tech cards' using errcode = '42501';
  end if;
  if target_menu_item_id is null or not exists (
    select 1 from public.menu_items item where item.id = target_menu_item_id and item.deleted_at is null
  ) then raise exception 'Active menu item not found'; end if;
  if target_variant_option_id <> '' and not exists (
    select 1 from public.menu_items item
    cross join lateral jsonb_array_elements(coalesce(item.option_groups, '[]'::jsonb)) option_group
    cross join lateral jsonb_array_elements(coalesce(option_group -> 'options', '[]'::jsonb)) option_value
    where item.id = target_menu_item_id and option_value ->> 'id' = target_variant_option_id
  ) then raise exception 'Menu item variant not found'; end if;

  target_portion_count := nullif(payload ->> 'portion_count', '')::numeric;
  target_batch_output_quantity := nullif(payload ->> 'batch_output_quantity', '')::numeric;
  if target_portion_count is null or target_portion_count <= 0 then raise exception 'Portion count must be greater than zero'; end if;
  if target_batch_output_quantity is not null and target_batch_output_quantity <= 0 then raise exception 'Batch output must be greater than zero'; end if;
  if target_batch_output_unit not in ('g', 'kg', 'ml', 'l', 'piece') then raise exception 'Invalid batch output unit'; end if;
  if jsonb_typeof(ingredients) <> 'array' or jsonb_typeof(components) <> 'array' then raise exception 'Ingredients and included menu items must be arrays'; end if;
  if jsonb_array_length(ingredients) = 0 and jsonb_array_length(components) = 0 then raise exception 'At least one ingredient or included menu item is required'; end if;
  if nullif(btrim(coalesce(payload ->> 'preparation_steps', '')), '') is null then raise exception 'Preparation method is required'; end if;

  before_snapshot := public.tech_card_change_snapshot(target_menu_item_id, target_variant_option_id);

  insert into public.menu_item_tech_cards (
    menu_item_id, variant_option_id, portion_count, batch_output_quantity, batch_output_unit,
    preparation_steps, notes, updated_by, updated_at
  ) values (
    target_menu_item_id, target_variant_option_id, target_portion_count, target_batch_output_quantity,
    target_batch_output_unit, btrim(payload ->> 'preparation_steps'), btrim(coalesce(payload ->> 'notes', '')), auth.uid(), now()
  ) on conflict (menu_item_id, variant_option_id) do update set
    portion_count = excluded.portion_count, batch_output_quantity = excluded.batch_output_quantity,
    batch_output_unit = excluded.batch_output_unit, preparation_steps = excluded.preparation_steps,
    notes = excluded.notes, updated_by = excluded.updated_by, updated_at = excluded.updated_at;

  delete from public.menu_item_tech_card_ingredients
  where menu_item_id = target_menu_item_id and variant_option_id = target_variant_option_id;
  delete from public.menu_item_tech_card_components
  where menu_item_id = target_menu_item_id and variant_option_id = target_variant_option_id;

  for ingredient in select value from jsonb_array_elements(ingredients) loop
    ingredient_index := ingredient_index + 1;
    if nullif(btrim(ingredient ->> 'name'), '') is null then raise exception 'Ingredient % needs a name', ingredient_index; end if;
    if nullif(ingredient ->> 'quantity', '')::numeric <= 0 then raise exception 'Ingredient % quantity must be greater than zero', ingredient_index; end if;
    if ingredient ->> 'unit' not in ('g', 'kg', 'ml', 'l', 'piece') then raise exception 'Ingredient % has an invalid unit', ingredient_index; end if;
    if nullif(ingredient ->> 'unit_price_uzs', '')::numeric < 0 then raise exception 'Ingredient % price cannot be negative', ingredient_index; end if;
    insert into public.menu_item_tech_card_ingredients (
      menu_item_id, variant_option_id, name, quantity, unit, unit_price_uzs, sort_order, updated_at
    ) values (
      target_menu_item_id, target_variant_option_id, btrim(ingredient ->> 'name'),
      (ingredient ->> 'quantity')::numeric, ingredient ->> 'unit',
      (ingredient ->> 'unit_price_uzs')::numeric, ingredient_index, now()
    );
  end loop;

  for component in select value from jsonb_array_elements(components) loop
    component_index := component_index + 1;
    if nullif(btrim(component ->> 'component_menu_item_id'), '') is null then raise exception 'Included menu item % must be selected', component_index; end if;
    if component ->> 'component_menu_item_id' = target_menu_item_id then raise exception 'A menu item cannot include itself'; end if;
    if jsonb_typeof(coalesce(component -> 'selected_options', '{}'::jsonb)) <> 'object' then raise exception 'Included menu item % variants must be an object', component_index; end if;
    if nullif(component ->> 'quantity', '')::numeric <= 0 then raise exception 'Included menu item % quantity must be greater than zero', component_index; end if;
    if not exists (select 1 from public.menu_items item where item.id = component ->> 'component_menu_item_id' and item.deleted_at is null) then raise exception 'Included menu item % is not active', component_index; end if;
    if exists (
      select 1 from jsonb_each_text(coalesce(component -> 'selected_options', '{}'::jsonb)) selected
      where not exists (
        select 1 from public.menu_items item
        cross join lateral jsonb_array_elements(coalesce(item.option_groups, '[]'::jsonb)) option_group
        cross join lateral jsonb_array_elements(coalesce(option_group -> 'options', '[]'::jsonb)) option_value
        where item.id = component ->> 'component_menu_item_id'
          and option_group ->> 'id' = selected.key and option_value ->> 'id' = selected.value
      )
    ) then raise exception 'Included menu item % has an invalid variant', component_index; end if;
    insert into public.menu_item_tech_card_components (
      menu_item_id, variant_option_id, component_menu_item_id, selected_options, quantity, sort_order, updated_at
    ) values (
      target_menu_item_id, target_variant_option_id, component ->> 'component_menu_item_id',
      coalesce(component -> 'selected_options', '{}'::jsonb), (component ->> 'quantity')::numeric,
      component_index, now()
    );
  end loop;

  -- A notification problem must never lose the recipe the cook just saved.
  begin
    perform public.queue_tech_card_change_notification(target_menu_item_id, target_variant_option_id, before_snapshot);
  exception when others then
    raise warning 'tech card change notification failed: %', sqlerrm;
  end;
end;
$$;

revoke all on function public.save_menu_item_tech_card(jsonb) from public, anon;
grant execute on function public.save_menu_item_tech_card(jsonb) to authenticated;

create or replace function public.invoke_tech_card_change_notifications()
returns bigint language plpgsql security definer
set search_path = public, vault, extensions, pg_temp
as $$
declare
  cron_secret text;
  request_id bigint;
begin
  if not exists (select 1 from public.tech_card_change_notifications where status = 'queued') then
    return null;
  end if;
  select decrypted_secret into cron_secret from vault.decrypted_secrets
    where name = 'zar_kebab_daily_report_cron_secret' order by created_at desc limit 1;
  if nullif(btrim(cron_secret), '') is null then return null; end if;
  select net.http_get(
    url := 'https://www.zarkebab.uz/api/telegram/daily-salary?task=tech-card-events',
    headers := jsonb_build_object('Authorization', 'Bearer ' || cron_secret),
    timeout_milliseconds := 60000
  ) into request_id;
  return request_id;
end;
$$;
revoke all on function public.invoke_tech_card_change_notifications() from public, anon, authenticated;

create or replace function public.invoke_telegram_queues()
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  -- Isolate each queue so one failure does not hold back the others.
  begin
    perform public.invoke_game_club_team_notifications();
  exception when others then
    raise warning 'game-club queue dispatch failed: %', sqlerrm;
  end;
  begin
    perform public.invoke_order_status_cleanup();
  exception when others then
    raise warning 'order-status cleanup dispatch failed: %', sqlerrm;
  end;
  begin
    perform public.invoke_ingredient_investor_notifications();
  exception when others then
    raise warning 'ingredient queue dispatch failed: %', sqlerrm;
  end;
  begin
    perform public.invoke_employee_order_kpi_notifications();
  exception when others then
    raise warning 'employee KPI queue dispatch failed: %', sqlerrm;
  end;
  begin
    perform public.invoke_tech_card_change_notifications();
  exception when others then
    raise warning 'tech card queue dispatch failed: %', sqlerrm;
  end;
end;
$$;
revoke all on function public.invoke_telegram_queues() from public, anon, authenticated;

create or replace function public.kick_telegram_queue(p_task text)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  flag text := 'zar_kebab.kicked_' || replace(p_task, '-', '_');
begin
  if current_setting(flag, true) = 'on' then return; end if;
  perform set_config(flag, 'on', true);
  case p_task
    when 'game-club-orders' then perform public.invoke_game_club_team_notifications();
    when 'order-status-cleanup' then perform public.invoke_order_status_cleanup();
    when 'ingredient-events' then perform public.invoke_ingredient_investor_notifications();
    when 'employee-order-kpi' then perform public.invoke_employee_order_kpi_notifications();
    when 'tech-card-events' then perform public.invoke_tech_card_change_notifications();
  end case;
exception when others then
  raise warning 'telegram queue kick % failed: %', p_task, sqlerrm;
end;
$$;
revoke all on function public.kick_telegram_queue(text) from public, anon, authenticated;

create or replace function public.kick_tech_card_change_queue() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from new_rows where status = 'queued') then
    perform public.kick_telegram_queue('tech-card-events');
  end if;
  return null;
end;
$$;
revoke all on function public.kick_tech_card_change_queue() from public, anon, authenticated;
drop trigger if exists kick_tech_card_change_queue on public.tech_card_change_notifications;
create trigger kick_tech_card_change_queue after insert on public.tech_card_change_notifications
  referencing new table as new_rows for each statement
  execute function public.kick_tech_card_change_queue();

commit;

notify pgrst, 'reload schema';
