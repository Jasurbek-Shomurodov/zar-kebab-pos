-- Optional one-off headline and bullet points for a Google Maps digest day
-- (e.g. the launch-day report). Daily runs leave them empty.

alter table public.google_business_daily_digests
  add column if not exists title text,
  add column if not exists highlights jsonb;
