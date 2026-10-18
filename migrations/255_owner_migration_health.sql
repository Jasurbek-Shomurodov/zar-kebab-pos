-- Owner-only migration health for the Settings "System health" button.
--
-- The browser cannot call the service-role get_database_migration_health()
-- or read app_schema_migrations. This wrapper lets an active owner compare
-- live function bodies, triggers, schedules and migration receipts with the
-- deployed frontend's migration manifest. Catalog metadata only: no recipe,
-- payroll or secret data.
begin;
set local lock_timeout = '5s';

create or replace function public.get_app_migration_health()
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  if not public.is_owner() then
    raise exception 'Owner access is required' using errcode = '42501';
  end if;
  return public.get_database_migration_health() || jsonb_build_object(
    'receipts', (select coalesce(jsonb_agg(jsonb_build_object('filename', m.filename, 'sha256', m.sha256)
      order by m.filename), '[]'::jsonb) from public.app_schema_migrations m));
end;
$$;
revoke all on function public.get_app_migration_health() from public, anon;
grant execute on function public.get_app_migration_health() to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
