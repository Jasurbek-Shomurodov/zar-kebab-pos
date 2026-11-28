-- Only active staff can list other profiles.
--
-- "Authenticated: read all profiles" allowed any signed-in account to read
-- every profile (emails, names, roles, feature access). /api/auth/register
-- lets anyone create a pending guest account, so a stranger could sign up and
-- list the whole team. Everyone keeps reading their own row (PendingApproval,
-- profile loading); other rows need an active owner/admin/viewer.
-- Server code uses the service role and is unaffected.

begin;
set local lock_timeout = '5s';

create or replace function public.current_user_is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid()
       and status = 'active'
       and role in ('owner', 'admin', 'viewer')
  );
$$;

revoke all on function public.current_user_is_active_staff() from public, anon, authenticated;
grant execute on function public.current_user_is_active_staff() to authenticated;

drop policy if exists "Authenticated: read all profiles" on public.profiles;
create policy "Staff: read profiles; everyone: own profile"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()) or (select public.current_user_is_active_staff()));

notify pgrst, 'reload schema';

commit;
