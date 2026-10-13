-- The public website and Telegram menu are display-only, so a scheduled
-- category or product (Breakfast 08:00-12:31, Business lunch 11:00-15:00)
-- stays listed all day; the client shows its time window as a label instead.
-- Waiter ordering keeps enforcing schedules in the application layer, and
-- hidden, public-hidden, cashier-only, and archive boundaries are unchanged.

begin;

drop policy if exists "Public: read menu categories" on public.menu_categories;
create policy "Public: read menu categories"
  on public.menu_categories for select
  using (coalesce(hidden, false) = false);

drop policy if exists "Public: read customer menu items" on public.menu_items;
create policy "Public: read customer menu items"
  on public.menu_items for select
  using (
    coalesce(cashier_only, false) = false
    and coalesce(public_hidden, false) = false
    and deleted_at is null
    and (
      menu_items.category_id is null
      or exists (
        select 1
        from public.menu_categories c
        where c.id = menu_items.category_id
          and coalesce(c.hidden, false) = false
          and c.deleted_at is null
      )
    )
  );

create or replace function public.get_public_menu_data()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'categories',
      coalesce(
        (
          select jsonb_agg(to_jsonb(c) order by c.sort_order, c.created_at)
          from public.menu_categories c
          where coalesce(c.hidden, false) = false
            and c.deleted_at is null
        ),
        '[]'::jsonb
      ),
    'items',
      coalesce(
        (
          select jsonb_agg(to_jsonb(i) order by i.sort_order, i.created_at)
          from public.menu_items i
          left join public.menu_categories c on c.id = i.category_id
          where coalesce(i.cashier_only, false) = false
            and coalesce(i.public_hidden, false) = false
            and i.deleted_at is null
            and (
              i.category_id is null
              or (
                coalesce(c.hidden, false) = false
                and c.deleted_at is null
              )
            )
        ),
        '[]'::jsonb
      )
  );
$$;

grant execute on function public.get_public_menu_data() to anon, authenticated;

commit;

notify pgrst, 'reload schema';
