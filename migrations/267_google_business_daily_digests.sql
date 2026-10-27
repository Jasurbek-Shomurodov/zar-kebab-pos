-- Daily Google Maps digest: what the review bot and menu sync did each day.
--
-- The 04:10 review run saves `reviews`, the 04:20 menu sync saves `menu` and then sends
-- one Russian PNG to the Investor group (`salary_events`) alongside the daily reports.
-- `send_attempted_at` is claimed before sending, so an unknown outcome is held rather
-- than sent twice. Yesterday's row gives the rating and review-count change.

create table if not exists public.google_business_daily_digests (
  digest_date date primary key,
  reviews jsonb,
  menu jsonb,
  telegram_chat_id text,
  telegram_message_id bigint,
  send_attempted_at timestamptz,
  sent_at timestamptz,
  send_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Server-only: the service role bypasses RLS; no client policies.
alter table public.google_business_daily_digests enable row level security;
revoke all on table public.google_business_daily_digests from anon, authenticated;
