-- Inventory: the physical equipment the cafe owns (plates, spoons, forks), each
-- with an optional photo and a counted quantity. Independent Team feature;
-- items are archived, never physically deleted.
begin;

alter table public.profiles
  drop constraint if exists profiles_feature_access_valid;

alter table public.profiles
  add constraint profiles_feature_access_valid
  check (
    feature_access is null
    or (
      feature_access <@ array[
        'dashboard', 'tables', 'menu', 'cashier', 'loyalty', 'expenses', 'financial_analysis',
        'bazaar', 'ingredients', 'inventory', 'tech_cards', 'team', 'reports', 'audit', 'settings',
        'assistant', 'off_premise_orders', 'delete_paid_orders'
      ]::text[]
      and (
        not ('off_premise_orders' = any(feature_access))
        or 'tables' = any(feature_access)
      )
      and (
        not ('delete_paid_orders' = any(feature_access))
        or feature_access && array['dashboard', 'cashier', 'reports']::text[]
      )
      and (
        not ('financial_analysis' = any(feature_access))
        or 'expenses' = any(feature_access)
      )
    )
  );

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name = btrim(name) and char_length(name) between 1 and 120),
  image_url text check (image_url is null or image_url ~ '^https://'),
  quantity integer not null default 0 check (quantity between 0 and 1000000),
  note text check (note is null or char_length(note) <= 1000),
  is_active boolean not null default true,
  counted_at timestamptz not null default now(),
  counted_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Two active rows for one item would split its count; archived names may repeat.
create unique index if not exists inventory_items_active_name_key
  on public.inventory_items (lower(name)) where is_active;

-- The server owns the count stamp, so a client cannot backdate or misattribute it.
-- Saving other fields, or retrying the same save, leaves it untouched.
create or replace function public.stamp_inventory_item()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor_name text;
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    if new.quantity is not distinct from old.quantity then
      new.counted_at := old.counted_at;
      new.counted_by_name := old.counted_by_name;
      return new;
    end if;
  else
    new.created_at := now();
  end if;
  select coalesce(nullif(btrim(p.full_name), ''), p.email) into actor_name
  from public.profiles p where p.id = auth.uid();
  new.counted_at := now();
  new.counted_by_name := actor_name;
  return new;
end;
$$;
revoke all on function public.stamp_inventory_item() from public, anon, authenticated;

drop trigger if exists inventory_items_stamp on public.inventory_items;
create trigger inventory_items_stamp
  before insert or update on public.inventory_items
  for each row execute function public.stamp_inventory_item();

alter table public.inventory_items enable row level security;

-- Deliberately no DELETE grant or policy: archive with is_active instead.
revoke all on public.inventory_items from public, anon, authenticated;
grant select, insert, update on public.inventory_items to authenticated;

drop policy if exists inventory_items_read on public.inventory_items;
create policy inventory_items_read on public.inventory_items
  for select to authenticated
  using (public.current_staff_can_access('inventory'));

drop policy if exists inventory_items_insert on public.inventory_items;
create policy inventory_items_insert on public.inventory_items
  for insert to authenticated
  with check (public.current_staff_can_write('inventory'));

drop policy if exists inventory_items_update on public.inventory_items;
create policy inventory_items_update on public.inventory_items
  for update to authenticated
  using (public.current_staff_can_write('inventory'))
  with check (public.current_staff_can_write('inventory'));

notify pgrst, 'reload schema';

commit;
