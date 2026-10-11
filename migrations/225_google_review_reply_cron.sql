-- Reply to unanswered Google Maps reviews every day at 13:00 Asia/Tashkent.
--
-- Reuses the Vault secret created for 152_supabase_daily_report_cron.sql
-- (the same CRON_SECRET used by Vercel). The schedule is UTC: 08:00 UTC is
-- 13:00 in Asia/Tashkent. The endpoint only publishes replies when
-- GOOGLE_REVIEW_AUTO_PUBLISH=true and skips reviews that already have one.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.invoke_zar_kebab_google_review_replies()
returns bigint
language plpgsql
security definer
set search_path = public, vault, extensions, pg_temp
as $$
declare
  cron_secret text;
  request_id bigint;
begin
  select decrypted_secret
    into cron_secret
  from vault.decrypted_secrets
  where name = 'zar_kebab_daily_report_cron_secret'
  order by created_at desc
  limit 1;

  if nullif(btrim(cron_secret), '') is null then
    raise exception 'Missing Vault secret: zar_kebab_daily_report_cron_secret';
  end if;

  select net.http_get(
    url := 'https://www.zarkebab.uz/api/google-reviews/run',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || cron_secret,
      'Accept', 'application/json',
      'User-Agent', 'Zar-Kebab-Supabase-Cron/1.0'
    ),
    timeout_milliseconds := 300000
  )
  into request_id;

  return request_id;
end;
$$;

revoke all on function public.invoke_zar_kebab_google_review_replies() from public;
revoke all on function public.invoke_zar_kebab_google_review_replies() from anon;
revoke all on function public.invoke_zar_kebab_google_review_replies() from authenticated;

do $$
declare
  existing_job_id bigint;
begin
  for existing_job_id in
    select jobid
    from cron.job
    where jobname = 'zar-kebab-google-review-replies'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;

  perform cron.schedule(
    'zar-kebab-google-review-replies',
    '0 8 * * *',
    'select public.invoke_zar_kebab_google_review_replies();'
  );
end;
$$;
