-- Daily break-even target history.
--
-- business_settings keeps one current target, so charts drew that value as a
-- flat line over every past month. Each change is now kept with the Tashkent
-- date it takes effect, and Financial analysis draws the target that was in
-- effect for each period. Several changes on one day keep the last value.
-- Apply before the UI that reads this table.

begin;
set local lock_timeout = '5s';

create table if not exists public.business_break_even_target_history (
  effective_from date primary key,
  amount_uzs bigint not null check (amount_uzs >= 0),
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

alter table public.business_break_even_target_history enable row level security;

drop policy if exists "feature_access_read_break_even_target_history" on public.business_break_even_target_history;
create policy "feature_access_read_break_even_target_history"
  on public.business_break_even_target_history for select
  to authenticated
  using (public.current_staff_can_access_any(array['dashboard','financial_analysis','expenses','reports','settings']));

-- Writes only come from the business_settings trigger below.
revoke insert, update, delete on public.business_break_even_target_history from anon, authenticated;
grant select on public.business_break_even_target_history to authenticated;

create or replace function public.record_break_even_target_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
    and new.average_daily_break_even_income_uzs is not distinct from old.average_daily_break_even_income_uzs then
    return new;
  end if;
  insert into public.business_break_even_target_history (effective_from, amount_uzs, changed_by, changed_at)
  values (timezone('Asia/Tashkent', now())::date, new.average_daily_break_even_income_uzs, auth.uid(), now())
  on conflict (effective_from) do update
    set amount_uzs = excluded.amount_uzs,
        changed_by = excluded.changed_by,
        changed_at = excluded.changed_at;
  return new;
end;
$$;

drop trigger if exists business_settings_break_even_target_history on public.business_settings;
create trigger business_settings_break_even_target_history
  after insert or update of average_daily_break_even_income_uzs on public.business_settings
  for each row execute function public.record_break_even_target_change();

-- Seed: the column default (158) applied from the start; the current value
-- applies from the day settings were last saved when it differs.
insert into public.business_break_even_target_history (effective_from, amount_uzs, changed_at)
select timezone('Asia/Tashkent', s.created_at)::date, 10000000, s.created_at
from public.business_settings s
where s.id = 'default'
on conflict (effective_from) do nothing;

insert into public.business_break_even_target_history (effective_from, amount_uzs, changed_at)
select timezone('Asia/Tashkent', coalesce(s.updated_at, now()))::date, s.average_daily_break_even_income_uzs, coalesce(s.updated_at, now())
from public.business_settings s
where s.id = 'default'
  and s.average_daily_break_even_income_uzs <> 10000000
on conflict (effective_from) do update
  set amount_uzs = excluded.amount_uzs,
      changed_at = excluded.changed_at;

notify pgrst, 'reload schema';

commit;
