-- Owner switches for Tourist pricing. tourist_menu_enabled off: staff open
-- tables directly with Regular prices and /premium-menu redirects to /menu.
-- public_tourist_prices on: the public zarkebab.uz menu shows Tourist prices
-- (only while the Tourist menu is enabled). Saved orders keep their prices.

alter table public.business_settings
  add column if not exists tourist_menu_enabled boolean not null default true;

alter table public.business_settings
  add column if not exists public_tourist_prices boolean not null default false;

-- business_settings holds protected costs, so the public menu reads only these flags.
create or replace function public.public_menu_price_settings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'tourist_menu_enabled', coalesce(s.tourist_menu_enabled, true),
    'public_tourist_prices', coalesce(s.public_tourist_prices, false)
  )
  from (select 1) as one
  left join public.business_settings s on s.id = 'default';
$$;

revoke all on function public.public_menu_price_settings() from public;
grant execute on function public.public_menu_price_settings() to anon, authenticated;

notify pgrst, 'reload schema';
