-- Frozen half-prepared meals are a separate retail line. Categories flagged
-- frozen_shop list only on the public /frozen-meals page; the public, Tourist,
-- Telegram, guest and Yandex/Google menus omit them. Staff can still sell them.

begin;

alter table public.menu_categories
  add column if not exists frozen_shop boolean not null default false;

commit;

notify pgrst, 'reload schema';
