-- Weekday schedule for menu categories (e.g. Business lunch Monday-Friday only).
-- ISO weekdays: 1 = Monday ... 7 = Sunday, evaluated on the Tashkent calendar day.
-- NULL means every day. The weekday list combines with the existing time window
-- (visible_from_time/visible_until_time) and, like it, gates waiter and guest-device
-- ordering in the application layer; the public website and Telegram menu stay
-- display-only and show the days as a label (see 241_public_menu_ignores_schedules.sql).
-- The always_visible_* channel and staff overrides bypass the whole schedule.

alter table public.menu_categories
  add column if not exists visible_weekdays smallint[];

alter table public.menu_categories
  drop constraint if exists menu_categories_visible_weekdays_check;

alter table public.menu_categories
  add constraint menu_categories_visible_weekdays_check
  check (
    visible_weekdays is null
    or (
      cardinality(visible_weekdays) between 1 and 7
      and visible_weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
    )
  );

comment on column public.menu_categories.visible_weekdays is
  'ISO weekdays (1=Mon..7=Sun) the category is orderable; NULL = every day. Combined with the time window.';

notify pgrst, 'reload schema';
