-- The Google Maps AI-bot report now joins the 04:05 Tashkent Team album (Team KPI,
-- unavailable dishes, Google Maps), so both Google jobs must finish before it:
--   replies   04:10 -> 03:40 Tashkent (22:40 UTC)
--   menu sync 04:20 -> 03:52 Tashkent (22:52 UTC); each run is capped at 5 minutes.
-- The Tashkent date is the same, so each day's digest row is unchanged.
-- The functions from 266_google_business_daily_sync.sql are reused as they are.

create extension if not exists pg_cron with schema pg_catalog;

do $$
declare
  existing_job_id bigint;
begin
  for existing_job_id in
    select jobid
    from cron.job
    where jobname in ('zar-kebab-google-review-replies', 'zar-kebab-google-menu-sync')
  loop
    perform cron.unschedule(existing_job_id);
  end loop;

  perform cron.schedule(
    'zar-kebab-google-review-replies',
    '40 22 * * *',
    'select public.invoke_zar_kebab_google_review_replies();'
  );

  perform cron.schedule(
    'zar-kebab-google-menu-sync',
    '52 22 * * *',
    'select public.invoke_zar_kebab_google_menu_sync();'
  );
end;
$$;
